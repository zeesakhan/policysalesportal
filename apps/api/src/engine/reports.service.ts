import type { SqlExec } from '../db/client';
import { threeWayMatch } from './issuance.service';

/**
 * MIS-020 — the single metrics dictionary. Every report uses these
 * definitions; WP-12 signs them off so business and tech never argue later.
 */
export const METRICS_DICTIONARY = {
  application: 'A journey record created after consent (REG-050); any state.',
  conversion: 'Application that reached issued or beyond.',
  issued: 'Insurer policy number received (PAY-020/021).',
  active: 'Policy registered on the regime platform — visa-ready (PAY-022).',
  stp_rate: 'uw.decision.stp count ÷ decided applications.',
  referral_rate: 'Applications with ≥1 underwriting case ÷ applications past screening.',
  gwp: 'Gross written premium: sum of active-quote totals (incl. VAT) on issued+ policies.',
} as const;

/** Daily sales register (MIS §2 platform) — counts by regime/channel/state. */
export async function dailySalesRegister(exec: SqlExec): Promise<{
  byState: Record<string, number>;
  byRegime: Record<string, number>;
  byChannel: Record<string, number>;
  stpRate: number;
  referralRate: number;
}> {
  const states = await exec.query<{ state: string; n: string }>(
    `SELECT state, count(*)::text AS n FROM applications GROUP BY state`,
  );
  const regimes = await exec.query<{ regime: string; n: string }>(
    `SELECT coalesce(regime, 'unrouted') AS regime, count(*)::text AS n FROM applications GROUP BY regime`,
  );
  const channels = await exec.query<{ channel: string; n: string }>(
    `SELECT coalesce(channel, 'unknown') AS channel, count(*)::text AS n FROM applications GROUP BY channel`,
  );
  const stp = await exec.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM audit_events WHERE action = 'uw.decision.stp'`,
  );
  const referred = await exec.query<{ n: string }>(
    `SELECT count(DISTINCT application_id)::text AS n FROM cases WHERE queue = 'underwriting'`,
  );
  const screened = await exec.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM applications WHERE screened_at IS NOT NULL`,
  );
  const decided = Number(stp.rows[0]!.n) + Number(referred.rows[0]!.n);
  const toMap = (rows: Record<string, unknown>[], key: string) =>
    Object.fromEntries(rows.map((r) => [String(r[key]), Number(r.n)]));
  return {
    byState: toMap(states.rows, 'state'),
    byRegime: toMap(regimes.rows, 'regime'),
    byChannel: toMap(channels.rows, 'channel'),
    stpRate: decided === 0 ? 0 : Number(stp.rows[0]!.n) / decided,
    referralRate:
      Number(screened.rows[0]!.n) === 0
        ? 0
        : Number(referred.rows[0]!.n) / Number(screened.rows[0]!.n),
  };
}

/** Exceptions dashboard (MIS §2): PAY-030 orphans + REF-012 SLA breaches. */
export async function exceptionsReport(exec: SqlExec): Promise<{
  orphans: { applicationId: string; orphanType: string }[];
  slaBreaches: { caseId: string; queue: string; slaDueAt: string }[];
}> {
  const orphans = await threeWayMatch(exec);
  const breaches = await exec.query<{ id: string; queue: string; sla_due_at: string }>(
    `SELECT id, queue, sla_due_at FROM cases
     WHERE state NOT IN ('closed') AND sla_due_at IS NOT NULL AND sla_due_at < now()
       AND info_requested_at IS NULL`, // REF-003: info-requested pauses the clock
  );
  return {
    orphans,
    slaBreaches: breaches.rows.map((b) => ({ caseId: b.id, queue: b.queue, slaDueAt: b.sla_due_at })),
  };
}

/** Compliance pack (MIS §2): volumes only — no case detail. */
export async function compliancePack(exec: SqlExec): Promise<Record<string, number>> {
  const screening = await exec.query<{ status: string; n: string }>(
    `SELECT status, count(*)::text AS n FROM screening_results GROUP BY status`,
  );
  const edd = await exec.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM cases WHERE 'KYC-020' = ANY(trigger_rule_ids)`,
  );
  const str = await exec.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM audit_events WHERE action = 'screening.str_consideration_raised'`,
  );
  const out: Record<string, number> = { eddCases: Number(edd.rows[0]!.n), strReferrals: Number(str.rows[0]!.n) };
  for (const r of screening.rows) out[`screening_${r.status}`] = Number(r.n);
  return out;
}

/** Conduct monitor (TEN-011): per-tenant referral/decline/cancellation rates. */
export async function conductMonitor(exec: SqlExec): Promise<
  { tenantId: string; name: string; applications: number; referralRate: number; declineRate: number; cancellationRate: number }[]
> {
  const rows = await exec.query<{
    tenant_id: string;
    name: string;
    apps: string;
    referred: string;
    declined: string;
    cancelled: string;
  }>(
    `SELECT t.id AS tenant_id, t.name,
            count(DISTINCT a.id)::text AS apps,
            count(DISTINCT c.application_id)::text AS referred,
            count(DISTINCT a.id) FILTER (WHERE a.state = 'declined')::text AS declined,
            count(DISTINCT ca.policy_id)::text AS cancelled
     FROM tenants t
       LEFT JOIN applications a ON a.tenant_id = t.id
       LEFT JOIN cases c ON c.application_id = a.id AND c.queue = 'underwriting'
       LEFT JOIN policies pol ON pol.tenant_id = t.id
       LEFT JOIN cancellations ca ON ca.policy_id = pol.id
     WHERE t.type IN ('broker','typing_centre','affiliate')
     GROUP BY t.id, t.name`,
  );
  return rows.rows.map((r) => {
    const apps = Number(r.apps) || 0;
    return {
      tenantId: r.tenant_id,
      name: r.name,
      applications: apps,
      referralRate: apps ? Number(r.referred) / apps : 0,
      declineRate: apps ? Number(r.declined) / apps : 0,
      cancellationRate: apps ? Number(r.cancelled) / apps : 0,
    };
  });
}

/** Bordereau (MIS §2 — the contractual core): per-policy statement rows. */
export async function bordereau(
  exec: SqlExec,
  period: { from: string; to: string },
): Promise<Record<string, unknown>[]> {
  const rows = await exec.query(
    `SELECT pol.policy_number, q.product_code AS plan, q.premium_aed,
            (q.breakdown->>'vat')::numeric AS vat, pol.issued_at, pol.status AS registration_status,
            pol.start_date, pol.end_date,
            (SELECT count(*) FROM endorsements e WHERE e.policy_id = pol.id) AS endorsements,
            (SELECT count(*) FROM cancellations c WHERE c.policy_id = pol.id) AS cancellations,
            (SELECT coalesce(sum(c.refund_computed), 0) FROM cancellations c WHERE c.policy_id = pol.id) AS refunds,
            cr.amount_aed AS commission
     FROM policies pol
       JOIN quotes q ON q.application_id = pol.application_id AND q.status = 'active'
       LEFT JOIN commission_receivable cr ON cr.policy_id = pol.id
     WHERE pol.issued_at >= $1::date AND pol.issued_at < ($2::date + 1)
     ORDER BY pol.issued_at`,
    [period.from, period.to],
  );
  return rows.rows;
}

/** MIS-011 — DSAR extract by EID (compliance role only; RLS enforces). */
export async function dsarExtract(exec: SqlExec, eid: string): Promise<Record<string, unknown>> {
  const persons = await exec.query(
    `SELECT p.full_name, p.eid, p.passport_no, p.dob, p.gender, p.nationality, p.application_id
     FROM persons p WHERE p.eid = $1`,
    [eid],
  );
  const applications = await exec.query(
    `SELECT a.id, a.state, a.regime, a.channel, a.mobile, a.email, a.created_at
     FROM applications a WHERE a.id IN (SELECT application_id FROM persons WHERE eid = $1)`,
    [eid],
  );
  const declarations = await exec.query(
    `SELECT hd.created_at, hd.answers FROM health_declarations hd
     WHERE hd.person_id IN (SELECT id FROM persons WHERE eid = $1)`,
    [eid],
  );
  return {
    persons: persons.rows,
    applications: applications.rows,
    healthDeclarations: declarations.rows, // visible only when caller holds TEN-002 read
  };
}
