import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { decide } from '../../engine/decision.service';
import { orchestrateIssuance } from '../../engine/issuance.service';
import { handlePaymentWebhook, requestPayment } from '../../engine/payment.service';
import {
  computeRefund,
  evaluateRenewal,
  requestCancellation,
} from '../../engine/lifecycle.service';
import { accrueLedgers } from '../../engine/money.service';
import { bordereau, exceptionsReport } from '../../engine/reports.service';
import { attest } from '../../testing/journey-fixtures';
import { makeTestEid } from '../../testing/make-eid';
import { PERSONAS } from '../personas';
import { driveToQuote, setupUatEnv, type UatEnv } from '../uat-fixtures';

// WP-12 Part B — Lifecycle & money (U-80..U-86)
let env: UatEnv;
let uatSerial = 600000;
beforeAll(async () => {
  env = await setupUatEnv('broker');
});
afterAll(() => env.db.close());

async function registeredPolicyFor(personaKey: keyof typeof PERSONAS) {
  const persona = PERSONAS[personaKey]!;
  const result = await driveToQuote(env, persona, { eidOverride: makeTestEid(1990, uatSerial++) });
  if (result.declined || !result.applicationId) throw new Error('setup failed');
  await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
    decide(tx, env.rules, { applicationId: result.applicationId, tenantId: env.tenantId }),
  );
  const attestationId = await attest(env.db, env.tenantId, result.applicationId, 'review', env.mocks);
  const link = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
    requestPayment(tx, env.mocks.insurer, env.rules, {
      applicationId: result.applicationId,
      tenantId: env.tenantId,
      attestationId,
    }),
  );
  await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
    handlePaymentWebhook(tx, { providerRef: link.paymentRef, status: 'confirmed' }),
  );
  await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
    orchestrateIssuance(tx, env.mocks.insurer, { applicationId: result.applicationId, tenantId: env.tenantId }),
  );
  const p = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
    tx.query<{ id: string }>('SELECT id FROM policies WHERE application_id = $1', [result.applicationId]),
  );
  return { applicationId: result.applicationId, policyId: p.rows[0]!.id };
}

describe('WP-12 §B — Lifecycle & money', () => {
  // rules: END-011
  it('U-80 Cancellation pre-registration → full refund computed and displayed pre-confirmation', async () => {
    // Pre-registration: force the registration leg to fail so the policy
    // stops at 'issued' (paid, not yet registered) — the moment END-011's
    // "pre-registration full refund" clause applies.
    const persona = PERSONAS.P01!;
    const result = await driveToQuote(env, persona, { eidOverride: makeTestEid(1990, uatSerial++) });
    if (result.declined || !result.applicationId) throw new Error('setup failed');
    await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      decide(tx, env.rules, { applicationId: result.applicationId, tenantId: env.tenantId }),
    );
    const attestationId = await attest(env.db, env.tenantId, result.applicationId, 'review', env.mocks);
    const link = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      requestPayment(tx, env.mocks.insurer, env.rules, {
        applicationId: result.applicationId,
        tenantId: env.tenantId,
        attestationId,
      }),
    );
    await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      handlePaymentWebhook(tx, { providerRef: link.paymentRef, status: 'confirmed' }),
    );
    const originalRegister = env.mocks.insurer.registerPolicy.bind(env.mocks.insurer);
    env.mocks.insurer.registerPolicy = async (input) => {
      env.mocks.insurer.registerPolicy = originalRegister;
      env.mocks.insurer.failRegistrations(input.policyNumber, 99);
      return originalRegister(input);
    };
    const issued = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      orchestrateIssuance(tx, env.mocks.insurer, { applicationId: result.applicationId, tenantId: env.tenantId }),
    );
    expect(issued.registered).toBe(false); // still 'issued', not 'registered'
    const p = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      tx.query<{ id: string }>('SELECT id FROM policies WHERE application_id = $1', [result.applicationId]),
    );
    const policyId = p.rows[0]!.id;
    // the refund preview must be visible BEFORE the customer confirms
    const preview = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      computeRefund(tx, env.rules, { policyId }),
    );
    expect(preview.basis).toBe('full_pre_registration');
    const cancelled = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      requestCancellation(tx, env.db.asPlatform, env.rules, {
        tenantId: env.tenantId,
        policyId,
        reason: 'leaving_uae',
        visaWarningAcknowledged: true,
      }),
    );
    expect(cancelled.refund).toBe(preview.refund); // computed value matches what was displayed
  });

  // rules: END-012
  it('U-81 Cancellation of visa-linked policy → warning + acknowledgement captured', async () => {
    const { policyId } = await registeredPolicyFor('P05');
    await expect(
      env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
        requestCancellation(tx, env.db.asPlatform, env.rules, {
          tenantId: env.tenantId,
          policyId,
          reason: 'visa_cancelled',
          visaWarningAcknowledged: false,
        }),
      ),
    ).rejects.toThrow(/END-012/);
    const acknowledged = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      requestCancellation(tx, env.db.asPlatform, env.rules, {
        tenantId: env.tenantId,
        policyId,
        reason: 'visa_cancelled',
        visaWarningAcknowledged: true,
      }),
    );
    expect(acknowledged.cancellationId).toBeTruthy(); // acknowledgement captured, then processed
  });

  // rules: QR-022, END-014
  it('U-82 Cancellation triggers commission + payout clawback', async () => {
    const { policyId } = await registeredPolicyFor('P01');
    await env.db.asPlatform((tx) => accrueLedgers(tx, env.rules));
    const before = await env.db.asPlatform((tx) =>
      tx.query<{ status: string }>('SELECT status FROM commission_receivable WHERE policy_id = $1', [policyId]),
    );
    expect(before.rows[0]!.status).toBe('due');
    await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      requestCancellation(tx, env.db.asPlatform, env.rules, {
        tenantId: env.tenantId,
        policyId,
        reason: 'dissatisfaction',
        visaWarningAcknowledged: true,
      }),
    );
    const after = await env.db.asPlatform((tx) =>
      tx.query<{ status: string }>('SELECT status FROM commission_receivable WHERE policy_id = $1', [policyId]),
    );
    expect(after.rows[0]!.status).toBe('clawed');
  });

  // rules: END-015, KYC-020
  it('U-83 Second cancel-refund cycle in year → EDD flag + purchase block', async () => {
    const p25 = PERSONAS.P25!;
    const eid = makeTestEid(1986, uatSerial++);
    const first = await driveToQuote(env, p25, { eidOverride: eid });
    if (first.declined) throw new Error('setup failed');
    await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      decide(tx, env.rules, { applicationId: first.applicationId, tenantId: env.tenantId }),
    );
    const a1 = await attest(env.db, env.tenantId, first.applicationId, 'review', env.mocks);
    const link1 = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      requestPayment(tx, env.mocks.insurer, env.rules, { applicationId: first.applicationId, tenantId: env.tenantId, attestationId: a1 }),
    );
    await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      handlePaymentWebhook(tx, { providerRef: link1.paymentRef, status: 'confirmed' }),
    );
    await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      orchestrateIssuance(tx, env.mocks.insurer, { applicationId: first.applicationId, tenantId: env.tenantId }),
    );
    const p1 = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      tx.query<{ id: string }>('SELECT id FROM policies WHERE application_id = $1', [first.applicationId]),
    );
    await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      requestCancellation(tx, env.db.asPlatform, env.rules, {
        tenantId: env.tenantId,
        policyId: p1.rows[0]!.id,
        reason: 'dissatisfaction',
        visaWarningAcknowledged: true,
      }),
    );
    // second purchase-cancel cycle, same EID
    const second = await driveToQuote(env, p25, { eidOverride: eid });
    if (second.declined) throw new Error('setup failed');
    await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      decide(tx, env.rules, { applicationId: second.applicationId, tenantId: env.tenantId }),
    );
    const a2 = await attest(env.db, env.tenantId, second.applicationId, 'review', env.mocks);
    const link2 = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      requestPayment(tx, env.mocks.insurer, env.rules, { applicationId: second.applicationId, tenantId: env.tenantId, attestationId: a2 }),
    );
    await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      handlePaymentWebhook(tx, { providerRef: link2.paymentRef, status: 'confirmed' }),
    );
    await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      orchestrateIssuance(tx, env.mocks.insurer, { applicationId: second.applicationId, tenantId: env.tenantId }),
    );
    const p2 = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      tx.query<{ id: string }>('SELECT id FROM policies WHERE application_id = $1', [second.applicationId]),
    );
    const cancelled = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      requestCancellation(tx, env.db.asPlatform, env.rules, {
        tenantId: env.tenantId,
        policyId: p2.rows[0]!.id,
        reason: 'dissatisfaction',
        visaWarningAcknowledged: true,
      }),
    );
    expect(cancelled.eddCaseId).toBeTruthy();
    const blocked = await env.db.asPlatform((tx) =>
      tx.query('SELECT id FROM purchase_blocks WHERE eid = $1', [eid]),
    );
    expect(blocked.rows).toHaveLength(1);
    // further purchase attempts by this EID are blocked at identity capture
    const { startApplication, routeRegime } = await import('../../engine/entry.service');
    const { captureIdentity } = await import('../../engine/identity.service');
    const { applicationId: thirdApp } = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      startApplication(tx, { tenantId: env.tenantId, channel: 'broker', language: 'en', privacyConsent: true }),
    );
    await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      routeRegime(tx, { applicationId: thirdApp, tenantId: env.tenantId, emirateOfVisa: p25.emirateOfVisa, visaStatus: 'active' }),
    );
    await expect(
      env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
        captureIdentity(tx, env.db.asPlatform, env.mocks.icp, env.rules, {
          applicationId: thirdApp,
          tenantId: env.tenantId,
          eid,
          fullName: p25.fullName,
          dob: p25.dob,
          gender: p25.gender,
          nationality: p25.nationality,
        }),
      ),
    ).rejects.toThrow(/END-015/);
  });

  // rules: END-020, UW-202
  it('U-84 Renewal at age crossing 65 on federal scheme → renewal runs UW → REFER', async () => {
    const { applicationId, policyId } = await registeredPolicyFor('P01');
    const clean = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      evaluateRenewal(tx, env.rules, { policyId }),
    );
    expect(clean.outcome).toBe('stp');
    await env.db.asPlatform((tx) =>
      tx.query(`UPDATE persons SET dob = '1959-01-01' WHERE application_id = $1`, [applicationId]),
    );
    const aged = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      evaluateRenewal(tx, env.rules, { policyId }),
    );
    expect(aged.outcome).toBe('refer');
    expect(aged.ruleIds).toContain('UW-202');
  });

  // rules: PAY-030, MIS-002
  it('U-85 Daily three-way match detects a seeded paid-not-issued orphan', async () => {
    const result = await driveToQuote(env, PERSONAS.P01!, { eidOverride: makeTestEid(1990, uatSerial++) });
    if (result.declined || !result.applicationId) throw new Error('setup failed');
    await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      decide(tx, env.rules, { applicationId: result.applicationId, tenantId: env.tenantId }),
    );
    const attestationId = await attest(env.db, env.tenantId, result.applicationId, 'review', env.mocks);
    const link = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      requestPayment(tx, env.mocks.insurer, env.rules, {
        applicationId: result.applicationId,
        tenantId: env.tenantId,
        attestationId,
      }),
    );
    await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      handlePaymentWebhook(tx, { providerRef: link.paymentRef, status: 'confirmed' }),
    );
    // deliberately DO NOT call orchestrateIssuance — this is the seeded orphan
    const report = await env.db.asPlatform((tx) => exceptionsReport(tx));
    expect(report.orphans).toContainEqual({ applicationId: result.applicationId, orphanType: 'paid_not_issued' });
  });

  // rules: MIS bordereau, MIS-002
  it('U-86 Bordereau for a test month ties exactly to policies issued', async () => {
    await registeredPolicyFor('P01');
    const today = new Date().toISOString().slice(0, 10);
    const rows = await env.db.asPlatform((tx) => bordereau(tx, { from: today, to: today }));
    const issuedPolicies = await env.db.asPlatform((tx) =>
      tx.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM policies WHERE issued_at::date = current_date`,
      ),
    );
    expect(rows.length).toBe(Number(issuedPolicies.rows[0]!.n)); // ties exactly
    expect(rows.some((r) => (r as { policy_number?: string }).policy_number)).toBe(true);
  });
});
