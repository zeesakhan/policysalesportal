import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
import { submitDeclaration, type DeclarationInput } from './declaration.service';

let db: TestDb;
let tenantId: string;
const icp = new MockIcpAdapter();
const mohre = new MockMohreAdapter();
const screening = new MockScreeningAdapter();
let serial = 8500000;

// Insurer annex resolved for tests: auto-accept list with loadings, decline list
const rules = new RulesEngine(
  defaultRuleConfig.map((e) => {
    if (e.key === 'UW_502_AUTO_ACCEPT_LIST') {
      return {
        ...e,
        value: [
          { condition: 'controlled_hypertension_single_med', loadingPct: 15 },
          { condition: 'mild_asthma', loadingPct: 10 },
          { condition: 'high_loading_condition', loadingPct: 95 },
        ],
      };
    }
    if (e.key === 'UW_508_DECLINE_LIST') return { ...e, value: ['metastatic_cancer'] };
    if (e.key === 'UW_506_LOADING_CAP_PCT') return { ...e, value: 100 };
    return e;
  }),
);

beforeAll(async () => {
  db = await makeTestDb();
  await db.asPlatform((tx) => seedDemoCatalogue(tx));
  tenantId = await db.createTenant('broker', 'Broker');
});

afterAll(() => db.close());

async function enhancedQuotedApp(): Promise<{ applicationId: string; personId: string }> {
  const { applicationId } = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
    startApplication(tx, { tenantId, channel: 'broker', language: 'en', privacyConsent: true }),
  );
  await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
    routeRegime(tx, { applicationId, tenantId, emirateOfVisa: 'dubai', visaStatus: 'active' }),
  );
  const identity = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
    captureIdentity(tx, db.asPlatform, icp, rules, {
      applicationId,
      tenantId,
      eid: makeTestEid(1991, serial++),
      fullName: 'Declaring Person',
      dob: '1991-03-03',
      gender: 'female',
      nationality: 'PH',
    }),
  );
  await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
    captureDetails(tx, mohre, {
      applicationId,
      tenantId,
      mobile: '+9715xxxxx03',
      employmentCategory: 'private_employee',
      sponsorType: 'employer',
      salaryBand: 'gt_10k',
      occupation: 'nurse',
    }),
  );
  await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
    runScreening(tx, db.asPlatform, screening, { applicationId, tenantId }),
  );
  await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
    generateQuote(tx, { applicationId, tenantId, productCode: 'ENH-SILVER' }),
  );
  return { applicationId, personId: identity.personId! };
}

const noAnswers = { D1: false, D2: false, D3: false, D4: false, D5: false, D6: false, D7: false, D8: false };

const declare = (app: { applicationId: string; personId: string }, overrides: Partial<DeclarationInput> = {}) =>
  db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
    submitDeclaration(tx, rules, {
      applicationId: app.applicationId,
      tenantId,
      personId: app.personId,
      answers: noAnswers,
      sensitiveConsent: true,
      ...overrides,
    }),
  );

describe('SC-07 declarations (UW-501..508)', () => {
  it('test_REG_050_sensitive_consent_required', async () => {
    const app = await enhancedQuotedApp();
    await expect(declare(app, { sensitiveConsent: false })).rejects.toThrow(/REG-050/);
  });

  it('test_UW_501_all_no_is_clean_and_advances_to_declared', async () => {
    const app = await enhancedQuotedApp();
    const result = await declare(app);
    expect(result.status).toBe('clean');
    expect(result.allLivesDeclared).toBe(true);
    const row = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      tx.query<{ state: string }>('SELECT state FROM applications WHERE id = $1', [
        app.applicationId,
      ]),
    );
    expect(row.rows[0]!.state).toBe('declared');
  });

  it('test_UW_502_auto_accept_condition_loads_not_refers', async () => {
    const app = await enhancedQuotedApp();
    const result = await declare(app, {
      answers: { ...noAnswers, D3: true },
      details: [{ question: 'D3', condition: 'controlled_hypertension_single_med', medication: 'single' }],
    });
    expect(result.status).toBe('auto_load');
    expect(result.loadingPct).toBe(15);
  });

  it('test_UW_502_unlisted_condition_requires_maf_and_refers', async () => {
    const app = await enhancedQuotedApp();
    await expect(
      declare(app, {
        answers: { ...noAnswers, D1: true },
        details: [{ question: 'D1', condition: 'spinal_surgery' }],
      }),
    ).rejects.toThrow(/UW-502/); // MAF missing
    const result = await declare(app, {
      answers: { ...noAnswers, D1: true },
      details: [{ question: 'D1', condition: 'spinal_surgery' }],
      maf: { fullHistory: 'provided' },
    });
    expect(result.status).toBe('refer');
    expect(result.mafRequired).toBe(true);
  });

  it('test_UW_506_cumulative_loading_over_cap_refers', async () => {
    const app = await enhancedQuotedApp();
    const result = await declare(app, {
      answers: { ...noAnswers, D2: true, D3: true },
      details: [
        { question: 'D2', condition: 'high_loading_condition' },
        { question: 'D3', condition: 'mild_asthma' },
      ],
      maf: { fullHistory: 'provided' },
    });
    expect(result.status).toBe('refer'); // 95 + 10 = 105 > 100 cap
  });

  it('test_UW_508_decline_list_condition_declines', async () => {
    const app = await enhancedQuotedApp();
    const result = await declare(app, {
      answers: { ...noAnswers, D3: true },
      details: [{ question: 'D3', condition: 'metastatic_cancer' }],
    });
    expect(result.status).toBe('decline');
  });

  it('test_UW_505_pregnancy_notice_and_UW_504_bmi_refer', async () => {
    const app = await enhancedQuotedApp();
    const result = await declare(app, {
      answers: { ...noAnswers, D5: true, D6: true },
      maf: { fullHistory: 'provided' },
    });
    expect(result.pregnancyNotice).toBe(true);
    expect(result.status).toBe('refer');
  });

  it('test_UW_206_community_product_takes_no_declaration', async () => {
    const { applicationId } = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      startApplication(tx, { tenantId, channel: 'broker', language: 'en', privacyConsent: true }),
    );
    await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      routeRegime(tx, { applicationId, tenantId, emirateOfVisa: 'sharjah', visaStatus: 'active' }),
    );
    const identity = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      captureIdentity(tx, db.asPlatform, icp, rules, {
        applicationId,
        tenantId,
        eid: makeTestEid(1994, serial++),
        fullName: 'Basic Person',
        dob: '1994-01-01',
        gender: 'male',
        nationality: 'LK',
      }),
    );
    await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      captureDetails(tx, mohre, {
        applicationId,
        tenantId,
        mobile: '+9715xxxxx04',
        employmentCategory: 'private_employee',
        sponsorType: 'employer',
        salaryBand: 'lt_4k',
        occupation: 'guard',
      }),
    );
    await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      runScreening(tx, db.asPlatform, screening, { applicationId, tenantId }),
    );
    await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      generateQuote(tx, { applicationId, tenantId, productCode: 'FED-BASIC' }),
    );
    await expect(
      declare({ applicationId, personId: identity.personId! }),
    ).rejects.toThrow(/UW-206/);
  });

  it('declaration answers are stored in the TEN-002 lock and audit carries status only', async () => {
    const app = await enhancedQuotedApp();
    await declare(app, {
      answers: { ...noAnswers, D3: true },
      details: [{ question: 'D3', condition: 'controlled_hypertension_single_med' }],
    });
    // channel cannot read back the answers
    const asBroker = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      tx.query('SELECT * FROM health_declarations WHERE application_id = $1', [app.applicationId]),
    );
    expect(asBroker.rows).toHaveLength(0);
    // underwriter can
    const asUw = await db.as({ roleCode: 'underwriter' }, (tx) =>
      tx.query<{ answers: { details: { condition: string }[] } }>(
        'SELECT answers FROM health_declarations WHERE application_id = $1',
        [app.applicationId],
      ),
    );
    expect(asUw.rows[0]!.answers.details[0]!.condition).toBe('controlled_hypertension_single_med');
    // audit event contains status, never condition names
    const audit = await db.asPlatform((tx) =>
      tx.query<{ details: unknown; after_hash: string }>(
        `SELECT details, after_hash FROM audit_events WHERE entity_id = $1 AND action = 'declaration.submitted'`,
        [app.personId],
      ),
    );
    expect(JSON.stringify(audit.rows)).not.toContain('hypertension');
  });
});
