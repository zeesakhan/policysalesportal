import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkEddTriggers, resolveScreeningHold, runScreening } from '../../engine/screening.service';
import { captureDetails } from '../../engine/details.service';
import { routeRegime, startApplication } from '../../engine/entry.service';
import { captureIdentity } from '../../engine/identity.service';
import { makeTestEid } from '../../testing/make-eid';
import { PERSONAS } from '../personas';
import { setupUatEnv, type UatEnv } from '../uat-fixtures';

let uatSerial = 800000;

// WP-12 Part B — Screening & compliance (U-50..U-52)
let env: UatEnv;
beforeAll(async () => {
  env = await setupUatEnv('broker');
});
afterAll(() => env.db.close());

async function readyForScreening(fullName: string, dob: string, eid: string, payerName?: string) {
  const { applicationId } = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
    startApplication(tx, { tenantId: env.tenantId, channel: 'broker', language: 'en', privacyConsent: true }),
  );
  await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
    routeRegime(tx, { applicationId, tenantId: env.tenantId, emirateOfVisa: 'sharjah', visaStatus: 'active' }),
  );
  await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
    captureIdentity(tx, env.db.asPlatform, env.mocks.icp, env.rules, {
      applicationId,
      tenantId: env.tenantId,
      eid,
      fullName,
      dob,
      gender: 'male',
      nationality: 'SY',
    }),
  );
  await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
    captureDetails(tx, env.mocks.mohre, {
      applicationId,
      tenantId: env.tenantId,
      mobile: '+9715xxxxx17',
      employmentCategory: 'private_employee',
      sponsorType: 'employer',
      employerName: 'UAT Screening LLC',
      salaryBand: 'lt_4k',
      occupation: 'clerk',
      sponsorNoticeAcknowledged: true,
      payerName,
    }),
  );
  return applicationId;
}

describe('WP-12 §B — Screening & compliance', () => {
  // rules: KYC-012, KYC-013, REF-001
  it('U-50 Fuzzy watchlist match → compliance queue, neutral customer message, cleared in 1 day', async () => {
    const p17 = PERSONAS.P17!;
    const applicationId = await readyForScreening(p17.fullName, p17.dob, p17.eid!);
    const result = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      runScreening(tx, env.db.asPlatform, env.mocks.screening, { applicationId, tenantId: env.tenantId }),
    );
    expect(result.outcome).toBe('hold');
    expect(result.customerCategory).toBe('verification'); // KYC-013 neutral wording
    const c = await env.db.asPlatform((tx) =>
      tx.query<{ queue: string }>('SELECT queue FROM cases WHERE id = $1', [result.caseId]),
    );
    expect(c.rows[0]!.queue).toBe('compliance'); // REF-001: compliance, not underwriting
    const cleared = await env.db.as({ isPlatform: true, roleCode: 'compliance_officer' }, (tx) =>
      resolveScreeningHold(tx, {
        caseId: result.caseId!,
        tenantId: env.tenantId,
        disposition: 'false_positive',
        note: 'UAT disposition within 1 business day',
      }),
    );
    expect(cleared.outcome).toBe('cleared');
  });

  // rules: KYC-012
  it('U-51 Confirmed match → decline + freeze; no tipping-off content', async () => {
    const p18 = PERSONAS.P18!;
    const applicationId = await readyForScreening(p18.fullName, p18.dob, p18.eid!);
    const result = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      runScreening(tx, env.db.asPlatform, env.mocks.screening, { applicationId, tenantId: env.tenantId }),
    );
    expect(result.outcome).toBe('declined');
    expect(result.customerCategory).toBe('verification'); // never raw screening detail (J-R4)
    const app = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      tx.query<{ state: string }>('SELECT state FROM applications WHERE id = $1', [applicationId]),
    );
    expect(app.rows[0]!.state).toBe('declined'); // frozen, no further movement
  });

  // rules: KYC-020, KYC-004
  it('U-52 One payer paying for 3 unrelated insureds → EDD triggered', async () => {
    const payer = 'UAT Corporate Payer LLC';
    const a1 = await readyForScreening('Insured One', '1990-01-01', makeTestEid(1990, uatSerial++), payer);
    await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      runScreening(tx, env.db.asPlatform, env.mocks.screening, { applicationId: a1, tenantId: env.tenantId }),
    );
    let edd = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      checkEddTriggers(tx, env.db.asPlatform, { applicationId: a1, tenantId: env.tenantId }),
    );
    expect(edd.eddCaseId).toBeUndefined();
    for (const name of ['Insured Two', 'Insured Three']) {
      const app = await readyForScreening(name, '1991-01-01', makeTestEid(1991, uatSerial++), payer);
      await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
        runScreening(tx, env.db.asPlatform, env.mocks.screening, { applicationId: app, tenantId: env.tenantId }),
      );
      edd = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
        checkEddTriggers(tx, env.db.asPlatform, { applicationId: app, tenantId: env.tenantId }),
      );
    }
    expect(edd.eddCaseId).toBeTruthy(); // 3rd unrelated insured trips KYC-020/004
  });
});
