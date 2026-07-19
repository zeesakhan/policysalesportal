import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MockEmailAdapter } from '../integrations/email/mock';
import { MockWhatsAppAdapter } from '../integrations/whatsapp/mock';
import { seedDemoCatalogue } from '../db/seed-demo';
import { makeTestDb, type TestDb } from '../testing/test-db';
import {
  attest,
  buildQuotedApp,
  buildToPaymentPending,
  makeMocks,
  testRules,
  type EngineMocks,
} from '../testing/journey-fixtures';
import { orchestrateIssuance } from './issuance.service';
import { handlePaymentWebhook, requestPayment } from './payment.service';
import {
  createResumeLink,
  deliverPolicyPack,
  myPolicies,
  resumeApplication,
  sendAbandonmentReminders,
} from './delivery.service';

let db: TestDb;
let tenantId: string;
let mocks: EngineMocks;
const rules = testRules();
const whatsapp = new MockWhatsAppAdapter();
const email = new MockEmailAdapter();

beforeAll(async () => {
  db = await makeTestDb();
  await db.asPlatform((tx) => seedDemoCatalogue(tx));
  tenantId = await db.createTenant('broker', 'Broker');
  mocks = makeMocks();
});

afterAll(() => db.close());

async function registeredApp(): Promise<string> {
  const { applicationId } = await buildToPaymentPending(db, tenantId, rules, mocks, {});
  const attestationId = await attest(db, tenantId, applicationId, 'review', mocks);
  const link = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
    requestPayment(tx, mocks.insurer, rules, { applicationId, tenantId, attestationId }),
  );
  await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
    handlePaymentWebhook(tx, { providerRef: link.paymentRef, status: 'confirmed' }),
  );
  await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
    orchestrateIssuance(tx, mocks.insurer, { applicationId, tenantId }),
  );
  return applicationId;
}

describe('PAY-024 — policy pack delivery', () => {
  it('delivers via WhatsApp (+email when present) only after registered, then delivered state', async () => {
    const applicationId = await registeredApp();
    const before = whatsapp.sent.length;
    const result = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      deliverPolicyPack(tx, whatsapp, email, { applicationId, tenantId }),
    );
    expect(result.channels).toContain('whatsapp');
    expect(whatsapp.sent.length).toBe(before + 1);
    expect(whatsapp.sent[whatsapp.sent.length - 1]!.attachments).toContain('e_card.pdf');
    const state = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      tx.query<{ state: string }>('SELECT state FROM applications WHERE id = $1', [applicationId]),
    );
    expect(state.rows[0]!.state).toBe('delivered');
  });

  it('refuses delivery before registration (PAY-022)', async () => {
    const { applicationId } = await buildToPaymentPending(db, tenantId, rules, mocks, {});
    await expect(
      db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
        deliverPolicyPack(tx, whatsapp, email, { applicationId, tenantId }),
      ),
    ).rejects.toThrow(/PAY-022/);
  });
});

describe('SC-11 — my policies', () => {
  it('lists a customer’s policies by mobile', async () => {
    const applicationId = await registeredApp();
    const list = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      myPolicies(tx, { mobile: '+9715xxxxx99' }),
    );
    expect(list.some((p) => p.applicationId === applicationId)).toBe(true);
  });
});

describe('J-R2 — save & resume + single reminder', () => {
  it('resume link round-trips and expires at 14 days', async () => {
    const { applicationId } = await buildQuotedApp(db, tenantId, rules, mocks, {});
    const { token } = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      createResumeLink(tx, whatsapp, { applicationId, tenantId }),
    );
    const resumed = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      resumeApplication(tx, token),
    );
    expect(resumed.applicationId).toBe(applicationId);
    await db.asPlatform((tx) =>
      tx.query(`UPDATE applications SET resume_expires_at = now() - interval '1 day' WHERE id = $1`, [
        applicationId,
      ]),
    );
    await expect(
      db.as({ tenantId, roleCode: 'broker_agent' }, (tx) => resumeApplication(tx, token)),
    ).rejects.toThrow(/expired/);
  });

  it('test_J_R2_one_reminder_max', async () => {
    const { applicationId } = await buildQuotedApp(db, tenantId, rules, mocks, {});
    await db.asPlatform((tx) =>
      tx.query(`UPDATE applications SET updated_at = now() - interval '4 days' WHERE id = $1`, [
        applicationId,
      ]),
    );
    const first = await db.asPlatform((tx) => sendAbandonmentReminders(tx, whatsapp));
    expect(first).toBeGreaterThanOrEqual(1);
    const second = await db.asPlatform((tx) => sendAbandonmentReminders(tx, whatsapp));
    expect(second).toBe(0); // no spam to this segment
  });
});
