import { recordAuditEvent } from '../audit/audit.service';
import type { SqlExec } from '../db/client';
import type { RulesEngine } from '../rules/rules-engine.service';
import { JourneyRuleError } from './entry.service';
import type { SystemRunner } from './identity.service';

export type EndorsementType =
  | 'eid_addition'
  | 'name_correction'
  | 'newborn_addition'
  | 'dependent_addition'
  | 'dependent_removal'
  | 'contact_change'
  | 'plan_upgrade'
  | 'regime_change';

/**
 * END-001/002 — endorsement request capture. The insurer issues every
 * endorsement (REG-003); the portal validates, prices pro-rata where premium
 * applies (END-003), and routes UW-relevant corrections to referral (END-004).
 */
export async function requestEndorsement(
  exec: SqlExec,
  args: {
    tenantId: string;
    policyId: string;
    type: EndorsementType;
    detail?: Record<string, unknown>;
    actingUserId?: string;
    now?: Date;
  },
): Promise<{
  endorsementId: string;
  status: string;
  additionalPremium?: number;
  newbornSlaWarning?: boolean;
  caseId?: string;
}> {
  const now = args.now ?? new Date();
  const policy = await exec.query<{
    id: string;
    application_id: string;
    status: string;
    start_date: string;
    end_date: string;
  }>('SELECT id, application_id, status, start_date, end_date FROM policies WHERE id = $1', [
    args.policyId,
  ]);
  if (policy.rows.length === 0) throw new Error('policy not found');
  const p = policy.rows[0]!;

  // END-002(f): no mid-term plan upgrade in v1 — anti-selection control
  if (args.type === 'plan_upgrade') {
    throw new JourneyRuleError('END-002', 'plan upgrade is available at renewal only in v1');
  }

  let status = 'requested';
  let additionalPremium: number | undefined;
  let newbornSlaWarning = false;
  let caseId: string | undefined;
  const ruleIds: string[] = ['END-001', 'END-002'];

  if (args.type === 'newborn_addition') {
    const dob = args.detail?.dob ? new Date(String(args.detail.dob)) : undefined;
    if (!dob) throw new JourneyRuleError('END-002', 'newborn date of birth required');
    const ageDays = (now.getTime() - dob.getTime()) / (24 * 3600_000);
    // REG-024: hard SLA 30 days (Dubai); engine warns from day 20
    newbornSlaWarning = ageDays >= 20;
    ruleIds.push('REG-024');
    additionalPremium = await prorataPremium(exec, p, now);
    status = 'priced'; // END-003: effective on payment + registration update
  } else if (args.type === 'dependent_addition') {
    additionalPremium = await prorataPremium(exec, p, now);
    status = 'priced';
    ruleIds.push('END-003');
  } else if (args.type === 'name_correction' && args.detail?.affectsUnderwriting) {
    // END-004: corrections that would have changed the UW outcome → REFER
    const c = await exec.query<{ id: string }>(
      `INSERT INTO cases (tenant_id, application_id, queue, trigger_rule_ids)
       VALUES ($1, $2, 'underwriting', '{END-004}') RETURNING id`,
      [args.tenantId, p.application_id],
    );
    caseId = c.rows[0]!.id;
    status = 'referred';
    ruleIds.push('END-004');
  } else if (args.type === 'eid_addition') {
    // KYC-002 completion: resolve the END-002a ops task
    await exec.query(
      `UPDATE ops_tickets SET status = 'resolved', updated_at = now()
       WHERE application_id = $1 AND type = 'eid_endorsement_due' AND status = 'open'`,
      [p.application_id],
    );
    ruleIds.push('KYC-002');
  }

  const inserted = await exec.query<{ id: string }>(
    `INSERT INTO endorsements (tenant_id, policy_id, type, status, detail, additional_premium)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [
      args.tenantId,
      args.policyId,
      args.type,
      status,
      JSON.stringify(args.detail ?? {}),
      additionalPremium ?? null,
    ],
  );
  await recordAuditEvent(exec, {
    tenantId: args.tenantId,
    actorUserId: args.actingUserId,
    action: `endorsement.${args.type}.${status}`,
    entityType: 'endorsement',
    entityId: inserted.rows[0]!.id,
    after: { additionalPremium, newbornSlaWarning },
    ruleIds,
  });
  return { endorsementId: inserted.rows[0]!.id, status, additionalPremium, newbornSlaWarning, caseId };
}

/** END-003: pro-rata for the remaining term on the active quote's per-life rate. */
async function prorataPremium(
  exec: SqlExec,
  policy: { application_id: string; start_date: string; end_date: string },
  now: Date,
): Promise<number> {
  const quote = await exec.query<{ breakdown: { lines: { base: number }[] } }>(
    `SELECT breakdown FROM quotes WHERE application_id = $1 AND status = 'active'`,
    [policy.application_id],
  );
  const perLife = quote.rows[0]?.breakdown.lines[0]?.base ?? 0;
  const termMs = new Date(policy.end_date).getTime() - new Date(policy.start_date).getTime();
  const remainingMs = Math.max(0, new Date(policy.end_date).getTime() - now.getTime());
  return Math.round(perLife * (remainingMs / termMs) * 100) / 100;
}

interface RefundRule {
  preRegistrationFullRefund: boolean;
  minEarnedPremiumAed: number;
  basis: 'pro_rata' | 'short_rate';
}

/**
 * END-011 — refund computation per the insurer's filed table [INSURER]
 * (config END_011_REFUND_TABLE; dev default: full refund pre-registration,
 * pro-rata with minimum earned premium after activation).
 */
export async function computeRefund(
  exec: SqlExec,
  rules: RulesEngine,
  args: { policyId: string; now?: Date },
): Promise<{ refund: number; basis: string }> {
  const now = args.now ?? new Date();
  const policy = await exec.query<{
    application_id: string;
    status: string;
    start_date: string;
    end_date: string;
  }>('SELECT application_id, status, start_date, end_date FROM policies WHERE id = $1', [
    args.policyId,
  ]);
  const p = policy.rows[0]!;
  const quote = await exec.query<{ premium_aed: string }>(
    `SELECT premium_aed FROM quotes WHERE application_id = $1 AND status = 'active'`,
    [p.application_id],
  );
  const premium = Number(quote.rows[0]!.premium_aed);

  const configured = rules.get<unknown>('END_011_REFUND_TABLE');
  const rule: RefundRule =
    typeof configured === 'object' && configured !== null && 'basis' in configured
      ? (configured as RefundRule)
      : { preRegistrationFullRefund: true, minEarnedPremiumAed: 100, basis: 'pro_rata' };

  if (p.status === 'issued' && rule.preRegistrationFullRefund) {
    return { refund: premium, basis: 'full_pre_registration' };
  }
  const termMs = new Date(p.end_date).getTime() - new Date(p.start_date).getTime();
  const usedMs = Math.min(termMs, Math.max(0, now.getTime() - new Date(p.start_date).getTime()));
  const earned = Math.max(rule.minEarnedPremiumAed, premium * (usedMs / termMs));
  return { refund: Math.max(0, Math.round((premium - earned) * 100) / 100), basis: rule.basis };
}

/**
 * END-010..015 — cancellation: reason captured, computed refund displayed
 * before confirm, visa warning acknowledged, clawback cascade, abuse control.
 */
export async function requestCancellation(
  exec: SqlExec,
  system: SystemRunner,
  rules: RulesEngine,
  args: {
    tenantId: string;
    policyId: string;
    reason: 'leaving_uae' | 'employer_cover' | 'switched_insurer' | 'visa_cancelled' | 'dissatisfaction' | 'other';
    visaWarningAcknowledged: boolean;
    replacementPolicyNumber?: string;
    actingUserId?: string;
  },
): Promise<{ cancellationId: string; refund: number; basis: string; eddCaseId?: string }> {
  if (!args.visaWarningAcknowledged) {
    // END-012: cancelling visa-linked cover can invalidate the visa
    throw new JourneyRuleError(
      'END-012',
      'the mandatory-cover visa warning must be acknowledged before cancellation',
    );
  }
  const { refund, basis } = await computeRefund(exec, rules, { policyId: args.policyId });
  const inserted = await exec.query<{ id: string }>(
    `INSERT INTO cancellations (tenant_id, policy_id, reason, refund_computed, refund_basis,
                                visa_warning_acknowledged, replacement_policy_number)
     VALUES ($1, $2, $3, $4, $5, true, $6) RETURNING id`,
    [args.tenantId, args.policyId, args.reason, refund, basis, args.replacementPolicyNumber ?? null],
  );
  await exec.query(`UPDATE policies SET status = 'cancelled' WHERE id = $1`, [args.policyId]);

  // END-014 / QR-022: clawback cascade
  await system(async (tx) => {
    await tx.query(
      `UPDATE commission_receivable SET status = 'clawed' WHERE policy_id = $1`,
      [args.policyId],
    );
    await tx.query(`UPDATE payout_payable SET status = 'clawed' WHERE policy_id = $1`, [
      args.policyId,
    ]);
  });

  // END-015: ≥2 purchase-cancel-refund cycles by the same EID in 12 months
  let eddCaseId: string | undefined;
  const applicant = await exec.query<{ eid: string | null; application_id: string }>(
    `SELECT p.eid, pol.application_id FROM policies pol
       JOIN persons p ON p.application_id = pol.application_id AND p.kind = 'applicant'
     WHERE pol.id = $1`,
    [args.policyId],
  );
  const eid = applicant.rows[0]?.eid;
  if (eid) {
    const cycles = await system((tx) =>
      tx.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM cancellations c
           JOIN policies pol ON pol.id = c.policy_id
           JOIN persons per ON per.application_id = pol.application_id AND per.kind = 'applicant'
         WHERE per.eid = $1 AND c.created_at > now() - interval '12 months'`,
        [eid],
      ),
    );
    if (Number(cycles.rows[0]!.n) >= 2) {
      await system((tx) =>
        tx.query(
          `INSERT INTO purchase_blocks (eid, reason) VALUES ($1, 'END-015 refund abuse pattern')
           ON CONFLICT (eid) DO NOTHING`,
          [eid],
        ),
      );
      const c = await exec.query<{ id: string }>(
        `INSERT INTO cases (tenant_id, application_id, queue, trigger_rule_ids)
         VALUES ($1, $2, 'compliance', '{END-015,KYC-020}') RETURNING id`,
        [args.tenantId, applicant.rows[0]!.application_id],
      );
      eddCaseId = c.rows[0]!.id;
    }
  }

  await recordAuditEvent(exec, {
    tenantId: args.tenantId,
    actorUserId: args.actingUserId,
    action: 'policy.cancellation_requested',
    entityType: 'policy',
    entityId: args.policyId,
    after: { reason: args.reason, refund, basis },
    ruleIds: ['END-010', 'END-011', 'END-012', 'END-014'],
  });
  return { cancellationId: inserted.rows[0]!.id, refund, basis, eddCaseId };
}

/**
 * END-020/021 — renewal notices at 60/30/7 days and lapse sweep.
 */
export async function renewalNotices(
  exec: SqlExec,
  now = new Date(),
): Promise<{ policyId: string; daysToExpiry: number }[]> {
  const rows = await exec.query<{ id: string; end_date: string }>(
    `SELECT id, end_date FROM policies WHERE status IN ('registered','delivered')`,
  );
  const notices: { policyId: string; daysToExpiry: number }[] = [];
  for (const p of rows.rows) {
    const days = Math.ceil((new Date(p.end_date).getTime() - now.getTime()) / (24 * 3600_000));
    if ([60, 30, 7].includes(days)) notices.push({ policyId: p.id, daysToExpiry: days });
  }
  return notices;
}

export async function lapseSweep(exec: SqlExec, now = new Date()): Promise<number> {
  const rows = await exec.query<{ id: string }>(
    `UPDATE policies SET status = 'cancelled'
     WHERE status IN ('registered','delivered') AND end_date < $1 RETURNING id`,
    [now.toISOString().slice(0, 10)],
  );
  for (const p of rows.rows) {
    await recordAuditEvent(exec, {
      action: 'policy.lapsed',
      entityType: 'policy',
      entityId: p.id,
      ruleIds: ['END-021'],
    });
  }
  return rows.rows.length;
}

/**
 * END-020 — one-tap renewal: re-runs eligibility (age band may have shifted)
 * against the CURRENT rate table. Returns the renewal decision + new price;
 * payment/issuance then follow the normal engine path on a new application.
 */
export async function evaluateRenewal(
  exec: SqlExec,
  rules: RulesEngine,
  args: { policyId: string; now?: Date },
): Promise<{ outcome: 'stp' | 'refer'; newAnnualPremium?: number; ruleIds: string[] }> {
  const now = args.now ?? new Date();
  const policy = await exec.query<{ application_id: string }>(
    'SELECT application_id FROM policies WHERE id = $1',
    [args.policyId],
  );
  const app = await exec.query<{ product_track: string }>(
    'SELECT product_track FROM applications WHERE id = $1',
    [policy.rows[0]!.application_id],
  );
  const lives = await exec.query<{ dob: string | null }>(
    'SELECT dob FROM persons WHERE application_id = $1',
    [policy.rows[0]!.application_id],
  );
  const quote = await exec.query<{ product_code: string }>(
    `SELECT product_code FROM quotes WHERE application_id = $1 AND status = 'active'`,
    [policy.rows[0]!.application_id],
  );

  const ruleIds: string[] = ['END-020'];
  let refer = false;
  for (const life of lives.rows) {
    const age = life.dob
      ? (now.getTime() - new Date(life.dob).getTime()) / (365.25 * 24 * 3600_000)
      : 30;
    if (app.rows[0]!.product_track === 'federal_basic' && age > 64) {
      refer = true;
      ruleIds.push('UW-202');
    }
    if (app.rows[0]!.product_track === 'enhanced' && age > 60) {
      refer = true;
      ruleIds.push('UW-503');
    }
  }
  if (refer) return { outcome: 'refer', ruleIds };

  const rate = await exec.query<{ matrix: { ratePerLife?: number; fees: number } }>(
    `SELECT matrix FROM rate_tables WHERE product_code = $1 AND status = 'active'
     ORDER BY effective_from DESC LIMIT 1`,
    [quote.rows[0]!.product_code],
  );
  const perLife = rate.rows[0]!.matrix.ratePerLife ?? 0;
  const net = perLife * lives.rows.length + rate.rows[0]!.matrix.fees;
  void rules;
  return {
    outcome: 'stp',
    newAnnualPremium: Math.round(net * 1.05 * 100) / 100, // + VAT (REG-062)
    ruleIds,
  };
}
