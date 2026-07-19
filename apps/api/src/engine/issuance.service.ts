import { recordAuditEvent } from '../audit/audit.service';
import type { SqlExec } from '../db/client';
import type { InsurerPort } from '../integrations/insurer/port';
import { transitionApplication } from '../state/application-machine';
import { JourneyRuleError } from './entry.service';

/**
 * S9 — issuance & regulator registration (PAY-020..023, REG-003/013/022/032):
 * payment-confirmed triggers an issuance request to the insurer (only the
 * insurer issues); the insurer/TPA registers to the regime platform; the
 * journey is complete only on registration confirmation. Registration failure
 * auto-retries ×3 then raises the highest-priority ops ticket — money has
 * moved.
 */
export async function orchestrateIssuance(
  exec: SqlExec,
  insurer: InsurerPort,
  args: {
    applicationId: string;
    tenantId: string;
    actingUserId?: string;
    /** UW-107: never before today; default tomorrow (PAY-025). */
    startDate?: Date;
    now?: Date;
  },
): Promise<{
  policyNumber: string;
  registered: boolean;
  opsTicketId?: string;
}> {
  const now = args.now ?? new Date();
  const app = await exec.query<{ state: string; regime: string; screened_at: string | null }>(
    'SELECT state, regime, screened_at FROM applications WHERE id = $1',
    [args.applicationId],
  );
  if (app.rows[0]?.state !== 'paid') {
    throw new JourneyRuleError('PAY-020', `issuance requires state 'paid', not '${app.rows[0]?.state}'`);
  }

  // KYC-011: pre-issuance re-screen when screening is older than 7 days
  const screenedAt = app.rows[0]!.screened_at ? new Date(app.rows[0]!.screened_at) : null;
  if (!screenedAt || now.getTime() - screenedAt.getTime() > 7 * 24 * 3600_000) {
    throw new JourneyRuleError('KYC-011', 'screening is stale — re-screen before issuance');
  }

  const quote = await exec.query<{ product_code: string }>(
    `SELECT product_code FROM quotes WHERE application_id = $1 AND status = 'active'`,
    [args.applicationId],
  );
  const startDate = args.startDate ?? new Date(now.getTime() + 24 * 3600_000);

  const issued = await insurer.issuePolicy({
    applicationRef: args.applicationId,
    productCode: quote.rows[0]!.product_code,
    startDate: startDate.toISOString().slice(0, 10),
  });

  const endDate = new Date(startDate);
  endDate.setFullYear(endDate.getFullYear() + 1);
  await exec.query(
    `INSERT INTO policies (tenant_id, application_id, policy_number, status, issued_at, start_date, end_date)
     VALUES ($1, $2, $3, 'issued', now(), $4, $5)`,
    [
      args.tenantId,
      args.applicationId,
      issued.policyNumber,
      startDate.toISOString().slice(0, 10),
      endDate.toISOString().slice(0, 10),
    ],
  );
  await transitionApplication(exec, {
    applicationId: args.applicationId,
    tenantId: args.tenantId,
    actorUserId: args.actingUserId,
    from: 'paid',
    to: 'issued',
    ctx: { policyStartDate: startDate, now },
  });
  await recordAuditEvent(exec, {
    tenantId: args.tenantId,
    action: 'policy.issued',
    entityType: 'policy',
    entityId: issued.policyNumber,
    after: { applicationId: args.applicationId, startDate: startDate.toISOString().slice(0, 10) },
    ruleIds: ['PAY-020', 'PAY-021', 'REG-003'],
  });

  const registration = await attemptRegistration(exec, insurer, {
    applicationId: args.applicationId,
    tenantId: args.tenantId,
    policyNumber: issued.policyNumber,
    regime: app.rows[0]!.regime,
  });
  return { policyNumber: issued.policyNumber, ...registration };
}

/** PAY-023: auto-retry ×3, then ops ticket; reused by the ops retry action. */
export async function attemptRegistration(
  exec: SqlExec,
  insurer: InsurerPort,
  args: { applicationId: string; tenantId: string; policyNumber: string; regime: string },
): Promise<{ registered: boolean; opsTicketId?: string }> {
  let lastError: string | undefined;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = await insurer.registerPolicy({
      policyNumber: args.policyNumber,
      regime: args.regime,
    });
    if (result.result === 'registered') {
      await exec.query(`UPDATE policies SET status = 'registered' WHERE policy_number = $1`, [
        args.policyNumber,
      ]);
      await transitionApplication(exec, {
        applicationId: args.applicationId,
        tenantId: args.tenantId,
        from: 'issued',
        to: 'registered', // PAY-022: "Active & registered (visa-ready)"
      });
      // resolve any open registration-failure ticket
      await exec.query(
        `UPDATE ops_tickets SET status = 'resolved', updated_at = now()
         WHERE application_id = $1 AND type = 'registration_failure' AND status = 'open'`,
        [args.applicationId],
      );
      return { registered: true };
    }
    lastError = result.errorCode;
  }

  // ×3 failed → highest-priority ops queue; customer sees "processing — no
  // action needed" (PAY-023); application remains 'issued'
  const existing = await exec.query<{ id: string }>(
    `SELECT id FROM ops_tickets
     WHERE application_id = $1 AND type = 'registration_failure' AND status = 'open'`,
    [args.applicationId],
  );
  if (existing.rows.length > 0) return { registered: false, opsTicketId: existing.rows[0]!.id };
  const ticket = await exec.query<{ id: string }>(
    `INSERT INTO ops_tickets (tenant_id, application_id, type, due_at, detail)
     VALUES ($1, $2, 'registration_failure', now() + interval '1 day', $3) RETURNING id`,
    [
      args.tenantId,
      args.applicationId,
      JSON.stringify({ policyNumber: args.policyNumber, lastError }),
    ],
  );
  await recordAuditEvent(exec, {
    tenantId: args.tenantId,
    action: 'registration.failed_to_ops',
    entityType: 'policy',
    entityId: args.policyNumber,
    after: { lastError },
    ruleIds: ['PAY-023'],
  });
  return { registered: false, opsTicketId: ticket.rows[0]!.id };
}

/** SC-10 — the three-state tracker the customer actually cares about (PAY-022). */
export async function getTracker(
  exec: SqlExec,
  applicationId: string,
): Promise<{ paid: boolean; issued: boolean; visaReady: boolean; message?: string }> {
  const app = await exec.query<{ state: string }>(
    'SELECT state FROM applications WHERE id = $1',
    [applicationId],
  );
  const state = app.rows[0]?.state ?? 'unknown';
  const order = ['paid', 'issued', 'registered', 'delivered'];
  const idx = order.indexOf(state);
  const pendingTicket = await exec.query<{ id: string }>(
    `SELECT id FROM ops_tickets
     WHERE application_id = $1 AND type = 'registration_failure' AND status = 'open'`,
    [applicationId],
  );
  return {
    paid: idx >= 0,
    issued: idx >= 1,
    visaReady: idx >= 2,
    message: pendingTicket.rows.length > 0 ? 'processing — no action needed' : undefined, // PAY-023
  };
}

/**
 * PAY-030 — daily three-way match: applications ↔ payments ↔ policies. Any
 * orphan state stays on the exceptions report (AD-08) until cleared.
 */
export async function threeWayMatch(exec: SqlExec): Promise<
  { applicationId: string; orphanType: string }[]
> {
  const orphans: { applicationId: string; orphanType: string }[] = [];
  const paidNotIssued = await exec.query<{ id: string }>(
    `SELECT a.id FROM applications a WHERE a.state = 'paid'`,
  );
  for (const r of paidNotIssued.rows) orphans.push({ applicationId: r.id, orphanType: 'paid_not_issued' });
  const issuedNotRegistered = await exec.query<{ id: string }>(
    `SELECT a.id FROM applications a WHERE a.state = 'issued'`,
  );
  for (const r of issuedNotRegistered.rows) {
    orphans.push({ applicationId: r.id, orphanType: 'issued_not_registered' });
  }
  // payment confirmed but application never reached paid (webhook lost)
  const confirmedNotPaid = await exec.query<{ application_id: string }>(
    `SELECT p.application_id FROM payments p
       JOIN applications a ON a.id = p.application_id
     WHERE p.status = 'confirmed' AND a.state IN ('payment_pending','quoted','declared')`,
  );
  for (const r of confirmedNotPaid.rows) {
    orphans.push({ applicationId: r.application_id, orphanType: 'confirmed_not_paid' });
  }
  return orphans;
}
