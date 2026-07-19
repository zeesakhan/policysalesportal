import type { SqlExec } from '../db/client';
import type { RulesEngine } from '../rules/rules-engine.service';

interface PayoutTable {
  brokerPctOfCommission: number;
  typingCentreFlatAed: number;
  affiliateFlatAed: number;
}

const DEV_PAYOUTS: PayoutTable = {
  brokerPctOfCommission: 30,
  typingCentreFlatAed: 15,
  affiliateFlatAed: 10,
};

/**
 * QR-020/021 — money accrual sweep: commission receivable (insurer → licensed
 * entity, due within 10 business days of premium receipt REG-004) and
 * downstream payouts, accruing ONLY on issued+registered policies. Values are
 * [INSURER]/business config; dev defaults apply outside production.
 */
export async function accrueLedgers(
  exec: SqlExec,
  rules: RulesEngine,
): Promise<{ commissions: number; payouts: number }> {
  const commissionPct = rules.getNumber('QR_020_COMMISSION_PCT', 10);
  const configured = rules.get<unknown>('QR_021_PAYOUT_TABLE');
  const payoutTable: PayoutTable =
    typeof configured === 'object' && configured !== null && 'brokerPctOfCommission' in configured
      ? (configured as PayoutTable)
      : DEV_PAYOUTS;

  const eligible = await exec.query<{
    id: string;
    tenant_id: string;
    tenant_type: string;
    premium_aed: string;
  }>(
    `SELECT pol.id, pol.tenant_id, t.type AS tenant_type, q.premium_aed
     FROM policies pol
       JOIN tenants t ON t.id = pol.tenant_id
       JOIN quotes q ON q.application_id = pol.application_id AND q.status = 'active'
     WHERE pol.status IN ('registered','delivered')
       AND NOT EXISTS (SELECT 1 FROM commission_receivable cr WHERE cr.policy_id = pol.id)`,
  );

  let commissions = 0;
  let payouts = 0;
  for (const p of eligible.rows) {
    const commission = Math.round(Number(p.premium_aed) * commissionPct) / 100;
    // REG-004: due within 10 business days of premium receipt (approx. 14 calendar)
    await exec.query(
      `INSERT INTO commission_receivable (policy_id, amount_aed, due_at)
       VALUES ($1, $2, now() + interval '14 days')`,
      [p.id, commission],
    );
    commissions++;
    const payout =
      p.tenant_type === 'broker'
        ? Math.round(commission * payoutTable.brokerPctOfCommission) / 100
        : p.tenant_type === 'typing_centre'
          ? payoutTable.typingCentreFlatAed
          : p.tenant_type === 'affiliate'
            ? payoutTable.affiliateFlatAed
            : 0;
    if (payout > 0) {
      await exec.query(
        `INSERT INTO payout_payable (tenant_id, policy_id, amount_aed)
         VALUES ($1, $2, $3) ON CONFLICT (tenant_id, policy_id) DO NOTHING`,
        [p.tenant_id, p.id, payout],
      );
      payouts++;
    }
  }
  return { commissions, payouts };
}

/** QR-021/022 — payout statement for a tenant: accrued/paid/clawed lines. */
export async function payoutStatement(
  exec: SqlExec,
  tenantId: string,
): Promise<{ policyNumber: string; amount: number; status: string }[]> {
  const rows = await exec.query<{ policy_number: string; amount_aed: string; status: string }>(
    `SELECT pol.policy_number, pp.amount_aed, pp.status
     FROM payout_payable pp JOIN policies pol ON pol.id = pp.policy_id
     WHERE pp.tenant_id = $1 ORDER BY pp.created_at`,
    [tenantId],
  );
  return rows.rows.map((r) => ({
    policyNumber: r.policy_number,
    amount: Number(r.amount_aed),
    status: r.status,
  }));
}

/** Commission receivable ledger with REG-004 aging (platform/insurer finance). */
export async function commissionLedger(
  exec: SqlExec,
): Promise<{ policyNumber: string; amount: number; status: string; overdue: boolean }[]> {
  const rows = await exec.query<{
    policy_number: string;
    amount_aed: string;
    status: string;
    due_at: string;
  }>(
    `SELECT pol.policy_number, cr.amount_aed, cr.status, cr.due_at
     FROM commission_receivable cr JOIN policies pol ON pol.id = cr.policy_id
     ORDER BY cr.created_at`,
  );
  return rows.rows.map((r) => ({
    policyNumber: r.policy_number,
    amount: Number(r.amount_aed),
    status: r.status,
    overdue: r.status === 'due' && new Date(r.due_at).getTime() < Date.now(),
  }));
}
