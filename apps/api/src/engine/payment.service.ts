import { recordAuditEvent } from '../audit/audit.service';
import type { SqlExec } from '../db/client';
import type { InsurerPort } from '../integrations/insurer/port';
import type { RulesEngine } from '../rules/rules-engine.service';
import { transitionApplication } from '../state/application-machine';
import { JourneyRuleError } from './entry.service';

/**
 * SC-08/SC-09 — review attestation then direct-to-insurer payment
 * (REG-002/PAY-001): the portal passes an application reference, receives a
 * payment link and later a status webhook. Card data and funds never touch
 * the platform.
 */
export async function requestPayment(
  exec: SqlExec,
  insurer: InsurerPort,
  rules: RulesEngine,
  args: { applicationId: string; tenantId: string; actingUserId?: string; attestationId: string },
): Promise<{ paymentRef: string; url: string; windowExpiresAt: string }> {
  const app = await exec.query<{ state: string }>(
    'SELECT state FROM applications WHERE id = $1',
    [args.applicationId],
  );
  if (app.rows[0]?.state !== 'payment_pending') {
    throw new JourneyRuleError('PAY-003', `cannot request payment from state '${app.rows[0]?.state}'`);
  }

  // UW-108: OTP attestation of the application (SC-08 review) gates payment
  const attestation = await exec.query<{ purpose: string; application_id: string }>(
    'SELECT purpose, application_id FROM attestations WHERE id = $1',
    [args.attestationId],
  );
  if (
    attestation.rows[0]?.purpose !== 'review' ||
    attestation.rows[0]?.application_id !== args.applicationId
  ) {
    throw new JourneyRuleError('UW-108', 'review OTP attestation required before payment');
  }

  // PAY-005: max 3 retries after failures
  const failed = await exec.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM payments WHERE application_id = $1 AND status = 'failed'`,
    [args.applicationId],
  );
  if (Number(failed.rows[0]!.n) >= 3) {
    throw new JourneyRuleError('PAY-005', 'maximum payment retries reached');
  }

  const quote = await exec.query<{ premium_aed: string }>(
    `SELECT premium_aed FROM quotes WHERE application_id = $1 AND status = 'active'`,
    [args.applicationId],
  );
  if (quote.rows.length === 0) throw new JourneyRuleError('QR-005', 'no active quote');
  const amount = Number(quote.rows[0]!.premium_aed);

  const link = await insurer.createPaymentLink({
    applicationRef: args.applicationId,
    amountAed: amount,
  });
  const windowHours = rules.get<number>('PAY_003_PAYMENT_WINDOW_HOURS');
  const inserted = await exec.query<{ window_expires_at: string }>(
    `INSERT INTO payments (tenant_id, application_id, provider_ref, amount_aed, window_expires_at)
     VALUES ($1, $2, $3, $4, now() + ($5 || ' hours')::interval)
     RETURNING window_expires_at`,
    [args.tenantId, args.applicationId, link.paymentRef, amount, String(windowHours)],
  );
  await recordAuditEvent(exec, {
    tenantId: args.tenantId,
    actorUserId: args.actingUserId,
    action: 'payment.link_created',
    entityType: 'application',
    entityId: args.applicationId,
    after: { paymentRef: link.paymentRef, amount },
    ruleIds: ['PAY-001', 'PAY-003', 'UW-108'],
  });
  return {
    paymentRef: link.paymentRef,
    url: link.url,
    windowExpiresAt: inserted.rows[0]!.window_expires_at,
  };
}

/**
 * PAY-001 payment-status webhook — idempotent and re-orderable
 * (ARCHITECTURE §2): duplicates are no-ops; a late 'failed' after a
 * 'confirmed' never regresses the payment.
 */
export async function handlePaymentWebhook(
  exec: SqlExec,
  args: { providerRef: string; status: 'confirmed' | 'failed' },
): Promise<{ applied: boolean; applicationState?: string }> {
  const payment = await exec.query<{
    id: string;
    application_id: string;
    tenant_id: string;
    status: string;
  }>('SELECT id, application_id, tenant_id, status FROM payments WHERE provider_ref = $1', [
    args.providerRef,
  ]);
  if (payment.rows.length === 0) throw new Error(`unknown payment reference ${args.providerRef}`);
  const p = payment.rows[0]!;

  if (p.status === 'confirmed' || p.status === args.status) {
    return { applied: false }; // idempotent / re-orderable: terminal-success wins
  }

  await exec.query(`UPDATE payments SET status = $1, updated_at = now() WHERE id = $2`, [
    args.status,
    p.id,
  ]);

  if (args.status === 'confirmed') {
    await transitionApplication(exec, {
      applicationId: p.application_id,
      tenantId: p.tenant_id,
      from: 'payment_pending',
      to: 'paid', // PAY-020: triggers issuance orchestration
    });
    return { applied: true, applicationState: 'paid' };
  }

  await recordAuditEvent(exec, {
    tenantId: p.tenant_id,
    action: 'payment.failed',
    entityType: 'application',
    entityId: p.application_id,
    ruleIds: ['PAY-005'],
  });
  return { applied: true, applicationState: 'payment_pending' };
}

/**
 * PAY-003 — expiry sweep: pending payments past the 48h window expire and
 * the application returns to 'quoted' (QR-005 validity still governs).
 */
export async function expirePaymentWindows(exec: SqlExec): Promise<number> {
  const expired = await exec.query<{ id: string; application_id: string; tenant_id: string }>(
    `UPDATE payments SET status = 'expired', updated_at = now()
     WHERE status = 'pending' AND window_expires_at < now()
     RETURNING id, application_id, tenant_id`,
  );
  for (const p of expired.rows) {
    const app = await exec.query<{ state: string }>(
      'SELECT state FROM applications WHERE id = $1',
      [p.application_id],
    );
    if (app.rows[0]?.state === 'payment_pending') {
      await transitionApplication(exec, {
        applicationId: p.application_id,
        tenantId: p.tenant_id,
        from: 'payment_pending',
        to: 'quoted',
      });
    }
  }
  return expired.rows.length;
}
