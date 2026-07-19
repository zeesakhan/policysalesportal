import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MockIcpAdapter } from '../integrations/icp_validation/mock';
import { MockScreeningAdapter } from '../integrations/screening/mock';
import { defaultRuleConfig } from '../rules/rule-config';
import { RulesEngine } from '../rules/rules-engine.service';
import { makeTestDb, type TestDb } from '../testing/test-db';
import { makeTestEid } from '../testing/make-eid';
import { routeRegime, startApplication } from './entry.service';
import { captureIdentity } from './identity.service';
import { checkEddTriggers, resolveScreeningHold, runScreening } from './screening.service';

let db: TestDb;
let tenantId: string;
const rules = new RulesEngine(defaultRuleConfig);
const icp = new MockIcpAdapter();
const screening = new MockScreeningAdapter();
let serial = 6000000;

beforeAll(async () => {
  db = await makeTestDb();
  tenantId = await db.createTenant('broker', 'Broker');
});

afterAll(() => db.close());

async function applicantReady(fullName: string, payerName?: string): Promise<string> {
  const { applicationId } = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
    startApplication(tx, { tenantId, channel: 'broker', language: 'en', privacyConsent: true }),
  );
  await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
    routeRegime(tx, { applicationId, tenantId, emirateOfVisa: 'sharjah', visaStatus: 'active' }),
  );
  await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
    captureIdentity(tx, db.asPlatform, icp, rules, {
      applicationId,
      tenantId,
      eid: makeTestEid(1990, serial++),
      fullName,
      dob: '1990-01-01',
      gender: 'male',
      nationality: 'PK',
    }),
  );
  if (payerName) {
    await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      tx.query(`UPDATE applications SET payer_name = $1, payer_relationship = 'employer' WHERE id = $2`, [
        payerName,
        applicationId,
      ]),
    );
  }
  return applicationId;
}

const screen = (applicationId: string) =>
  db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
    runScreening(tx, db.asPlatform, screening, { applicationId, tenantId }),
  );

describe('KYC-010/011 — screening gate at S4', () => {
  it('test_KYC_011_clear_screening_moves_to_screened', async () => {
    const applicationId = await applicantReady('Clean Person');
    const result = await screen(applicationId);
    expect(result.outcome).toBe('clear');
    const row = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      tx.query<{ state: string; screened_at: string }>(
        'SELECT state, screened_at FROM applications WHERE id = $1',
        [applicationId],
      ),
    );
    expect(row.rows[0]!.state).toBe('screened');
    expect(row.rows[0]!.screened_at).toBeTruthy();
  });

  it('test_KYC_012_potential_match_holds_in_compliance_queue', async () => {
    const applicationId = await applicantReady('Fuzzy WATCHLIST Person');
    const result = await screen(applicationId);
    expect(result.outcome).toBe('hold');
    expect(result.customerCategory).toBe('verification'); // KYC-013: no tipping-off
    const c = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      tx.query<{ queue: string; trigger_rule_ids: string[] }>(
        'SELECT queue, trigger_rule_ids FROM cases WHERE id = $1',
        [result.caseId],
      ),
    );
    expect(c.rows[0]!.queue).toBe('compliance');
    expect(c.rows[0]!.trigger_rule_ids).toContain('KYC-012');
    // application is held in draft — not screened
    const app = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      tx.query<{ state: string }>('SELECT state FROM applications WHERE id = $1', [applicationId]),
    );
    expect(app.rows[0]!.state).toBe('draft');
  });

  it('test_UW_106_confirmed_match_declines_and_freezes', async () => {
    const applicationId = await applicantReady('SANCTIONED Name');
    const result = await screen(applicationId);
    expect(result.outcome).toBe('declined');
    const app = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      tx.query<{ state: string; decline_reason: string }>(
        'SELECT state, decline_reason FROM applications WHERE id = $1',
        [applicationId],
      ),
    );
    expect(app.rows[0]).toEqual({ state: 'declined', decline_reason: 'verification' });
    const str = await db.asPlatform((tx) =>
      tx.query(
        `SELECT id FROM audit_events WHERE entity_id = $1 AND action = 'screening.str_consideration_raised'`,
        [applicationId],
      ),
    );
    expect(str.rows).toHaveLength(1); // REG-042/KYC-031 escalation record
  });

  it('screening detail is invisible to channel roles (KYC-013/J-R4)', async () => {
    const rows = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      tx.query('SELECT * FROM screening_results'),
    );
    expect(rows.rows).toHaveLength(0);
    const platformRows = await db.asPlatform((tx) => tx.query('SELECT id FROM screening_results'));
    expect(platformRows.rows.length).toBeGreaterThan(0);
  });
});

describe('KYC-012 — compliance disposition', () => {
  it('false positive → whitelist + case closed + application proceeds; repeat friction suppressed', async () => {
    const applicationId = await applicantReady('Repeat WATCHLIST Trader');
    const hold = await screen(applicationId);
    const cleared = await db.as({ isPlatform: true, roleCode: 'compliance_officer' }, (tx) =>
      resolveScreeningHold(tx, {
        caseId: hold.caseId!,
        tenantId,
        disposition: 'false_positive',
        note: 'DOB mismatch vs list entry',
      }),
    );
    expect(cleared.outcome).toBe('cleared');
    const app = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      tx.query<{ state: string }>('SELECT state FROM applications WHERE id = $1', [applicationId]),
    );
    expect(app.rows[0]!.state).toBe('screened');
    // second application by the same name sails through (whitelisted)
    const secondApp = await applicantReady('Repeat WATCHLIST Trader');
    const second = await screen(secondApp);
    expect(second.outcome).toBe('clear');
  });

  it('confirmed disposition → decline + freeze', async () => {
    const applicationId = await applicantReady('Another WATCHLIST Person');
    const hold = await screen(applicationId);
    const declined = await db.as({ isPlatform: true, roleCode: 'compliance_officer' }, (tx) =>
      resolveScreeningHold(tx, {
        caseId: hold.caseId!,
        tenantId,
        disposition: 'confirmed',
        note: 'full identifiers match',
      }),
    );
    expect(declined.outcome).toBe('declined');
  });
});

describe('KYC-004/KYC-020 — payer screening and EDD trigger', () => {
  it('screens the payer and raises EDD at the third unrelated insured', async () => {
    const a1 = await applicantReady('Worker One', 'BigCo Payer LLC');
    await screen(a1);
    const e1 = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      checkEddTriggers(tx, db.asPlatform, { applicationId: a1, tenantId }),
    );
    expect(e1.eddCaseId).toBeUndefined();
    const a2 = await applicantReady('Worker Two', 'BigCo Payer LLC');
    await screen(a2);
    const a3 = await applicantReady('Worker Three', 'BigCo Payer LLC');
    const s3 = await screen(a3);
    expect(s3.outcome).toBe('clear');
    // payer name itself was screened on each application
    const payerScreens = await db.asPlatform((tx) =>
      tx.query(`SELECT id FROM screening_results WHERE subject_name = 'BigCo Payer LLC'`),
    );
    expect(payerScreens.rows.length).toBe(3);
    const e3 = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      checkEddTriggers(tx, db.asPlatform, { applicationId: a3, tenantId }),
    );
    expect(e3.eddCaseId).toBeTruthy();
  });
});
