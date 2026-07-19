import { recordAuditEvent } from '../audit/audit.service';
import type { SqlExec } from '../db/client';
import type { RulesEngine } from '../rules/rules-engine.service';
import { transitionApplication } from '../state/application-machine';
import { JourneyRuleError } from './entry.service';

/**
 * Short-form declaration D1–D8 (WP-04 §6): hospitalisation/surgery 5y;
 * ongoing medication; chronic disease history; planned treatment; pregnancy;
 * BMI outside 17–35; previous decline/loading; disability/congenital.
 */
export const DECLARATION_QUESTIONS = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8'] as const;
export type DeclarationQuestion = (typeof DECLARATION_QUESTIONS)[number];

export interface ConditionDetail {
  question: DeclarationQuestion;
  condition: string;
  sinceWhen?: string;
  medication?: string;
  hospitalisation?: boolean;
}

export interface DeclarationInput {
  applicationId: string;
  tenantId: string;
  actingUserId?: string;
  personId: string;
  answers: Record<DeclarationQuestion, boolean>;
  details?: ConditionDetail[];
  /** Full MAF content, mandatory when any positive answer is not auto-acceptable. */
  maf?: Record<string, unknown>;
  /** REG-050: explicit sensitive-data consent, separate from SC-01 consent. */
  sensitiveConsent: boolean;
  /** JB-06/UW-108: OTP attestation of the declaration by the insured. */
  attestationId?: string;
}

export type DeclarationStatus = 'clean' | 'auto_load' | 'refer' | 'decline';

export interface DeclarationOutcome {
  status: DeclarationStatus;
  loadingPct: number;
  /** UW-505: pregnancy declared → maternity waiting/exclusion notice. */
  pregnancyNotice: boolean;
  /** UW-502: positive answers not on the auto-accept list demand the full MAF. */
  mafRequired: boolean;
  allLivesDeclared: boolean;
}

interface AutoAcceptEntry {
  condition: string;
  loadingPct: number;
}

/**
 * SC-07 — declaration capture + UW-501..508 triage for one insured life.
 * Content goes to the TEN-002-locked store; only the STATUS (and loading %)
 * is visible outside underwriter/compliance.
 */
export async function submitDeclaration(
  exec: SqlExec,
  rules: RulesEngine,
  input: DeclarationInput,
): Promise<DeclarationOutcome> {
  if (!input.sensitiveConsent) {
    throw new JourneyRuleError('REG-050', 'explicit sensitive-data consent is required at SC-07');
  }

  const quote = await exec.query<{ product_code: string }>(
    `SELECT product_code FROM quotes WHERE application_id = $1 AND status = 'active'`,
    [input.applicationId],
  );
  if (quote.rows.length === 0) throw new JourneyRuleError('QR-005', 'no active quote');
  const product = await exec.query<{ declaration_required: boolean }>(
    'SELECT declaration_required FROM products WHERE code = $1',
    [quote.rows[0]!.product_code],
  );
  if (!product.rows[0]!.declaration_required) {
    // UW-206/304/403: community-rated base products take no declaration
    throw new JourneyRuleError('UW-206', 'this product does not require a health declaration');
  }

  const positives = DECLARATION_QUESTIONS.filter((q) => input.answers[q]);

  // Named conditions: detail sub-form entries, or the question key when the
  // insured gave no specific condition name
  const conditions =
    positives.length === 0
      ? []
      : positives.map(
          (q) => input.details?.find((d) => d.question === q)?.condition ?? `undetailed_${q}`,
        );

  const declineList = (rules.get<unknown[]>('UW_508_DECLINE_LIST') ?? []).filter(
    (c): c is string => typeof c === 'string',
  );
  const autoAccept = (rules.get<unknown[]>('UW_502_AUTO_ACCEPT_LIST') ?? []).filter(
    (e): e is AutoAcceptEntry =>
      typeof e === 'object' && e !== null && 'condition' in e && 'loadingPct' in e,
  );
  const loadingCap = rules.getNumber('UW_506_LOADING_CAP_PCT', 100);

  let status: DeclarationStatus;
  let loadingPct = 0;
  let mafRequired = false;

  if (positives.length === 0) {
    status = 'clean'; // UW-501
  } else if (conditions.some((c) => declineList.includes(c))) {
    status = 'decline'; // UW-508: decline-list condition (category: medical)
  } else {
    const matched = conditions.map((c) => autoAccept.find((e) => e.condition === c));
    if (matched.every((m) => m !== undefined)) {
      loadingPct = matched.reduce((s, m) => s + m!.loadingPct, 0);
      // UW-506: cumulative loading above the cap refers instead of auto-loading
      status = loadingPct > loadingCap ? 'refer' : 'auto_load';
      if (status === 'refer') mafRequired = true;
    } else {
      status = 'refer'; // UW-502: any non-auto-acceptable positive → full MAF + REFER
      mafRequired = true;
    }
  }

  if (mafRequired && !input.maf) {
    throw new JourneyRuleError('UW-502', 'full MAF is required for these declared conditions');
  }

  // Content into the TEN-002-locked store (write-only for the capturing channel)
  await exec.query(
    `INSERT INTO health_declarations (tenant_id, application_id, person_id, answers, attestation_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      input.tenantId,
      input.applicationId,
      input.personId,
      JSON.stringify({ answers: input.answers, details: input.details ?? [], maf: input.maf ?? null }),
      input.attestationId ?? null,
    ],
  );
  // Status only on the person (channel-visible)
  await exec.query(
    `UPDATE persons SET declaration_status = $1, declaration_loading_pct = $2 WHERE id = $3`,
    [status, loadingPct, input.personId],
  );

  const pregnancyNotice = Boolean(input.answers.D5); // UW-505

  await recordAuditEvent(exec, {
    tenantId: input.tenantId,
    actorUserId: input.actingUserId,
    action: 'declaration.submitted',
    entityType: 'person',
    entityId: input.personId,
    // status/loading only — answers NEVER enter the audit trail (TEN-002)
    after: { status, loadingPct, mafRequired, pregnancyNotice },
    ruleIds:
      status === 'clean'
        ? ['UW-501']
        : status === 'auto_load'
          ? ['UW-502', 'UW-506']
          : status === 'decline'
            ? ['UW-508']
            : ['UW-502'],
  });

  // quoted → declared once every life has a declaration status
  const pending = await exec.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM persons
     WHERE application_id = $1 AND declaration_status IS NULL`,
    [input.applicationId],
  );
  const allLivesDeclared = pending.rows[0]!.n === '0';
  if (allLivesDeclared) {
    const app = await exec.query<{ state: string }>(
      'SELECT state FROM applications WHERE id = $1',
      [input.applicationId],
    );
    if (app.rows[0]!.state === 'quoted') {
      await transitionApplication(exec, {
        applicationId: input.applicationId,
        tenantId: input.tenantId,
        actorUserId: input.actingUserId,
        from: 'quoted',
        to: 'declared',
      });
    }
  }

  return { status, loadingPct, pregnancyNotice, mafRequired, allLivesDeclared };
}
