import { recordAuditEvent } from '../audit/audit.service';
import type { SqlExec } from '../db/client';
import type { RulesEngine } from '../rules/rules-engine.service';
import { transitionApplication } from '../state/application-machine';
import { JourneyRuleError } from './entry.service';
import { generateQuote } from './quote.service';

export interface DecisionOutcome {
  outcome: 'stp' | 'refer' | 'decline';
  ruleIds: string[];
  caseId?: string;
  /** REF-023: regime-compliant alternative offered on decline. */
  alternativeProductCode?: string;
  customerCategory?: string;
}

const COMMUNITY_ALTERNATIVE: Record<string, string> = {
  federal: 'FED-BASIC',
  dubai: 'DXB-EBP',
  abu_dhabi: 'AD-BASIC',
};

function ageAt(dob: string | null, at: Date): number {
  if (!dob) return 30;
  return (at.getTime() - new Date(dob).getTime()) / (365.25 * 24 * 3600_000);
}

/**
 * S7 — the three-way decision matrix (WP-04 §7). Every application resolves
 * to exactly one of STP / REFER / DECLINE:
 * - DECLINE: decline-list condition (UW-508);
 * - REFER: age bands (UW-202/203 federal, UW-503 enhanced), restricted
 *   occupation (UW-207), non-auto-acceptable declaration (UW-502), BMI
 *   (UW-504), decline-cooling re-application (J-R3), any still-open case
 *   (REF-001: both queues must clear before issuance);
 * - STP: UW-208 / UW-308 / UW-405 / UW-510 — proceed to payment (PAY-003).
 */
export async function decide(
  exec: SqlExec,
  rules: RulesEngine,
  args: { applicationId: string; tenantId: string; actingUserId?: string; now?: Date },
): Promise<DecisionOutcome> {
  const now = args.now ?? new Date();
  const app = await exec.query<{
    state: string;
    regime: string;
    product_track: string;
    occupation: string | null;
    cooling_referral: boolean;
  }>(
    `SELECT state, regime, product_track, occupation, cooling_referral
     FROM applications WHERE id = $1`,
    [args.applicationId],
  );
  if (app.rows.length === 0) throw new Error('application not found');
  const a = app.rows[0]!;

  const quote = await exec.query<{ product_code: string }>(
    `SELECT product_code FROM quotes WHERE application_id = $1 AND status = 'active'`,
    [args.applicationId],
  );
  if (quote.rows.length === 0) throw new JourneyRuleError('QR-005', 'no active quote to decide on');
  const product = await exec.query<{ declaration_required: boolean }>(
    `SELECT declaration_required FROM products WHERE code = $1`,
    [quote.rows[0]!.product_code],
  );
  const declarationRequired = product.rows[0]!.declaration_required;

  // Community-rated sale skips SC-07: mark lives not_required, advance to declared
  if (a.state === 'quoted' && !declarationRequired) {
    await exec.query(
      `UPDATE persons SET declaration_status = 'not_required'
       WHERE application_id = $1 AND declaration_status IS NULL`,
      [args.applicationId],
    );
    await transitionApplication(exec, {
      applicationId: args.applicationId,
      tenantId: args.tenantId,
      actorUserId: args.actingUserId,
      from: 'quoted',
      to: 'declared',
    });
  } else if (a.state !== 'declared') {
    throw new JourneyRuleError('UW-108', `cannot decide from state '${a.state}'`);
  }

  const lives = await exec.query<{
    id: string;
    kind: string;
    dob: string | null;
    declaration_status: string | null;
    declaration_loading_pct: string;
  }>(
    `SELECT id, kind, dob, declaration_status, declaration_loading_pct
     FROM persons WHERE application_id = $1`,
    [args.applicationId],
  );

  const referRules: string[] = [];
  let medicalReportCase = false;

  // ---- DECLINE first (UW-508) ----
  if (lives.rows.some((l) => l.declaration_status === 'decline')) {
    return declineApplication(exec, args, a.regime, ['UW-508'], 'medical');
  }

  // ---- age rules per track ----
  for (const life of lives.rows) {
    const age = ageAt(life.dob, now);
    if (a.product_track === 'federal_basic') {
      if (age > 64) {
        referRules.push('UW-202'); // medical disclosure + reports → always REFER
        medicalReportCase = true;
      } else if (age < 1) {
        referRules.push('UW-203'); // newborn standalone pathway [VERIFY]
      }
    } else if (a.product_track === 'enhanced') {
      if (age > 65) referRules.push('UW-503');
      else if (age > 60) referRules.push('UW-503'); // 61–65 REFER [INSURER]
      else if (life.kind === 'applicant' && age < 18) referRules.push('UW-503');
    }
  }

  // ---- restricted occupation (UW-207, [INSURER] list) ----
  const restricted = (rules.get<unknown[]>('UW_207_RESTRICTED_OCCUPATIONS') ?? []).filter(
    (o): o is string => typeof o === 'string',
  );
  if (a.occupation && restricted.includes(a.occupation)) referRules.push('UW-207');

  // ---- declaration outcomes ----
  if (lives.rows.some((l) => l.declaration_status === 'refer')) {
    referRules.push('UW-502');
    medicalReportCase = true; // UW-502 with reports: 3-day SLA (REF-010)
  }

  // ---- J-R3 cooling ----
  if (a.cooling_referral) referRules.push('J-R3');

  // ---- open cases must clear before proceeding (REF-001) ----
  const openCases = await exec.query<{ id: string }>(
    `SELECT id FROM cases WHERE application_id = $1 AND state NOT IN ('closed')`,
    [args.applicationId],
  );
  if (openCases.rows.length > 0 && referRules.length === 0) referRules.push('REF-001');

  if (referRules.length > 0) {
    const slaDays = medicalReportCase
      ? rules.get<number>('REF_010_SLA_MEDICAL_REPORT_DAYS')
      : rules.get<number>('REF_010_SLA_STANDARD_UW_DAYS');
    const snapshot = {
      regime: a.regime,
      track: a.product_track,
      productCode: quote.rows[0]!.product_code,
      lives: lives.rows.map((l) => ({
        kind: l.kind,
        declarationStatus: l.declaration_status, // status only — never answers (TEN-002)
      })),
    };
    const c = await exec.query<{ id: string }>(
      `INSERT INTO cases (tenant_id, application_id, queue, trigger_rule_ids, sla_due_at, snapshot)
       VALUES ($1, $2, 'underwriting', $3, now() + ($4 || ' days')::interval, $5) RETURNING id`,
      [args.tenantId, args.applicationId, [...new Set(referRules)], String(slaDays), JSON.stringify(snapshot)],
    );
    await recordAuditEvent(exec, {
      tenantId: args.tenantId,
      actorUserId: args.actingUserId,
      action: 'uw.decision.refer',
      entityType: 'application',
      entityId: args.applicationId,
      after: { referRules: [...new Set(referRules)] },
      ruleIds: [...new Set(referRules)],
    });
    return { outcome: 'refer', ruleIds: [...new Set(referRules)], caseId: c.rows[0]!.id };
  }

  // ---- STP ----
  // Auto-loaded lives (UW-502/506): regenerate the FINAL quote with loadings
  const loadings: Record<string, number> = {};
  let hasLoadings = false;
  for (const l of lives.rows) {
    const pct = Number(l.declaration_loading_pct);
    if (l.declaration_status === 'auto_load' && pct > 0) {
      loadings[l.id] = pct;
      hasLoadings = true;
    }
  }
  if (hasLoadings) {
    await generateQuote(exec, {
      applicationId: args.applicationId,
      tenantId: args.tenantId,
      actingUserId: args.actingUserId,
      productCode: quote.rows[0]!.product_code,
      loadingPctByPerson: loadings,
      kindOverride: 'final',
    });
  }

  const stpRule =
    a.product_track === 'federal_basic'
      ? 'UW-208'
      : a.product_track === 'dubai_ebp'
        ? 'UW-308'
        : a.product_track === 'ad_basic'
          ? 'UW-405'
          : 'UW-510';
  await transitionApplication(exec, {
    applicationId: args.applicationId,
    tenantId: args.tenantId,
    actorUserId: args.actingUserId,
    from: 'declared',
    to: 'uw_decided',
  });
  await transitionApplication(exec, {
    applicationId: args.applicationId,
    tenantId: args.tenantId,
    actorUserId: args.actingUserId,
    from: 'uw_decided',
    to: 'payment_pending',
  });
  await recordAuditEvent(exec, {
    tenantId: args.tenantId,
    actorUserId: args.actingUserId,
    action: 'uw.decision.stp',
    entityType: 'application',
    entityId: args.applicationId,
    after: { stpRule, loadingsApplied: hasLoadings },
    ruleIds: [stpRule],
  });
  return { outcome: 'stp', ruleIds: [stpRule] };
}

async function declineApplication(
  exec: SqlExec,
  args: { applicationId: string; tenantId: string; actingUserId?: string },
  regime: string,
  ruleIds: string[],
  category: 'medical' | 'eligibility' | 'verification',
): Promise<DecisionOutcome> {
  await exec.query(
    `UPDATE applications SET decline_reason = $1, updated_at = now() WHERE id = $2`,
    [category, args.applicationId],
  );
  await transitionApplication(exec, {
    applicationId: args.applicationId,
    tenantId: args.tenantId,
    actorUserId: args.actingUserId,
    from: 'declared',
    to: 'uw_decided',
  });
  await transitionApplication(exec, {
    applicationId: args.applicationId,
    tenantId: args.tenantId,
    actorUserId: args.actingUserId,
    from: 'uw_decided',
    to: 'declined',
  });
  // J-R3: EID-keyed cooling record
  const applicant = await exec.query<{ eid: string | null }>(
    `SELECT eid FROM persons WHERE application_id = $1 AND kind = 'applicant'`,
    [args.applicationId],
  );
  if (applicant.rows[0]?.eid) {
    await exec.query(
      `INSERT INTO decline_records (eid, application_id, reason_category) VALUES ($1, $2, $3)`,
      [applicant.rows[0].eid, args.applicationId, category],
    );
  }
  // REF-023: offer the regime-compliant community alternative where the
  // failed criterion (medical rating) does not apply. Eligibility for the
  // alternative is re-checked on the new application.
  const alternativeProductCode = category === 'medical' ? COMMUNITY_ALTERNATIVE[regime] : undefined;
  await recordAuditEvent(exec, {
    tenantId: args.tenantId,
    actorUserId: args.actingUserId,
    action: 'uw.decision.decline',
    entityType: 'application',
    entityId: args.applicationId,
    after: { category, alternativeProductCode },
    ruleIds: [...ruleIds, 'REF-023', 'J-R3'],
  });
  return {
    outcome: 'decline',
    ruleIds,
    alternativeProductCode,
    customerCategory: category, // J-R4
  };
}

// ---------------------------------------------------------------- WP-08 flow

/**
 * REF-020/021/023/024 — insurer underwriter decision on a referral case.
 * The portal records and routes; it never alters an insurer decision. Case
 * reads/writes run in the underwriter's context (`exec`); the resulting
 * application-state effects run in the engine's system context (`system`) —
 * the underwriter role holds no write access to journey data (WP-09).
 */
export async function underwriterDecide(
  exec: SqlExec,
  system: <T>(fn: (tx: SqlExec) => Promise<T>) => Promise<T>,
  rules: RulesEngine,
  args: {
    caseId: string;
    tenantId: string;
    actorUserId: string;
    decision: 'accept' | 'accept_with_terms' | 'decline';
    rationale: string;
    loadingPct?: number;
    exclusionText?: string;
  },
): Promise<{ outcome: string; counterOfferId?: string; alternativeProductCode?: string }> {
  const c = await exec.query<{ application_id: string; queue: string; state: string }>(
    'SELECT application_id, queue, state FROM cases WHERE id = $1',
    [args.caseId],
  );
  if (c.rows.length === 0) throw new Error('case not found');
  if (c.rows[0]!.queue !== 'underwriting') throw new JourneyRuleError('REF-001', 'not a UW case');
  const applicationId = c.rows[0]!.application_id;

  // REF-003 path: created → in_review → decided → closed
  if (c.rows[0]!.state === 'created') {
    await exec.query(`UPDATE cases SET state = 'in_review', updated_at = now() WHERE id = $1`, [
      args.caseId,
    ]);
  }
  await exec.query(
    `UPDATE cases SET state = 'decided', decision = $1, decided_by = $2, rationale = $3,
       updated_at = now() WHERE id = $4`,
    [args.decision, args.actorUserId, args.rationale, args.caseId],
  );

  const app = await exec.query<{ regime: string; tenant_id: string }>(
    'SELECT regime, tenant_id FROM applications WHERE id = $1',
    [applicationId],
  );
  if (app.rows.length === 0) throw new Error('referred application not visible');
  const channelTenant = app.rows[0]!.tenant_id;
  const regime = app.rows[0]!.regime;

  if (args.decision === 'accept') {
    await exec.query(`UPDATE cases SET state = 'closed', updated_at = now() WHERE id = $1`, [
      args.caseId,
    ]);
    await system(async (tx) => {
      await transitionApplication(tx, {
        applicationId,
        tenantId: channelTenant,
        actorUserId: args.actorUserId,
        from: 'declared',
        to: 'uw_decided',
      });
      await transitionApplication(tx, {
        applicationId,
        tenantId: channelTenant,
        actorUserId: args.actorUserId,
        from: 'uw_decided',
        to: 'payment_pending', // REF-020: PAY-003 window restarts
      });
    });
    return { outcome: 'accepted' };
  }

  if (args.decision === 'decline') {
    await exec.query(`UPDATE cases SET state = 'closed', updated_at = now() WHERE id = $1`, [
      args.caseId,
    ]);
    const result = await system((tx) =>
      declineApplication(
        tx,
        { applicationId, tenantId: channelTenant, actingUserId: args.actorUserId },
        regime,
        ['REF-023', 'REF-024'],
        'medical',
      ),
    );
    return { outcome: 'declined', alternativeProductCode: result.alternativeProductCode };
  }

  // accept_with_terms → counter-offer (UW-506/507, REF-021/022)
  const counterOfferId = await system(async (tx) => {
    const activeQuote = await tx.query<{ product_code: string }>(
      `SELECT product_code FROM quotes WHERE application_id = $1 AND status = 'active'`,
      [applicationId],
    );
    const lives = await tx.query<{ id: string }>(
      `SELECT id FROM persons WHERE application_id = $1`,
      [applicationId],
    );
    const loadings: Record<string, number> = {};
    for (const l of lives.rows) loadings[l.id] = args.loadingPct ?? 0;
    const revised = await generateQuote(tx, {
      applicationId,
      tenantId: channelTenant,
      actingUserId: args.actorUserId,
      productCode: activeQuote.rows[0]!.product_code,
      loadingPctByPerson: loadings,
      kindOverride: 'final',
    });
    const validityDays = rules.get<number>('REF_022_COUNTER_OFFER_VALIDITY_DAYS');
    const offer = await tx.query<{ id: string }>(
      `INSERT INTO counter_offers (tenant_id, application_id, case_id, loading_pct, exclusion_text,
                                   quote_id, valid_until)
       VALUES ($1, $2, $3, $4, $5, $6, now() + ($7 || ' days')::interval) RETURNING id`,
      [
        channelTenant,
        applicationId,
        args.caseId,
        args.loadingPct ?? 0,
        args.exclusionText ?? null,
        revised.quoteId,
        String(validityDays),
      ],
    );
    await recordAuditEvent(tx, {
      tenantId: channelTenant,
      actorUserId: args.actorUserId,
      action: 'uw.counter_offer.created',
      entityType: 'counter_offer',
      entityId: offer.rows[0]!.id,
      after: { loadingPct: args.loadingPct, exclusion: Boolean(args.exclusionText) },
      ruleIds: ['UW-506', 'UW-507', 'REF-021', 'REF-022'],
    });
    return offer.rows[0]!.id;
  });
  return { outcome: 'counter_offered', counterOfferId };
}

/**
 * REF-021 — customer positively accepts the counter-offer via OTP
 * attestation; acceptance is contract evidence; then payment (REF-020).
 */
export async function acceptCounterOffer(
  exec: SqlExec,
  args: { counterOfferId: string; tenantId: string; attestationId: string; actingUserId?: string },
): Promise<{ outcome: 'accepted' | 'lapsed' }> {
  const offer = await exec.query<{
    application_id: string;
    case_id: string;
    valid_until: string;
    status: string;
  }>('SELECT application_id, case_id, valid_until, status FROM counter_offers WHERE id = $1', [
    args.counterOfferId,
  ]);
  if (offer.rows.length === 0) throw new Error('counter-offer not found');
  const o = offer.rows[0]!;
  if (o.status !== 'offered') throw new JourneyRuleError('REF-022', `counter-offer is ${o.status}`);

  const attestation = await exec.query<{ purpose: string }>(
    'SELECT purpose FROM attestations WHERE id = $1',
    [args.attestationId],
  );
  if (attestation.rows[0]?.purpose !== 'counter_offer') {
    throw new JourneyRuleError('REF-021', 'counter-offer acceptance requires OTP attestation');
  }

  if (new Date(o.valid_until).getTime() < Date.now()) {
    // REF-022: expiry → case closes as lapsed counter-offer (re-application allowed)
    await exec.query(
      `UPDATE counter_offers SET status = 'lapsed', updated_at = now() WHERE id = $1`,
      [args.counterOfferId],
    );
    await exec.query(
      `UPDATE cases SET state = 'closed', updated_at = now() WHERE id = $1`,
      [o.case_id],
    );
    return { outcome: 'lapsed' };
  }

  await exec.query(
    `UPDATE counter_offers SET status = 'accepted', attestation_id = $1, updated_at = now()
     WHERE id = $2`,
    [args.attestationId, args.counterOfferId],
  );
  await exec.query(`UPDATE cases SET state = 'closed', updated_at = now() WHERE id = $1`, [
    o.case_id,
  ]);
  await transitionApplication(exec, {
    applicationId: o.application_id,
    tenantId: args.tenantId,
    actorUserId: args.actingUserId,
    from: 'declared',
    to: 'uw_decided',
  });
  await transitionApplication(exec, {
    applicationId: o.application_id,
    tenantId: args.tenantId,
    actorUserId: args.actingUserId,
    from: 'uw_decided',
    to: 'payment_pending',
  });
  await recordAuditEvent(exec, {
    tenantId: args.tenantId,
    actorUserId: args.actingUserId,
    action: 'uw.counter_offer.accepted',
    entityType: 'counter_offer',
    entityId: args.counterOfferId,
    ruleIds: ['REF-021'],
  });
  return { outcome: 'accepted' };
}
