import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedDemoCatalogue } from '../db/seed-demo';
import { makeTestDb, type TestDb } from '../testing/test-db';
import {
  attest,
  buildToPaymentPending,
  makeMocks,
  testRules,
  type EngineMocks,
} from '../testing/journey-fixtures';
import { expirePaymentWindows, handlePaymentWebhook, requestPayment } from './payment.service';

let db: TestDb;
let tenantId: string;
let mocks: EngineMocks;
const rules = testRules();

beforeAll(async () => {
  db = await makeTestDb();
  await db.asPlatform((tx) => seedDemoCatalogue(tx));
  tenantId = await db.createTenant('typing_centre', 'TC');
  mocks = makeMocks();
});

afterAll(() => db.close());

async function paymentReadyApp() {
  const { applicationId } = await buildToPaymentPending(db, tenantId, rules, mocks, {
    roleCode: 'operator',
  });
  const attestationId = await attest(db, tenantId, applicationId, 'review', mocks);
  return { applicationId, attestationId };
}

describe('SC-08/SC-09 — attestation gate and payment link (UW-108, PAY-001/003)', () => {
  it('test_UW_108_payment_requires_review_attestation', async () => {
    const { applicationId } = await buildToPaymentPending(db, tenantId, rules, mocks, {
      roleCode: 'operator',
    });
    // consent attestation is NOT a review attestation
    const wrongPurpose = await attest(db, tenantId, applicationId, 'consent', mocks);
    await expect(
      db.as({ tenantId, roleCode: 'operator' }, (tx) =>
        requestPayment(tx, mocks.insurer, rules, {
          applicationId,
          tenantId,
          attestationId: wrongPurpose,
        }),
      ),
    ).rejects.toThrow(/UW-108/);
  });

  it('test_PAY_003_link_created_with_48h_window_and_quote_amount', async () => {
    const { applicationId, attestationId } = await paymentReadyApp();
    const link = await db.as({ tenantId, roleCode: 'operator' }, (tx) =>
      requestPayment(tx, mocks.insurer, rules, { applicationId, tenantId, attestationId }),
    );
    expect(link.url).toContain('insurer.example/pay/');
    const windowMs = new Date(link.windowExpiresAt).getTime() - Date.now();
    expect(windowMs).toBeGreaterThan(47.5 * 3600_000);
    expect(windowMs).toBeLessThan(48.5 * 3600_000);
    const p = await db.as({ tenantId, roleCode: 'operator' }, (tx) =>
      tx.query<{ amount_aed: string }>(
        'SELECT amount_aed FROM payments WHERE provider_ref = $1',
        [link.paymentRef],
      ),
    );
    expect(Number(p.rows[0]!.amount_aed)).toBeGreaterThan(0);
  });
});

describe('PAY-001 webhooks — idempotent and re-orderable', () => {
  it('confirmed webhook moves to paid; duplicates and late failures are no-ops', async () => {
    const { applicationId, attestationId } = await paymentReadyApp();
    const link = await db.as({ tenantId, roleCode: 'operator' }, (tx) =>
      requestPayment(tx, mocks.insurer, rules, { applicationId, tenantId, attestationId }),
    );
    const first = await db.as({ tenantId, roleCode: 'operator' }, (tx) =>
      handlePaymentWebhook(tx, { providerRef: link.paymentRef, status: 'confirmed' }),
    );
    expect(first).toEqual({ applied: true, applicationState: 'paid' });
    // duplicate
    const dup = await db.as({ tenantId, roleCode: 'operator' }, (tx) =>
      handlePaymentWebhook(tx, { providerRef: link.paymentRef, status: 'confirmed' }),
    );
    expect(dup.applied).toBe(false);
    // out-of-order late failure never regresses a confirmed payment
    const late = await db.as({ tenantId, roleCode: 'operator' }, (tx) =>
      handlePaymentWebhook(tx, { providerRef: link.paymentRef, status: 'failed' }),
    );
    expect(late.applied).toBe(false);
    const state = await db.as({ tenantId, roleCode: 'operator' }, (tx) =>
      tx.query<{ state: string }>('SELECT state FROM applications WHERE id = $1', [applicationId]),
    );
    expect(state.rows[0]!.state).toBe('paid');
  });

  it('test_PAY_005_max_three_retries', async () => {
    const { applicationId, attestationId } = await paymentReadyApp();
    for (let attempt = 0; attempt < 3; attempt++) {
      const link = await db.as({ tenantId, roleCode: 'operator' }, (tx) =>
        requestPayment(tx, mocks.insurer, rules, { applicationId, tenantId, attestationId }),
      );
      await db.as({ tenantId, roleCode: 'operator' }, (tx) =>
        handlePaymentWebhook(tx, { providerRef: link.paymentRef, status: 'failed' }),
      );
    }
    await expect(
      db.as({ tenantId, roleCode: 'operator' }, (tx) =>
        requestPayment(tx, mocks.insurer, rules, { applicationId, tenantId, attestationId }),
      ),
    ).rejects.toThrow(/PAY-005/);
  });

  it('test_PAY_003_window_expiry_returns_application_to_quoted', async () => {
    const { applicationId, attestationId } = await paymentReadyApp();
    const link = await db.as({ tenantId, roleCode: 'operator' }, (tx) =>
      requestPayment(tx, mocks.insurer, rules, { applicationId, tenantId, attestationId }),
    );
    await db.asPlatform((tx) =>
      tx.query(`UPDATE payments SET window_expires_at = now() - interval '1 hour' WHERE provider_ref = $1`, [
        link.paymentRef,
      ]),
    );
    const n = await db.asPlatform((tx) => expirePaymentWindows(tx));
    expect(n).toBe(1);
    const state = await db.as({ tenantId, roleCode: 'operator' }, (tx) =>
      tx.query<{ state: string }>('SELECT state FROM applications WHERE id = $1', [applicationId]),
    );
    expect(state.rows[0]!.state).toBe('quoted');
  });
});
