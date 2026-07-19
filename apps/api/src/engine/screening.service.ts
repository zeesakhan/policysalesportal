import { recordAuditEvent } from '../audit/audit.service';
import type { SqlExec } from '../db/client';
import type { ScreeningPort } from '../integrations/screening/port';
import { transitionApplication } from '../state/application-machine';
import type { SystemRunner } from './identity.service';

export interface ScreeningOutcome {
  outcome: 'clear' | 'hold' | 'declined';
  caseId?: string;
  /** KYC-013: the only customer-visible wording on holds. */
  customerCategory?: 'verification';
}

/**
 * S4 — sanctions screening (KYC-010..013, UW-106). Screens the applicant,
 * every dependent life, and the payer if different. Fires early (SC-03 note:
 * result ready before quote acceptance). Clear → application moves to
 * 'screened'. Potential match → compliance hold (case). Confirmed match →
 * DECLINE + freeze + STR consideration record.
 */
export async function runScreening(
  exec: SqlExec,
  system: SystemRunner,
  screening: ScreeningPort,
  args: { applicationId: string; tenantId: string; actingUserId?: string },
): Promise<ScreeningOutcome> {
  const app = await exec.query<{ payer_name: string | null; state: string }>(
    'SELECT payer_name, state FROM applications WHERE id = $1',
    [args.applicationId],
  );
  if (app.rows.length === 0) throw new Error(`application ${args.applicationId} not found`);

  const lives = await exec.query<{ id: string; full_name: string; nationality: string | null }>(
    'SELECT id, full_name, nationality FROM persons WHERE application_id = $1',
    [args.applicationId],
  );
  const subjects: { personId: string | null; name: string; nationality?: string }[] = lives.rows.map(
    (p) => ({ personId: p.id, name: p.full_name, nationality: p.nationality ?? undefined }),
  );
  const payer = app.rows[0]!.payer_name;
  if (payer && !subjects.some((s) => s.name === payer)) {
    subjects.push({ personId: null, name: payer }); // KYC-010: payer screened too
  }

  let worst: 'clear' | 'potential_match' | 'confirmed_match' = 'clear';
  for (const subject of subjects) {
    const result = await screening.screen({ fullName: subject.name, nationality: subject.nationality });
    let status: string = result.status;
    if (result.status === 'potential_match') {
      // KYC-012: false-positive whitelist suppresses repeat friction
      const whitelisted = await system((tx) =>
        tx.query<{ id: string }>('SELECT id FROM screening_whitelist WHERE full_name = $1', [
          subject.name,
        ]),
      );
      if (whitelisted.rows.length > 0) status = 'whitelisted';
    }
    await exec.query(
      `INSERT INTO screening_results (tenant_id, application_id, person_id, subject_name, status, hits)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        args.tenantId,
        args.applicationId,
        subject.personId,
        subject.name,
        status,
        result.hits ? JSON.stringify(result.hits) : null,
      ],
    );
    if (status === 'confirmed_match') worst = 'confirmed_match';
    else if (status === 'potential_match' && worst === 'clear') worst = 'potential_match';
  }

  await exec.query(`UPDATE applications SET screened_at = now(), updated_at = now() WHERE id = $1`, [
    args.applicationId,
  ]);
  await recordAuditEvent(exec, {
    tenantId: args.tenantId,
    actorUserId: args.actingUserId,
    action: 'screening.completed',
    entityType: 'application',
    entityId: args.applicationId,
    after: { subjects: subjects.length, worst },
    ruleIds: ['KYC-010', 'KYC-011', 'UW-106'],
  });

  if (worst === 'confirmed_match') {
    // UW-106/KYC-012: confirmed match → DECLINE + freeze; STR consideration
    // routes to the compliance officer for goAML filing (REG-042, KYC-031)
    await exec.query(
      `UPDATE applications SET decline_reason = 'verification', updated_at = now() WHERE id = $1`,
      [args.applicationId],
    );
    await transitionApplication(exec, {
      applicationId: args.applicationId,
      tenantId: args.tenantId,
      actorUserId: args.actingUserId,
      from: 'draft',
      to: 'declined',
    });
    await recordAuditEvent(exec, {
      tenantId: args.tenantId,
      action: 'screening.str_consideration_raised',
      entityType: 'application',
      entityId: args.applicationId,
      ruleIds: ['REG-042', 'KYC-031'],
    });
    return { outcome: 'declined', customerCategory: 'verification' };
  }

  if (worst === 'potential_match') {
    // KYC-012: fuzzy match → compliance queue (never underwriting)
    const c = await exec.query<{ id: string }>(
      `INSERT INTO cases (tenant_id, application_id, queue, trigger_rule_ids)
       VALUES ($1, $2, 'compliance', '{UW-106,KYC-012}') RETURNING id`,
      [args.tenantId, args.applicationId],
    );
    return { outcome: 'hold', caseId: c.rows[0]!.id, customerCategory: 'verification' };
  }

  // all clear (or whitelisted) → eligibility gate passes
  if (app.rows[0]!.state === 'draft') {
    await transitionApplication(exec, {
      applicationId: args.applicationId,
      tenantId: args.tenantId,
      actorUserId: args.actingUserId,
      from: 'draft',
      to: 'screened',
    });
  }
  return { outcome: 'clear' };
}

/**
 * Compliance-officer disposition of a screening hold (KYC-012): within 1
 * business day (REF-010). False positive → whitelist note + case closed +
 * application proceeds. Confirmed → decline + freeze.
 */
export async function resolveScreeningHold(
  exec: SqlExec,
  args: {
    caseId: string;
    tenantId: string;
    actorUserId?: string;
    disposition: 'false_positive' | 'confirmed';
    note: string;
  },
): Promise<{ outcome: 'cleared' | 'declined' }> {
  const c = await exec.query<{ application_id: string; queue: string }>(
    'SELECT application_id, queue FROM cases WHERE id = $1',
    [args.caseId],
  );
  if (c.rows.length === 0) throw new Error(`case ${args.caseId} not found`);
  if (c.rows[0]!.queue !== 'compliance') throw new Error('REF-001: not a compliance case');
  const applicationId = c.rows[0]!.application_id;

  if (args.disposition === 'false_positive') {
    const subjects = await exec.query<{ subject_name: string }>(
      `SELECT DISTINCT subject_name FROM screening_results
       WHERE application_id = $1 AND status = 'potential_match'`,
      [applicationId],
    );
    for (const s of subjects.rows) {
      await exec.query(`INSERT INTO screening_whitelist (full_name, note) VALUES ($1, $2)`, [
        s.subject_name,
        args.note,
      ]);
    }
    await exec.query(
      `UPDATE screening_results SET status = 'whitelisted', disposition_note = $2
       WHERE application_id = $1 AND status = 'potential_match'`,
      [applicationId, args.note],
    );
    await exec.query(
      `UPDATE cases SET state = 'closed', decision = 'accept', updated_at = now() WHERE id = $1`,
      [args.caseId],
    );
    await transitionApplication(exec, {
      applicationId,
      tenantId: args.tenantId,
      actorUserId: args.actorUserId,
      from: 'draft',
      to: 'screened',
    });
    await recordAuditEvent(exec, {
      tenantId: args.tenantId,
      actorUserId: args.actorUserId,
      action: 'screening.hold_cleared_false_positive',
      entityType: 'application',
      entityId: applicationId,
      ruleIds: ['KYC-012'],
    });
    return { outcome: 'cleared' };
  }

  await exec.query(
    `UPDATE applications SET decline_reason = 'verification', updated_at = now() WHERE id = $1`,
    [applicationId],
  );
  await exec.query(
    `UPDATE cases SET state = 'closed', decision = 'decline', updated_at = now() WHERE id = $1`,
    [args.caseId],
  );
  await transitionApplication(exec, {
    applicationId,
    tenantId: args.tenantId,
    actorUserId: args.actorUserId,
    from: 'draft',
    to: 'declined',
  });
  await recordAuditEvent(exec, {
    tenantId: args.tenantId,
    actorUserId: args.actorUserId,
    action: 'screening.hold_confirmed_declined',
    entityType: 'application',
    entityId: applicationId,
    ruleIds: ['UW-106', 'KYC-012', 'REG-042'],
  });
  return { outcome: 'declined' };
}

/**
 * KYC-020: EDD trigger — one payer paying for ≥ 3 unrelated insureds
 * (possible unlicensed group intermediation, KYC-004). Returns a case id when
 * an EDD compliance case was raised.
 */
export async function checkEddTriggers(
  exec: SqlExec,
  system: SystemRunner,
  args: { applicationId: string; tenantId: string },
): Promise<{ eddCaseId?: string }> {
  const app = await exec.query<{ payer_name: string | null }>(
    'SELECT payer_name FROM applications WHERE id = $1',
    [args.applicationId],
  );
  const payer = app.rows[0]?.payer_name;
  if (!payer) return {};
  const count = await system((tx) =>
    tx.query<{ n: string }>(
      `SELECT count(DISTINCT id)::text AS n FROM applications WHERE payer_name = $1`,
      [payer],
    ),
  );
  if (Number(count.rows[0]!.n) < 3) return {};
  const c = await exec.query<{ id: string }>(
    `INSERT INTO cases (tenant_id, application_id, queue, trigger_rule_ids)
     VALUES ($1, $2, 'compliance', '{KYC-020,KYC-004}') RETURNING id`,
    [args.tenantId, args.applicationId],
  );
  await recordAuditEvent(exec, {
    tenantId: args.tenantId,
    action: 'screening.edd_triggered',
    entityType: 'application',
    entityId: args.applicationId,
    details: { payerApplications: Number(count.rows[0]!.n) },
    ruleIds: ['KYC-020', 'KYC-004'],
  });
  return { eddCaseId: c.rows[0]!.id };
}
