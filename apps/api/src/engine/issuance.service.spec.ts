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
import { handlePaymentWebhook, requestPayment } from './payment.service';
import {
  attemptRegistration,
  getTracker,
  orchestrateIssuance,
  threeWayMatch,
} from './issuance.service';

let db: TestDb;
let tenantId: string;
let mocks: EngineMocks;
const rules = testRules();

beforeAll(async () => {
  db = await makeTestDb();
  await db.asPlatform((tx) => seedDemoCatalogue(tx));
  tenantId = await db.createTenant('broker', 'Broker');
  mocks = makeMocks();
});

afterAll(() => db.close());

async function paidApp(): Promise<string> {
  const { applicationId } = await buildToPaymentPending(db, tenantId, rules, mocks, {});
  const attestationId = await attest(db, tenantId, applicationId, 'review', mocks);
  const link = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
    requestPayment(tx, mocks.insurer, rules, { applicationId, tenantId, attestationId }),
  );
  await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
    handlePaymentWebhook(tx, { providerRef: link.paymentRef, status: 'confirmed' }),
  );
  return applicationId;
}

const issue = (applicationId: string, startDate?: Date) =>
  db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
    orchestrateIssuance(tx, mocks.insurer, { applicationId, tenantId, startDate }),
  );

describe('PAY-020..022 — issuance and registration orchestration', () => {
  it('test_PAY_022_paid_to_issued_to_registered_visa_ready', async () => {
    const applicationId = await paidApp();
    const result = await issue(applicationId);
    expect(result.policyNumber).toMatch(/^POL-DEMO-/);
    expect(result.registered).toBe(true);
    const tracker = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      getTracker(tx, applicationId),
    );
    expect(tracker).toEqual({ paid: true, issued: true, visaReady: true, message: undefined });
  });

  it('test_UW_107_backdated_start_date_blocked_at_issuance', async () => {
    const applicationId = await paidApp();
    await expect(issue(applicationId, new Date(Date.now() - 3 * 24 * 3600_000))).rejects.toThrow(
      /UW-107/,
    );
  });

  it('test_PAY_023_registration_fail_x3_raises_ops_ticket_then_retry_clears', async () => {
    const applicationId = await paidApp();
    // every attempt fails: 3 auto-retries then ops ticket
    const willFail = { current: '' };
    const origRegister = mocks.insurer.registerPolicy.bind(mocks.insurer);
    mocks.insurer.registerPolicy = async (input) => {
      willFail.current = input.policyNumber;
      mocks.insurer.failRegistrations(input.policyNumber, 99);
      mocks.insurer.registerPolicy = origRegister;
      mocks.insurer.failRegistrations(input.policyNumber, 4);
      return origRegister(input);
    };
    const result = await issue(applicationId);
    expect(result.registered).toBe(false);
    expect(result.opsTicketId).toBeTruthy();
    const tracker = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      getTracker(tx, applicationId),
    );
    expect(tracker.visaReady).toBe(false);
    expect(tracker.message).toBe('processing — no action needed'); // PAY-023 wording

    // three-way match reports the orphan (PAY-030)
    const orphans = await db.asPlatform((tx) => threeWayMatch(tx));
    expect(orphans).toContainEqual({ applicationId, orphanType: 'issued_not_registered' });

    // ops retry succeeds once the regime platform recovers
    const policy = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      tx.query<{ policy_number: string }>(
        'SELECT policy_number FROM policies WHERE application_id = $1',
        [applicationId],
      ),
    );
    const retried = await db.asPlatform((tx) =>
      attemptRegistration(tx, mocks.insurer, {
        applicationId,
        tenantId,
        policyNumber: policy.rows[0]!.policy_number,
        regime: 'federal',
      }),
    );
    expect(retried.registered).toBe(true);
    const ticket = await db.asPlatform((tx) =>
      tx.query<{ status: string }>(
        `SELECT status FROM ops_tickets WHERE application_id = $1 AND type = 'registration_failure'`,
        [applicationId],
      ),
    );
    expect(ticket.rows[0]!.status).toBe('resolved');
  });

  it('test_KYC_011_stale_screening_blocks_issuance', async () => {
    const applicationId = await paidApp();
    await db.asPlatform((tx) =>
      tx.query(`UPDATE applications SET screened_at = now() - interval '8 days' WHERE id = $1`, [
        applicationId,
      ]),
    );
    await expect(issue(applicationId)).rejects.toThrow(/KYC-011/);
  });

  it('test_PAY_030_confirmed_not_paid_orphan_detected', async () => {
    const { applicationId } = await buildToPaymentPending(db, tenantId, rules, mocks, {});
    const attestationId = await attest(db, tenantId, applicationId, 'review', mocks);
    const link = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      requestPayment(tx, mocks.insurer, rules, { applicationId, tenantId, attestationId }),
    );
    // simulate a lost webhook: payment row confirmed but state untouched
    await db.asPlatform((tx) =>
      tx.query(`UPDATE payments SET status = 'confirmed' WHERE provider_ref = $1`, [
        link.paymentRef,
      ]),
    );
    const orphans = await db.asPlatform((tx) => threeWayMatch(tx));
    expect(orphans).toContainEqual({ applicationId, orphanType: 'confirmed_not_paid' });
  });
});
