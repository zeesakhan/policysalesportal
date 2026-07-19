import { recordAuditEvent } from '../audit/audit.service';
import type { SqlExec } from '../db/client';
import type { IcpValidationPort } from '../integrations/icp_validation/port';
import type { RulesEngine } from '../rules/rules-engine.service';
import { transitionApplication } from '../state/application-machine';
import { eidChecksumValid, nameSimilarity, normalizeEid } from './eid';
import { JourneyRuleError } from './entry.service';

/** Runs a query in the platform/system context (cross-tenant controls). */
export type SystemRunner = <T>(fn: (tx: SqlExec) => Promise<T>) => Promise<T>;

export interface IdentityInput {
  applicationId: string;
  tenantId: string;
  actingUserId?: string;
  eid?: string;
  /** OCR-extracted name when capture was camera/scan — fuzzy-matched (SC-03). */
  ocrName?: string;
  passportNo?: string;
  visaFileNo?: string;
  fullName: string;
  dob: string;
  gender: string;
  nationality: string;
}

export interface IdentityOutcome {
  outcome: 'ok' | 'declined' | 'referred';
  personId?: string;
  caseId?: string;
  customerCategory?: string;
  coolingReferral?: boolean;
}

/**
 * SC-03 — applicant identity (KYC anchor). EID checksum (UW-102), real-time
 * ICP validation (KYC-001/INT-G1 — the authoritative control), duplicate
 * check (UW-105), decline-cooling flag (J-R3), no-EID new-arrival path
 * (KYC-002 with END-002a endorsement task).
 */
export async function captureIdentity(
  exec: SqlExec,
  system: SystemRunner,
  icp: IcpValidationPort,
  rules: RulesEngine,
  input: IdentityInput,
): Promise<IdentityOutcome> {
  const app = await exec.query<{ regime: string | null; state: string }>(
    'SELECT regime, state FROM applications WHERE id = $1',
    [input.applicationId],
  );
  if (app.rows.length === 0) throw new Error(`application ${input.applicationId} not found`);
  const regime = app.rows[0]!.regime;

  // ---- no-EID new-arrival path (KYC-002 / UW-102) ----
  if (!input.eid) {
    if (!input.passportNo || !input.visaFileNo) {
      throw new JourneyRuleError(
        'KYC-002',
        'without an Emirates ID, passport and visa file number are both mandatory',
      );
    }
    const person = await insertPerson(exec, input, null, 'not_checked');
    // END-002a: EID must be endorsed within 30 days of issuance
    await exec.query(
      `INSERT INTO ops_tickets (tenant_id, application_id, type, due_at, detail)
       VALUES ($1, $2, 'eid_endorsement_due', now() + interval '30 days', $3)`,
      [input.tenantId, input.applicationId, JSON.stringify({ passportNo: input.passportNo })],
    );
    await recordAuditEvent(exec, {
      tenantId: input.tenantId,
      actorUserId: input.actingUserId,
      action: 'identity.no_eid_path',
      entityType: 'application',
      entityId: input.applicationId,
      after: { passport: true, visaFile: true },
      ruleIds: ['KYC-002', 'UW-102'],
    });
    return { outcome: 'ok', personId: person };
  }

  // ---- EID format + checksum (UW-102): invalid → DECLINE ----
  const eid = normalizeEid(input.eid);
  if (!eidChecksumValid(eid)) {
    await exec.query(
      `UPDATE applications SET decline_reason = 'identity', updated_at = now() WHERE id = $1`,
      [input.applicationId],
    );
    await transitionApplication(exec, {
      applicationId: input.applicationId,
      tenantId: input.tenantId,
      actorUserId: input.actingUserId,
      from: 'draft',
      to: 'declined',
    });
    return { outcome: 'declined', customerCategory: 'identity' };
  }

  // ---- END-015: purchase-cancel-refund abuse block (compliance review) ----
  const blocked = await system((tx) =>
    tx.query<{ id: string }>('SELECT id FROM purchase_blocks WHERE eid = $1', [eid]),
  );
  if (blocked.rows.length > 0) {
    throw new JourneyRuleError(
      'END-015',
      'purchases are blocked for this person pending compliance review',
      'verification',
    );
  }

  // ---- decline cooling (J-R3): cross-channel, EID-keyed, forces manual UW ----
  const coolingDays = rules.get<number>('J_R3_DECLINE_COOLING_DAYS');
  const cooling = await system((tx) =>
    tx.query<{ id: string }>(
      `SELECT id FROM decline_records WHERE eid = $1 AND declined_at > now() - ($2 || ' days')::interval`,
      [eid, String(coolingDays)],
    ),
  );
  const coolingReferral = cooling.rows.length > 0;
  if (coolingReferral) {
    await exec.query(
      `UPDATE applications SET cooling_referral = true, updated_at = now() WHERE id = $1`,
      [input.applicationId],
    );
    await recordAuditEvent(exec, {
      tenantId: input.tenantId,
      action: 'identity.decline_cooling_flagged',
      entityType: 'application',
      entityId: input.applicationId,
      ruleIds: ['J-R3'],
    });
  }

  // ---- duplicate in-force policy per regime (UW-105): hard block with routing ----
  if (regime) {
    const dup = await system((tx) =>
      tx.query<{ id: string }>(
        `SELECT pol.id FROM policies pol
           JOIN applications a ON a.id = pol.application_id
           JOIN persons p ON p.application_id = a.id AND p.kind = 'applicant'
         WHERE p.eid = $1 AND a.regime = $2 AND pol.status IN ('issued','registered','delivered')`,
        [eid, regime],
      ),
    );
    if (dup.rows.length > 0) {
      throw new JourneyRuleError(
        'UW-105',
        'an active in-force policy already exists for this person in this regime — route to endorsement/replacement (WP-10), not new sale',
        'duplicate_policy',
      );
    }
  }

  // ---- ICP Validation Gateway (KYC-001/INT-G1): the authoritative control ----
  const icpResult = (await icp.validate({
    eid,
    fullName: input.fullName,
    dob: input.dob,
    nationality: input.nationality,
  })).result;

  // OCR fuzzy-match (SC-03): entered/OCR name divergence → REFER flag
  const threshold = rules.get<number>('UW_102_NAME_MATCH_THRESHOLD');
  const ocrMismatch =
    input.ocrName !== undefined && nameSimilarity(input.ocrName, input.fullName) < threshold;

  const personId = await insertPerson(exec, input, eid, icpResult);
  await recordAuditEvent(exec, {
    tenantId: input.tenantId,
    actorUserId: input.actingUserId,
    action: 'identity.icp_checked',
    entityType: 'person',
    entityId: personId,
    after: { icpResult, ocrMismatch },
    ruleIds: ['KYC-001', 'UW-102'],
  });

  if (icpResult !== 'pass' || ocrMismatch) {
    // Identity REFER → compliance queue (REF-001: identity is compliance-side)
    const triggers = icpResult !== 'pass' ? ['KYC-001', 'UW-102'] : ['UW-102'];
    const c = await exec.query<{ id: string }>(
      `INSERT INTO cases (tenant_id, application_id, queue, trigger_rule_ids)
       VALUES ($1, $2, 'compliance', $3) RETURNING id`,
      [input.tenantId, input.applicationId, triggers],
    );
    return {
      outcome: 'referred',
      personId,
      caseId: c.rows[0]!.id,
      customerCategory: 'verification',
      coolingReferral,
    };
  }

  return { outcome: 'ok', personId, coolingReferral };
}

async function insertPerson(
  exec: SqlExec,
  input: IdentityInput,
  eid: string | null,
  icpStatus: string,
): Promise<string> {
  const r = await exec.query<{ id: string }>(
    `INSERT INTO persons (tenant_id, application_id, kind, full_name, eid, passport_no, visa_file_no,
                          dob, gender, nationality, icp_status, icp_checked_at)
     VALUES ($1, $2, 'applicant', $3, $4, $5, $6, $7, $8, $9, $10,
             CASE WHEN $10 = 'not_checked' THEN NULL ELSE now() END)
     RETURNING id`,
    [
      input.tenantId,
      input.applicationId,
      input.fullName,
      eid,
      input.passportNo ?? null,
      input.visaFileNo ?? null,
      input.dob,
      input.gender,
      input.nationality,
      icpStatus,
    ],
  );
  return r.rows[0]!.id;
}
