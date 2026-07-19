import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MockIcpAdapter } from '../integrations/icp_validation/mock';
import { MockMohreAdapter } from '../integrations/mohre/mock';
import { defaultRuleConfig } from '../rules/rule-config';
import { RulesEngine } from '../rules/rules-engine.service';
import { makeTestDb, type TestDb } from '../testing/test-db';
import { makeTestEid } from '../testing/make-eid';
import { addDependent, captureDetails, type DetailsInput } from './details.service';
import { routeRegime, startApplication } from './entry.service';
import { captureIdentity } from './identity.service';

let db: TestDb;
let tenantId: string;
const rules = new RulesEngine(defaultRuleConfig);
const icp = new MockIcpAdapter();
const mohre = new MockMohreAdapter();
let serial = 7000000;

beforeAll(async () => {
  db = await makeTestDb();
  tenantId = await db.createTenant('broker', 'Broker');
});

afterAll(() => db.close());

async function readyApp(emirate: 'dubai' | 'sharjah' | 'abu_dhabi'): Promise<{
  applicationId: string;
  eid: string;
}> {
  const { applicationId } = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
    startApplication(tx, { tenantId, channel: 'broker', language: 'hi', privacyConsent: true }),
  );
  await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
    routeRegime(tx, { applicationId, tenantId, emirateOfVisa: emirate, visaStatus: 'active' }),
  );
  const eid = makeTestEid(1990, serial++);
  await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
    captureIdentity(tx, db.asPlatform, icp, rules, {
      applicationId,
      tenantId,
      eid,
      fullName: 'Test Person',
      dob: '1990-06-15',
      gender: 'male',
      nationality: 'IN',
    }),
  );
  return { applicationId, eid };
}

const details = (applicationId: string, overrides: Partial<DetailsInput> = {}) =>
  db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
    captureDetails(tx, mohre, {
      applicationId,
      tenantId,
      mobile: '+9715xxxxx01',
      employmentCategory: 'private_employee',
      sponsorType: 'employer',
      employerName: 'ACME LLC',
      salaryBand: 'lt_4k',
      occupation: 'driver',
      ...overrides,
    }),
  );

describe('product-track routing (UW-204 / UW-301 / UW-401)', () => {
  it('test_UW_204_federal_scheme_population_routes_basic', async () => {
    const { applicationId } = await readyApp('sharjah');
    const result = await details(applicationId);
    expect(result.track).toBe('federal_basic');
  });

  it('test_UW_204_federal_freelancer_routes_alternative', async () => {
    const { applicationId } = await readyApp('sharjah');
    const result = await details(applicationId, {
      employmentCategory: 'freelancer',
      sponsorType: 'self',
    });
    expect(result.track).toBe('enhanced');
  });

  it('test_UW_301_dubai_salary_band_routes_ebp_vs_enhanced', async () => {
    const low = await readyApp('dubai');
    expect((await details(low.applicationId)).track).toBe('dubai_ebp');
    const high = await readyApp('dubai');
    expect((await details(high.applicationId, { salaryBand: '4k_10k' })).track).toBe('enhanced');
  });

  it('test_UW_401_ad_band_routes_basic_vs_enhanced', async () => {
    const low = await readyApp('abu_dhabi');
    expect(
      (await details(low.applicationId, { sponsorNoticeAcknowledged: true })).track,
    ).toBe('ad_basic');
    const high = await readyApp('abu_dhabi');
    expect(
      (
        await details(high.applicationId, {
          salaryBand: 'gt_10k',
          sponsorNoticeAcknowledged: true,
        })
      ).track,
    ).toBe('enhanced');
  });
});

describe('UW-402 — Abu Dhabi sponsor-obligation notice', () => {
  it('test_UW_402_requires_acknowledgement_for_employer_sponsored', async () => {
    const { applicationId } = await readyApp('abu_dhabi');
    await expect(details(applicationId)).rejects.toThrow(/UW-402/);
    const ok = await details(applicationId, { sponsorNoticeAcknowledged: true });
    expect(ok.sponsorNoticeShown).toBe(true);
  });

  it('no notice needed outside AD employer sponsorship', async () => {
    const { applicationId } = await readyApp('abu_dhabi');
    const ok = await details(applicationId, { sponsorType: 'self', employmentCategory: 'self_sponsored' });
    expect(ok.sponsorNoticeShown).toBe(false);
  });
});

describe('KYC-001a — MOHRE category validation (federal)', () => {
  it('test_KYC_001a_no_record_refers_not_declines', async () => {
    const { applicationId, eid } = await readyApp('sharjah');
    mohre.setNoRecord(eid);
    const result = await details(applicationId);
    expect(result.mohreReferralCaseId).toBeTruthy();
    const c = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      tx.query<{ queue: string; trigger_rule_ids: string[] }>(
        'SELECT queue, trigger_rule_ids FROM cases WHERE id = $1',
        [result.mohreReferralCaseId],
      ),
    );
    expect(c.rows[0]!.queue).toBe('underwriting');
    expect(c.rows[0]!.trigger_rule_ids).toContain('KYC-001a');
    // application NOT declined — data-lag cases exist
    const app = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      tx.query<{ state: string }>('SELECT state FROM applications WHERE id = $1', [applicationId]),
    );
    expect(app.rows[0]!.state).not.toBe('declined');
  });
});

describe('SC-05 dependents (UW-307 / UW-404 / REG-024)', () => {
  it('test_UW_307_dependent_is_separate_life_with_own_identity', async () => {
    const { applicationId } = await readyApp('dubai');
    await details(applicationId);
    const dep = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      addDependent(tx, icp, {
        applicationId,
        tenantId,
        relationship: 'spouse',
        fullName: 'Spouse Person',
        eid: makeTestEid(1992, serial++),
        dob: '1992-01-01',
        gender: 'female',
        nationality: 'IN',
      }),
    );
    const p = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      tx.query<{ kind: string; icp_status: string }>(
        'SELECT kind, icp_status FROM persons WHERE id = $1',
        [dep.personId],
      ),
    );
    expect(p.rows[0]).toEqual({ kind: 'dependent', icp_status: 'pass' });
  });

  it('test_UW_404_ad_child_19_rejected', async () => {
    const { applicationId } = await readyApp('abu_dhabi');
    await details(applicationId, { sponsorNoticeAcknowledged: true });
    const dob19 = new Date(Date.now() - 19 * 365.25 * 24 * 3600_000).toISOString().slice(0, 10);
    await expect(
      db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
        addDependent(tx, icp, {
          applicationId,
          tenantId,
          relationship: 'child',
          fullName: 'Adult Child',
          eid: makeTestEid(2007, serial++),
          dob: dob19,
          gender: 'male',
          nationality: 'IN',
        }),
      ),
    ).rejects.toThrow(/UW-404/);
  });

  it('test_REG_024_dubai_newborn_30_day_notice', async () => {
    const { applicationId } = await readyApp('dubai');
    await details(applicationId);
    const dob25daysAgo = new Date(Date.now() - 25 * 24 * 3600_000).toISOString().slice(0, 10);
    const dep = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      addDependent(tx, icp, {
        applicationId,
        tenantId,
        relationship: 'child',
        fullName: 'Newborn Person',
        passportNo: 'IN9988776',
        dob: dob25daysAgo,
        gender: 'female',
        nationality: 'IN',
      }),
    );
    expect(dep.newbornNotice).toBe(true);
  });
});
