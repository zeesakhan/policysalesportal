import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MockEmailAdapter } from '../integrations/email/mock';
import { MockWhatsAppAdapter } from '../integrations/whatsapp/mock';
import { seedDemoCatalogue } from '../db/seed-demo';
import { makeTestDb, type TestDb } from '../testing/test-db';
import {
  attest,
  buildToPaymentPending,
  makeMocks,
  testRules,
  type EngineMocks,
} from '../testing/journey-fixtures';
import { deliverPolicyPack } from './delivery.service';
import { getTracker, orchestrateIssuance } from './issuance.service';
import { handlePaymentWebhook, requestPayment } from './payment.service';

/**
 * M1 done-criterion: all three regulatory regimes run STP end-to-end on
 * mocks — entry → consent → routing → identity → screening → quote →
 * decision → attestation → payment → issuance → registration → delivery.
 * This spec is the GATE-1 evidence in executable form.
 */
let db: TestDb;
let tenantId: string;
let mocks: EngineMocks;
const rules = testRules();
const whatsapp = new MockWhatsAppAdapter();
const email = new MockEmailAdapter();

beforeAll(async () => {
  db = await makeTestDb();
  await db.asPlatform((tx) => seedDemoCatalogue(tx));
  tenantId = await db.createTenant('typing_centre', 'Demo TC');
  mocks = makeMocks();
});

afterAll(() => db.close());

const REGIMES = [
  { emirate: 'sharjah', regime: 'federal', product: 'FED-BASIC' },
  { emirate: 'dubai', regime: 'dubai', product: 'DXB-EBP' },
  { emirate: 'abu_dhabi', regime: 'abu_dhabi', product: 'AD-BASIC' },
] as const;

describe('GATE-1 — three regimes STP end-to-end on mocks', () => {
  for (const { emirate, regime, product } of REGIMES) {
    it(`test_STP_end_to_end_${regime}`, async () => {
      const { applicationId } = await buildToPaymentPending(db, tenantId, rules, mocks, {
        emirate,
        product,
        roleCode: 'operator',
      });

      const attestationId = await attest(db, tenantId, applicationId, 'review', mocks);
      const link = await db.as({ tenantId, roleCode: 'operator' }, (tx) =>
        requestPayment(tx, mocks.insurer, rules, { applicationId, tenantId, attestationId }),
      );
      await db.as({ tenantId, roleCode: 'operator' }, (tx) =>
        handlePaymentWebhook(tx, { providerRef: link.paymentRef, status: 'confirmed' }),
      );
      const issued = await db.as({ tenantId, roleCode: 'operator' }, (tx) =>
        orchestrateIssuance(tx, mocks.insurer, { applicationId, tenantId }),
      );
      expect(issued.registered).toBe(true);
      await db.as({ tenantId, roleCode: 'operator' }, (tx) =>
        deliverPolicyPack(tx, whatsapp, email, { applicationId, tenantId }),
      );

      const app = await db.as({ tenantId, roleCode: 'operator' }, (tx) =>
        tx.query<{ state: string; regime: string }>(
          'SELECT state, regime FROM applications WHERE id = $1',
          [applicationId],
        ),
      );
      expect(app.rows[0]).toEqual({ state: 'delivered', regime });
      const tracker = await db.as({ tenantId, roleCode: 'operator' }, (tx) =>
        getTracker(tx, applicationId),
      );
      expect(tracker.visaReady).toBe(true);

      // audit spine covers the whole journey (J-R1)
      const audit = await db.asPlatform((tx) =>
        tx.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM audit_events WHERE entity_id = $1 OR entity_id IN
             (SELECT policy_number FROM policies WHERE application_id = $2::uuid)`,
          [applicationId, applicationId],
        ),
      );
      expect(Number(audit.rows[0]!.n)).toBeGreaterThanOrEqual(6);
    });
  }
});
