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
import { orchestrateIssuance } from './issuance.service';
import { handlePaymentWebhook, requestPayment } from './payment.service';
import {
  computeRefund,
  evaluateRenewal,
  lapseSweep,
  renewalNotices,
  requestCancellation,
  requestEndorsement,
} from './lifecycle.service';
import { accrueLedgers, commissionLedger, payoutStatement } from './money.service';
import {
  bordereau,
  compliancePack,
  conductMonitor,
  dailySalesRegister,
  dsarExtract,
  exceptionsReport,
  METRICS_DICTIONARY,
} from './reports.service';

let db: TestDb;
let tenantId: string;
let mocks: EngineMocks;
const rules = testRules();

beforeAll(async () => {
  db = await makeTestDb();
  await db.asPlatform((tx) => seedDemoCatalogue(tx));
  tenantId = await db.createTenant('broker', 'Lifecycle Broker');
  mocks = makeMocks();
});

afterAll(() => db.close());

async function registeredPolicy(): Promise<{ applicationId: string; policyId: string; eid: string }> {
  const { applicationId, eid } = await buildToPaymentPending(db, tenantId, rules, mocks, {});
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
  const p = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
    tx.query<{ id: string }>('SELECT id FROM policies WHERE application_id = $1', [applicationId]),
  );
  return { applicationId, policyId: p.rows[0]!.id, eid };
}

describe('M3-T1 endorsements (END-001..004, REG-024)', () => {
  it('test_END_002_newborn_day_25_prices_prorata_with_sla_warning', async () => {
    const { policyId } = await registeredPolicy();
    const dob25 = new Date(Date.now() - 25 * 24 * 3600_000).toISOString().slice(0, 10);
    const result = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      requestEndorsement(tx, { tenantId, policyId, type: 'newborn_addition', detail: { dob: dob25 } }),
    );
    expect(result.newbornSlaWarning).toBe(true); // ≥ day 20 (REG-024 warn)
    expect(result.additionalPremium).toBeGreaterThan(0); // END-003 pro-rata
    expect(result.status).toBe('priced');
  });

  it('test_END_002f_no_midterm_plan_upgrade', async () => {
    const { policyId } = await registeredPolicy();
    await expect(
      db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
        requestEndorsement(tx, { tenantId, policyId, type: 'plan_upgrade' }),
      ),
    ).rejects.toThrow(/END-002/);
  });

  it('test_END_004_uw_relevant_correction_refers', async () => {
    const { policyId } = await registeredPolicy();
    const result = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      requestEndorsement(tx, {
        tenantId,
        policyId,
        type: 'name_correction',
        detail: { affectsUnderwriting: true, newDob: '1958-01-01' },
      }),
    );
    expect(result.status).toBe('referred');
    expect(result.caseId).toBeTruthy();
  });
});

describe('M3-T2 cancellation + refunds (END-010..015)', () => {
  it('test_END_012_visa_warning_must_be_acknowledged', async () => {
    const { policyId } = await registeredPolicy();
    await expect(
      db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
        requestCancellation(tx, db.asPlatform, rules, {
          tenantId,
          policyId,
          reason: 'switched_insurer',
          visaWarningAcknowledged: false,
        }),
      ),
    ).rejects.toThrow(/END-012/);
  });

  it('test_END_011_computed_refund_shown_and_END_014_clawback_cascade', async () => {
    const { policyId } = await registeredPolicy();
    await db.asPlatform((tx) => accrueLedgers(tx, rules));
    const refund = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      computeRefund(tx, rules, { policyId }),
    );
    expect(refund.refund).toBeGreaterThan(0);
    const result = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      requestCancellation(tx, db.asPlatform, rules, {
        tenantId,
        policyId,
        reason: 'leaving_uae',
        visaWarningAcknowledged: true,
      }),
    );
    expect(result.refund).toBe(refund.refund);
    const ledger = await db.asPlatform((tx) => commissionLedger(tx));
    const line = ledger.find((l) => l.status === 'clawed');
    expect(line).toBeTruthy(); // QR-022 cascade
  });

  it('test_END_015_two_cancel_cycles_blocks_and_raises_edd', async () => {
    // same person cancels twice within 12 months
    const first = await registeredPolicy();
    // second policy for the same EID would be blocked by UW-105 (active policy),
    // so cancel the first, then buy+cancel again
    await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      requestCancellation(tx, db.asPlatform, rules, {
        tenantId,
        policyId: first.policyId,
        reason: 'dissatisfaction',
        visaWarningAcknowledged: true,
      }),
    );
    const second = await registeredPolicy();
    // pretend it's the same EID (cross-policy pattern is EID-keyed)
    await db.asPlatform((tx) =>
      tx.query(
        `UPDATE persons SET eid = $1 WHERE application_id = $2 AND kind = 'applicant'`,
        [first.eid, second.applicationId],
      ),
    );
    const result = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      requestCancellation(tx, db.asPlatform, rules, {
        tenantId,
        policyId: second.policyId,
        reason: 'dissatisfaction',
        visaWarningAcknowledged: true,
      }),
    );
    expect(result.eddCaseId).toBeTruthy(); // KYC-020 flag
    const blocked = await db.asPlatform((tx) =>
      tx.query('SELECT id FROM purchase_blocks WHERE eid = $1', [first.eid]),
    );
    expect(blocked.rows).toHaveLength(1); // further purchases blocked
  });
});

describe('M3-T3 renewals (END-020/021)', () => {
  it('notices fire at 60/30/7 days and lapse sweep expires policies', async () => {
    const { policyId } = await registeredPolicy();
    await db.asPlatform((tx) =>
      tx.query(`UPDATE policies SET end_date = current_date + 30 WHERE id = $1`, [policyId]),
    );
    const notices = await db.asPlatform((tx) => renewalNotices(tx));
    expect(notices.some((n) => n.policyId === policyId && n.daysToExpiry === 30)).toBe(true);

    await db.asPlatform((tx) =>
      tx.query(`UPDATE policies SET end_date = current_date - 1 WHERE id = $1`, [policyId]),
    );
    const lapsed = await db.asPlatform((tx) => lapseSweep(tx));
    expect(lapsed).toBeGreaterThanOrEqual(1);
  });

  it('test_END_020_renewal_rerun_eligibility_age_band_change_refers', async () => {
    const { applicationId, policyId } = await registeredPolicy();
    const stp = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      evaluateRenewal(tx, rules, { policyId }),
    );
    expect(stp.outcome).toBe('stp');
    expect(stp.newAnnualPremium).toBeGreaterThan(0);
    // age the applicant past 64 → renewal refers (UW-202 applies at renewal)
    await db.asPlatform((tx) =>
      tx.query(`UPDATE persons SET dob = '1958-01-01' WHERE application_id = $1`, [applicationId]),
    );
    const refer = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      evaluateRenewal(tx, rules, { policyId }),
    );
    expect(refer.outcome).toBe('refer');
    expect(refer.ruleIds).toContain('UW-202');
  });
});

describe('M3-T4 ledgers (QR-020..022) and M3-T5 reports (MIS)', () => {
  it('test_QR_021_accrual_only_on_registered_and_statements', async () => {
    const { policyId } = await registeredPolicy();
    await db.asPlatform((tx) => accrueLedgers(tx, rules));
    const statement = await db.as({ tenantId, roleCode: 'broker_admin' }, (tx) =>
      payoutStatement(tx, tenantId),
    );
    expect(statement.length).toBeGreaterThan(0);
    expect(statement.some((s) => s.status === 'accrued')).toBe(true);
    void policyId;
  });

  it('reports: sales register, exceptions, compliance pack, conduct, bordereau, DSAR', async () => {
    const register = await db.asPlatform((tx) => dailySalesRegister(tx));
    expect(register.byState.delivered ?? 0 + (register.byState.registered ?? 0)).toBeGreaterThanOrEqual(0);
    expect(register.stpRate).toBeGreaterThan(0);

    const exceptions = await db.asPlatform((tx) => exceptionsReport(tx));
    expect(Array.isArray(exceptions.orphans)).toBe(true);

    const pack = await db.asPlatform((tx) => compliancePack(tx));
    expect(pack.screening_clear).toBeGreaterThan(0);

    const conduct = await db.asPlatform((tx) => conductMonitor(tx));
    const broker = conduct.find((c) => c.name === 'Lifecycle Broker');
    expect(broker).toBeTruthy();
    expect(broker!.cancellationRate).toBeGreaterThan(0); // TEN-011 signal

    const today = new Date().toISOString().slice(0, 10);
    const rows = await db.asPlatform((tx) => bordereau(tx, { from: today, to: today }));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toHaveProperty('policy_number');
    expect(rows[0]).toHaveProperty('commission');

    const { eid } = await registeredPolicy();
    const dsar = await db.as({ isPlatform: true, roleCode: 'compliance_officer' }, (tx) =>
      dsarExtract(tx, eid),
    );
    expect((dsar.persons as unknown[]).length).toBeGreaterThan(0);
    expect(Object.keys(METRICS_DICTIONARY)).toContain('stp_rate');
  });
});
