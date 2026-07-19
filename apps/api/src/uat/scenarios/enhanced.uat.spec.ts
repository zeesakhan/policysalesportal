import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { decide, underwriterDecide, acceptCounterOffer } from '../../engine/decision.service';
import { submitDeclaration } from '../../engine/declaration.service';
import { attest } from '../../testing/journey-fixtures';
import { PERSONAS } from '../personas';
import { driveToQuote, setupUatEnv, type UatEnv } from '../uat-fixtures';

// WP-12 Part B — Enhanced plans (U-40..U-45)
let env: UatEnv;
beforeAll(async () => {
  env = await setupUatEnv('broker');
});
afterAll(() => env.db.close());

const noAnswers = { D1: false, D2: false, D3: false, D4: false, D5: false, D6: false, D7: false, D8: false };

describe('WP-12 §B — Enhanced plans', () => {
  // rules: UW-501, UW-503, UW-504, UW-510
  it('U-40 All declarations "No", age 35, BMI 24 → STP', async () => {
    const result = await driveToQuote(env, PERSONAS.P11!);
    if (result.declined || !result.applicationId) throw new Error('setup failed');
    await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      submitDeclaration(tx, env.rules, {
        applicationId: result.applicationId,
        tenantId: env.tenantId,
        personId: result.personId!,
        answers: noAnswers, // BMI-in-range is D7 = No
        sensitiveConsent: true,
      }),
    );
    const decision = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      decide(tx, env.rules, { applicationId: result.applicationId, tenantId: env.tenantId }),
    );
    expect(decision.outcome).toBe('stp');
    expect(decision.ruleIds).toEqual(['UW-510']);
  });

  // rules: UW-502, UW-506, QR-003
  it('U-41 Controlled hypertension on auto-accept list → auto-load applied, premium re-quoted, itemised', async () => {
    const result = await driveToQuote(env, PERSONAS.P12!);
    if (result.declined || !result.applicationId) throw new Error('setup failed');
    await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      submitDeclaration(tx, env.rules, {
        applicationId: result.applicationId,
        tenantId: env.tenantId,
        personId: result.personId!,
        answers: { ...noAnswers, D3: true },
        details: [{ question: 'D3', condition: 'controlled_hypertension_single_med' }],
        sensitiveConsent: true,
      }),
    );
    const decision = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      decide(tx, env.rules, { applicationId: result.applicationId, tenantId: env.tenantId }),
    );
    expect(decision.outcome).toBe('stp');
    const quote = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      tx.query<{ kind: string; breakdown: { loadings: number; base: number; fees: number; vat: number } }>(
        `SELECT kind, breakdown FROM quotes WHERE application_id = $1 AND status = 'active'`,
        [result.applicationId],
      ),
    );
    expect(quote.rows[0]!.kind).toBe('final'); // re-quoted final
    expect(quote.rows[0]!.breakdown.loadings).toBeGreaterThan(0); // itemised loading (QR-003)
  });

  // rules: UW-502, UW-508, REF-023
  it('U-42 Declared cancer history → REFER; insurer declines; customer offered federal Basic alternative', async () => {
    const result = await driveToQuote(env, PERSONAS.P13!);
    if (result.declined || !result.applicationId) throw new Error('setup failed');
    await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      submitDeclaration(tx, env.rules, {
        applicationId: result.applicationId,
        tenantId: env.tenantId,
        personId: result.personId!,
        answers: { ...noAnswers, D3: true },
        details: [{ question: 'D3', condition: 'metastatic_cancer' }],
        sensitiveConsent: true,
      }),
    );
    const decision = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      decide(tx, env.rules, { applicationId: result.applicationId, tenantId: env.tenantId }),
    );
    expect(decision.outcome).toBe('decline');
    expect(decision.customerCategory).toBe('medical');
    expect(decision.alternativeProductCode).toBe('DXB-EBP'); // regime-compliant alternative (Dubai visa)
  });

  // rules: UW-507, REF-021
  it('U-43 Counter-offer with exclusion → customer accepts via OTP; acceptance stored; payment proceeds', async () => {
    const result = await driveToQuote(env, PERSONAS.P15!);
    if (result.declined || !result.applicationId) throw new Error('setup failed');
    await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      submitDeclaration(tx, env.rules, {
        applicationId: result.applicationId,
        tenantId: env.tenantId,
        personId: result.personId!,
        answers: { ...noAnswers, D1: true },
        details: [{ question: 'D1', condition: 'past_surgery_needs_review' }],
        maf: { fullHistory: 'provided' },
        sensitiveConsent: true,
      }),
    );
    const decision = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      decide(tx, env.rules, { applicationId: result.applicationId, tenantId: env.tenantId }),
    );
    expect(decision.outcome).toBe('refer');
    const uw = await env.db.as({ roleCode: 'underwriter' }, (tx) =>
      underwriterDecide(tx, env.db.asPlatform, env.rules, {
        caseId: decision.caseId!,
        tenantId: env.tenantId,
        actorUserId: randomUUID(),
        decision: 'accept_with_terms',
        rationale: 'exclusion for the reviewed condition',
        exclusionText: 'excludes claims related to the declared condition for 12 months',
      }),
    );
    expect(uw.outcome).toBe('counter_offered');
    const attestationId = await attest(env.db, env.tenantId, result.applicationId, 'counter_offer', env.mocks);
    const accepted = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      acceptCounterOffer(tx, {
        counterOfferId: uw.counterOfferId!,
        tenantId: env.tenantId,
        attestationId,
      }),
    );
    expect(accepted.outcome).toBe('accepted'); // acceptance stored, payment_pending next
    const app = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      tx.query<{ state: string }>('SELECT state FROM applications WHERE id = $1', [result.applicationId]),
    );
    expect(app.rows[0]!.state).toBe('payment_pending');
  });

  // rules: REF-022
  it('U-44 Counter-offer ignored 8 days → lapsed', async () => {
    const result = await driveToQuote(env, PERSONAS.P16!);
    if (result.declined || !result.applicationId) throw new Error('setup failed');
    await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      submitDeclaration(tx, env.rules, {
        applicationId: result.applicationId,
        tenantId: env.tenantId,
        personId: result.personId!,
        answers: { ...noAnswers, D1: true },
        details: [{ question: 'D1', condition: 'unlisted_condition_lapser' }],
        maf: { fullHistory: 'provided' },
        sensitiveConsent: true,
      }),
    );
    const decision = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      decide(tx, env.rules, { applicationId: result.applicationId, tenantId: env.tenantId }),
    );
    const uw = await env.db.as({ roleCode: 'underwriter' }, (tx) =>
      underwriterDecide(tx, env.db.asPlatform, env.rules, {
        caseId: decision.caseId!,
        tenantId: env.tenantId,
        actorUserId: randomUUID(),
        decision: 'accept_with_terms',
        rationale: 'loading pending customer acceptance',
        loadingPct: 20,
      }),
    );
    // simulate 8 days elapsed by backdating valid_until
    await env.db.asPlatform((tx) =>
      tx.query(`UPDATE counter_offers SET valid_until = now() - interval '1 day' WHERE id = $1`, [
        uw.counterOfferId,
      ]),
    );
    const attestationId = await attest(env.db, env.tenantId, result.applicationId, 'counter_offer', env.mocks);
    const outcome = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      acceptCounterOffer(tx, { counterOfferId: uw.counterOfferId!, tenantId: env.tenantId, attestationId }),
    );
    expect(outcome.outcome).toBe('lapsed'); // re-application allowed (REF-022)
  });

  // rules: UW-504
  it('U-45 BMI 38 → REFER', async () => {
    const result = await driveToQuote(env, PERSONAS.P14!);
    if (result.declined || !result.applicationId) throw new Error('setup failed');
    await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      submitDeclaration(tx, env.rules, {
        applicationId: result.applicationId,
        tenantId: env.tenantId,
        personId: result.personId!,
        answers: { ...noAnswers, D7: true }, // D7: BMI outside 17-35
        details: [{ question: 'D7', condition: 'bmi_38_out_of_range' }],
        maf: { fullHistory: 'provided' },
        sensitiveConsent: true,
      }),
    );
    const decision = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      decide(tx, env.rules, { applicationId: result.applicationId, tenantId: env.tenantId }),
    );
    expect(decision.outcome).toBe('refer');
    expect(decision.ruleIds).toContain('UW-502'); // BMI declared as a D7 positive → UW-502 REFER path
  });
});
