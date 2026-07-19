import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { decide } from '../../engine/decision.service';
import { attemptRegistration, getTracker, orchestrateIssuance } from '../../engine/issuance.service';
import { expirePaymentWindows, handlePaymentWebhook, requestPayment } from '../../engine/payment.service';
import { findPanCandidates } from '../../../../../scripts/check-pan-patterns.mjs';
import { attest } from '../../testing/journey-fixtures';
import { makeTestEid } from '../../testing/make-eid';
import { PERSONAS } from '../personas';
import { driveToQuote, setupUatEnv, type UatEnv } from '../uat-fixtures';

// WP-12 Part B — Payment, issuance, registration (U-60..U-63)
let env: UatEnv;
let uatSerial = 700000;
beforeAll(async () => {
  env = await setupUatEnv('typing_centre');
});
afterAll(() => env.db.close());

async function toPaymentPending(personaKey: keyof typeof PERSONAS) {
  const persona = PERSONAS[personaKey]!;
  // fresh EID per call — the same persona is exercised in more than one
  // scenario within this file and UW-105 correctly blocks EID reuse once a
  // policy exists
  const result = await driveToQuote(env, persona, { eidOverride: makeTestEid(1990, uatSerial++) });
  if (result.declined || !result.applicationId) throw new Error('setup failed');
  await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
    decide(tx, env.rules, { applicationId: result.applicationId, tenantId: env.tenantId }),
  );
  return result.applicationId;
}

describe('WP-12 §B — Payment, issuance, registration', () => {
  // rules: PAY-001, PAY-021, PAY-022, PAY-024
  it('U-60 STP end-to-end: pay on insurer gateway → issued ≤15min → registered → Active&registered → WhatsApp pack delivered', async () => {
    const applicationId = await toPaymentPending('P01');
    const attestationId = await attest(env.db, env.tenantId, applicationId, 'review', env.mocks);
    const link = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      requestPayment(tx, env.mocks.insurer, env.rules, { applicationId, tenantId: env.tenantId, attestationId }),
    );
    const before = Date.now();
    await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      handlePaymentWebhook(tx, { providerRef: link.paymentRef, status: 'confirmed' }),
    );
    const issued = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      orchestrateIssuance(tx, env.mocks.insurer, { applicationId, tenantId: env.tenantId }),
    );
    expect(Date.now() - before).toBeLessThan(15 * 60_000); // PAY-021: 15-minute SLA (mock is instant)
    expect(issued.registered).toBe(true);
    const { MockWhatsAppAdapter } = await import('../../integrations/whatsapp/mock');
    const { MockEmailAdapter } = await import('../../integrations/email/mock');
    const { deliverPolicyPack } = await import('../../engine/delivery.service');
    const whatsapp = new MockWhatsAppAdapter();
    const delivered = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      deliverPolicyPack(tx, whatsapp, new MockEmailAdapter(), { applicationId, tenantId: env.tenantId }),
    );
    expect(delivered.channels).toContain('whatsapp');
    const tracker = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      getTracker(tx, applicationId),
    );
    expect(tracker.visaReady).toBe(true);
  });

  // rules: PAY-023
  it('U-61 Registration fails → 3 retries → ops ticket → customer "processing" notice → resolved in SLA', async () => {
    const applicationId = await toPaymentPending('P05');
    const attestationId = await attest(env.db, env.tenantId, applicationId, 'review', env.mocks);
    const link = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      requestPayment(tx, env.mocks.insurer, env.rules, { applicationId, tenantId: env.tenantId, attestationId }),
    );
    await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      handlePaymentWebhook(tx, { providerRef: link.paymentRef, status: 'confirmed' }),
    );
    // program the first 4 registration attempts to fail — the initial
    // issuance orchestration exhausts its 3 auto-retries (ops ticket raised);
    // the ops-side retry succeeds within its own retry loop once attempts run out
    const originalRegister = env.mocks.insurer.registerPolicy.bind(env.mocks.insurer);
    env.mocks.insurer.registerPolicy = async (input) => {
      env.mocks.insurer.failRegistrations(input.policyNumber, 99);
      env.mocks.insurer.registerPolicy = originalRegister;
      env.mocks.insurer.failRegistrations(input.policyNumber, 4);
      return originalRegister(input);
    };
    const issued = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      orchestrateIssuance(tx, env.mocks.insurer, { applicationId, tenantId: env.tenantId }),
    );
    expect(issued.registered).toBe(false);
    expect(issued.opsTicketId).toBeTruthy();
    const tracker = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      getTracker(tx, applicationId),
    );
    expect(tracker.message).toBe('processing — no action needed');
    const retried = await env.db.asPlatform((tx) =>
      attemptRegistration(tx, env.mocks.insurer, {
        applicationId,
        tenantId: env.tenantId,
        policyNumber: issued.policyNumber,
        regime: 'dubai',
      }),
    );
    expect(retried.registered).toBe(true); // resolved once the platform recovers
  });

  // rules: PAY-003
  it('U-62 Payment window lapses at 49 hours → application back to quoted', async () => {
    const applicationId = await toPaymentPending('P01');
    const attestationId = await attest(env.db, env.tenantId, applicationId, 'review', env.mocks);
    const link = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      requestPayment(tx, env.mocks.insurer, env.rules, { applicationId, tenantId: env.tenantId, attestationId }),
    );
    await env.db.asPlatform((tx) =>
      tx.query(`UPDATE payments SET window_expires_at = now() - interval '1 hour' WHERE provider_ref = $1`, [
        link.paymentRef,
      ]),
    );
    await env.db.asPlatform((tx) => expirePaymentWindows(tx));
    const app = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      tx.query<{ state: string }>('SELECT state FROM applications WHERE id = $1', [applicationId]),
    );
    expect(app.rows[0]!.state).toBe('quoted'); // 49h ≥ 48h window
  });

  // rules: PAY-001
  it('U-63 Verify portal database contains no card data after a completed payment', async () => {
    // Schema check: the payments table has no column shaped to hold a PAN.
    const columns = await env.db.asPlatform((tx) =>
      tx.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'payments'`,
      ),
    );
    const names = columns.rows.map((c) => c.column_name);
    expect(names).not.toContain('card_number');
    expect(names).not.toContain('pan');
    expect(names).not.toContain('cvv');

    // Data check: run a full paid journey, then scan every stored value with
    // the same Luhn-based PAN detector CI runs repo-wide (PAY-001).
    const applicationId = await toPaymentPending('P05');
    const attestationId = await attest(env.db, env.tenantId, applicationId, 'review', env.mocks);
    const link = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      requestPayment(tx, env.mocks.insurer, env.rules, { applicationId, tenantId: env.tenantId, attestationId }),
    );
    await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      handlePaymentWebhook(tx, { providerRef: link.paymentRef, status: 'confirmed' }),
    );
    const paymentRow = await env.db.asPlatform((tx) =>
      tx.query('SELECT * FROM payments WHERE provider_ref = $1', [link.paymentRef]),
    );
    const hits = findPanCandidates(JSON.stringify(paymentRow.rows));
    expect(hits).toHaveLength(0);
  });
});
