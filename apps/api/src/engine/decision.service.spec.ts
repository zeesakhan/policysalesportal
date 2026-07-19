import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { MockIcpAdapter } from '../integrations/icp_validation/mock';
import { MockMohreAdapter } from '../integrations/mohre/mock';
import { MockScreeningAdapter } from '../integrations/screening/mock';
import { defaultRuleConfig } from '../rules/rule-config';
import { RulesEngine } from '../rules/rules-engine.service';
import { seedDemoCatalogue } from '../db/seed-demo';
import { makeTestDb, type TestDb } from '../testing/test-db';
import { makeTestEid } from '../testing/make-eid';
import { captureDetails } from './details.service';
import { routeRegime, startApplication } from './entry.service';
import { captureIdentity } from './identity.service';
import { generateQuote } from './quote.service';
import { runScreening } from './screening.service';
import { submitDeclaration } from './declaration.service';
import { acceptCounterOffer, decide, underwriterDecide } from './decision.service';

let db: TestDb;
let tenantId: string;
let uwUserId: string;
const icp = new MockIcpAdapter();
const mohre = new MockMohreAdapter();
const screening = new MockScreeningAdapter();
let serial = 9000000;

const rules = new RulesEngine(
  defaultRuleConfig.map((e) => {
    if (e.key === 'UW_502_AUTO_ACCEPT_LIST') {
      return { ...e, value: [{ condition: 'controlled_hypertension_single_med', loadingPct: 15 }] };
    }
    if (e.key === 'UW_508_DECLINE_LIST') return { ...e, value: ['metastatic_cancer'] };
    if (e.key === 'UW_506_LOADING_CAP_PCT') return { ...e, value: 100 };
    if (e.key === 'UW_207_RESTRICTED_OCCUPATIONS') return { ...e, value: ['offshore_diver'] };
    return e;
  }),
);

const noAnswers = { D1: false, D2: false, D3: false, D4: false, D5: false, D6: false, D7: false, D8: false };

beforeAll(async () => {
  db = await makeTestDb();
  await db.asPlatform((tx) => seedDemoCatalogue(tx));
  tenantId = await db.createTenant('broker', 'Broker');
  uwUserId = randomUUID();
});

afterAll(() => db.close());

interface BuildOpts {
  emirate?: 'dubai' | 'sharjah' | 'abu_dhabi';
  dob?: string;
  salaryBand?: 'lt_4k' | '4k_10k' | 'gt_10k';
  occupation?: string;
  product?: string;
}

async function quotedApp(opts: BuildOpts = {}): Promise<{ applicationId: string; personId: string }> {
  const emirate = opts.emirate ?? 'sharjah';
  const { applicationId } = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
    startApplication(tx, { tenantId, channel: 'broker', language: 'en', privacyConsent: true }),
  );
  await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
    routeRegime(tx, { applicationId, tenantId, emirateOfVisa: emirate, visaStatus: 'active' }),
  );
  const identity = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
    captureIdentity(tx, db.asPlatform, icp, rules, {
      applicationId,
      tenantId,
      eid: makeTestEid(1990, serial++),
      fullName: `Decision Person ${serial}`,
      dob: opts.dob ?? '1990-01-01',
      gender: 'male',
      nationality: 'IN',
    }),
  );
  await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
    captureDetails(tx, mohre, {
      applicationId,
      tenantId,
      mobile: '+9715xxxxx05',
      employmentCategory: 'private_employee',
      sponsorType: 'employer',
      salaryBand: opts.salaryBand ?? 'lt_4k',
      occupation: opts.occupation ?? 'cook',
      sponsorNoticeAcknowledged: true,
    }),
  );
  await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
    runScreening(tx, db.asPlatform, screening, { applicationId, tenantId }),
  );
  const product = opts.product ?? (emirate === 'sharjah' ? 'FED-BASIC' : 'DXB-EBP');
  await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
    generateQuote(tx, { applicationId, tenantId, productCode: product }),
  );
  return { applicationId, personId: identity.personId! };
}

const runDecide = (applicationId: string) =>
  db.as({ tenantId, roleCode: 'broker_agent' }, (tx) => decide(tx, rules, { applicationId, tenantId }));

const appState = async (applicationId: string) =>
  (
    await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      tx.query<{ state: string }>('SELECT state FROM applications WHERE id = $1', [applicationId]),
    )
  ).rows[0]!.state;

describe('WP-04 §7 decision matrix', () => {
  it('test_UW_208_federal_clean_stp_to_payment', async () => {
    const { applicationId } = await quotedApp();
    const result = await runDecide(applicationId);
    expect(result).toEqual({ outcome: 'stp', ruleIds: ['UW-208'] });
    expect(await appState(applicationId)).toBe('payment_pending');
  });

  it('test_UW_202_over64_refers with 3-day medical SLA', async () => {
    const { applicationId } = await quotedApp({ dob: '1960-01-01' }); // age 66
    const result = await runDecide(applicationId);
    expect(result.outcome).toBe('refer');
    expect(result.ruleIds).toContain('UW-202');
    const c = await db.as({ roleCode: 'underwriter' }, (tx) =>
      tx.query<{ sla_due_at: string; queue: string }>(
        'SELECT sla_due_at, queue FROM cases WHERE id = $1',
        [result.caseId],
      ),
    );
    expect(c.rows[0]!.queue).toBe('underwriting');
    const slaMs = new Date(c.rows[0]!.sla_due_at).getTime() - Date.now();
    expect(slaMs).toBeGreaterThan(2.5 * 24 * 3600_000); // 3 business days
    expect(await appState(applicationId)).toBe('declared'); // held awaiting insurer
  });

  it('test_UW_503_enhanced_61_65_refers', async () => {
    const { applicationId } = await quotedApp({
      emirate: 'dubai',
      salaryBand: 'gt_10k',
      product: 'ENH-SILVER',
      dob: '1963-06-01', // 63
    });
    const { applicationId: appId, personId } = { applicationId, personId: '' };
    void personId;
    await db.as({ tenantId, roleCode: 'broker_agent' }, async (tx) => {
      const lives = await tx.query<{ id: string }>(
        `SELECT id FROM persons WHERE application_id = $1`,
        [appId],
      );
      await submitDeclaration(tx, rules, {
        applicationId: appId,
        tenantId,
        personId: lives.rows[0]!.id,
        answers: noAnswers,
        sensitiveConsent: true,
      });
    });
    const result = await runDecide(applicationId);
    expect(result.outcome).toBe('refer');
    expect(result.ruleIds).toContain('UW-503');
  });

  it('test_UW_207_restricted_occupation_refers', async () => {
    const { applicationId } = await quotedApp({ occupation: 'offshore_diver' });
    const result = await runDecide(applicationId);
    expect(result.outcome).toBe('refer');
    expect(result.ruleIds).toContain('UW-207');
  });

  it('test_UW_502_auto_load_stp_with_loaded_final_quote', async () => {
    const { applicationId, personId } = await quotedApp({
      emirate: 'dubai',
      salaryBand: 'gt_10k',
      product: 'ENH-SILVER',
    });
    await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      submitDeclaration(tx, rules, {
        applicationId,
        tenantId,
        personId,
        answers: { ...noAnswers, D3: true },
        details: [{ question: 'D3', condition: 'controlled_hypertension_single_med' }],
        sensitiveConsent: true,
      }),
    );
    const result = await runDecide(applicationId);
    expect(result.outcome).toBe('stp');
    expect(result.ruleIds).toEqual(['UW-510']);
    const q = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      tx.query<{ kind: string; breakdown: { loadings: number } }>(
        `SELECT kind, breakdown FROM quotes WHERE application_id = $1 AND status = 'active'`,
        [applicationId],
      ),
    );
    expect(q.rows[0]!.kind).toBe('final');
    expect(q.rows[0]!.breakdown.loadings).toBeGreaterThan(0); // UW-506 loading applied
  });

  it('test_UW_508_decline_records_cooling_and_offers_alternative', async () => {
    const { applicationId, personId } = await quotedApp({
      emirate: 'dubai',
      salaryBand: 'gt_10k',
      product: 'ENH-GOLD',
    });
    await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      submitDeclaration(tx, rules, {
        applicationId,
        tenantId,
        personId,
        answers: { ...noAnswers, D3: true },
        details: [{ question: 'D3', condition: 'metastatic_cancer' }],
        sensitiveConsent: true,
      }),
    );
    const result = await runDecide(applicationId);
    expect(result.outcome).toBe('decline');
    expect(result.customerCategory).toBe('medical'); // J-R4
    expect(result.alternativeProductCode).toBe('DXB-EBP'); // REF-023
    expect(await appState(applicationId)).toBe('declined');
    const cooling = await db.asPlatform((tx) =>
      tx.query('SELECT id FROM decline_records WHERE application_id = $1', [applicationId]),
    );
    expect(cooling.rows).toHaveLength(1); // J-R3
  });
});

describe('WP-08 — underwriter decisions and counter-offers', () => {
  async function referredApp(): Promise<{ applicationId: string; caseId: string }> {
    const { applicationId, personId } = await quotedApp({
      emirate: 'dubai',
      salaryBand: 'gt_10k',
      product: 'ENH-SILVER',
    });
    await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      submitDeclaration(tx, rules, {
        applicationId,
        tenantId,
        personId,
        answers: { ...noAnswers, D1: true },
        details: [{ question: 'D1', condition: 'old_fracture_surgery' }],
        maf: { history: 'full' },
        sensitiveConsent: true,
      }),
    );
    const result = await runDecide(applicationId);
    return { applicationId, caseId: result.caseId! };
  }

  it('test_REF_020_accept_resumes_at_payment', async () => {
    const { applicationId, caseId } = await referredApp();
    const decision = await db.as({ roleCode: 'underwriter' }, (tx) =>
      underwriterDecide(tx, db.asPlatform, rules, {
        caseId,
        tenantId,
        actorUserId: uwUserId,
        decision: 'accept',
        rationale: 'fully healed, no residual risk',
      }),
    );
    expect(decision.outcome).toBe('accepted');
    expect(await appState(applicationId)).toBe('payment_pending');
  });

  it('test_REF_021_counter_offer_needs_otp_acceptance_then_payment', async () => {
    const { applicationId, caseId } = await referredApp();
    const decision = await db.as({ roleCode: 'underwriter' }, (tx) =>
      underwriterDecide(tx, db.asPlatform, rules, {
        caseId,
        tenantId,
        actorUserId: uwUserId,
        decision: 'accept_with_terms',
        rationale: 'loading for surgical history',
        loadingPct: 25,
        exclusionText: 'pre-existing spinal conditions excluded 12 months',
      }),
    );
    expect(decision.outcome).toBe('counter_offered');

    // acceptance without a counter_offer attestation is rejected
    const wrongAttestation = await db.as({ tenantId, roleCode: 'broker_agent' }, async (tx) => {
      const r = await tx.query<{ id: string }>(
        `INSERT INTO attestations (tenant_id, application_id, purpose, phone, verified_at, artifact)
         VALUES ($1, $2, 'consent', 'x', now(), '{}') RETURNING id`,
        [tenantId, applicationId],
      );
      return r.rows[0]!.id;
    });
    await expect(
      db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
        acceptCounterOffer(tx, {
          counterOfferId: decision.counterOfferId!,
          tenantId,
          attestationId: wrongAttestation,
        }),
      ),
    ).rejects.toThrow(/REF-021/);

    const attestation = await db.as({ tenantId, roleCode: 'broker_agent' }, async (tx) => {
      const r = await tx.query<{ id: string }>(
        `INSERT INTO attestations (tenant_id, application_id, purpose, phone, verified_at, artifact)
         VALUES ($1, $2, 'counter_offer', 'x', now(), '{}') RETURNING id`,
        [tenantId, applicationId],
      );
      return r.rows[0]!.id;
    });
    const accepted = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      acceptCounterOffer(tx, {
        counterOfferId: decision.counterOfferId!,
        tenantId,
        attestationId: attestation,
      }),
    );
    expect(accepted.outcome).toBe('accepted');
    expect(await appState(applicationId)).toBe('payment_pending');
    // revised final quote carries the 25% loading
    const q = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      tx.query<{ breakdown: { loadings: number } }>(
        `SELECT breakdown FROM quotes WHERE application_id = $1 AND status = 'active'`,
        [applicationId],
      ),
    );
    expect(q.rows[0]!.breakdown.loadings).toBeGreaterThan(0);
  });

  it('test_REF_023_underwriter_decline_offers_alternative_and_cools', async () => {
    const { applicationId, caseId } = await referredApp();
    const decision = await db.as({ roleCode: 'underwriter' }, (tx) =>
      underwriterDecide(tx, db.asPlatform, rules, {
        caseId,
        tenantId,
        actorUserId: uwUserId,
        decision: 'decline',
        rationale: 'risk outside appetite',
      }),
    );
    expect(decision.outcome).toBe('declined');
    expect(decision.alternativeProductCode).toBe('DXB-EBP');
    expect(await appState(applicationId)).toBe('declined');
  });
});
