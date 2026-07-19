import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDependent, captureDetails } from '../../engine/details.service';
import { routeRegime, startApplication } from '../../engine/entry.service';
import { captureIdentity } from '../../engine/identity.service';
import { makeTestEid } from '../../testing/make-eid';
import { PERSONAS } from '../personas';
import { setupUatEnv, type UatEnv } from '../uat-fixtures';

let uatSerial = 900000;
const makeUniqueEid = () => makeTestEid(1984, uatSerial++);

// WP-12 Part B — Abu Dhabi (U-30..U-31)
let env: UatEnv;
beforeAll(async () => {
  env = await setupUatEnv('broker');
});
afterAll(() => env.db.close());

describe('WP-12 §B — Abu Dhabi', () => {
  // rules: UW-402
  it('U-30 AD-visa employee individual purchase → sponsor-obligation notice + acknowledgement captured', async () => {
    const p09 = PERSONAS.P09!;
    const { applicationId } = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      startApplication(tx, { tenantId: env.tenantId, channel: 'broker', language: 'en', privacyConsent: true }),
    );
    await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      routeRegime(tx, { applicationId, tenantId: env.tenantId, emirateOfVisa: 'abu_dhabi', visaStatus: 'active' }),
    );
    await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      captureIdentity(tx, env.db.asPlatform, env.mocks.icp, env.rules, {
        applicationId,
        tenantId: env.tenantId,
        eid: p09.eid,
        fullName: p09.fullName,
        dob: p09.dob,
        gender: p09.gender,
        nationality: p09.nationality,
      }),
    );
    // acknowledgement withheld → blocked
    await expect(
      env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
        captureDetails(tx, env.mocks.mohre, {
          applicationId,
          tenantId: env.tenantId,
          mobile: '+9715xxxxx09',
          employmentCategory: p09.employmentCategory,
          sponsorType: p09.sponsorType,
          employerName: 'AD Employer LLC',
          salaryBand: p09.salaryBand,
          occupation: p09.occupation,
          sponsorNoticeAcknowledged: false,
        }),
      ),
    ).rejects.toThrow(/UW-402/);
    // acknowledged → notice shown + captured, proceeds
    const result = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      captureDetails(tx, env.mocks.mohre, {
        applicationId,
        tenantId: env.tenantId,
        mobile: '+9715xxxxx09',
        employmentCategory: p09.employmentCategory,
        sponsorType: p09.sponsorType,
        employerName: 'AD Employer LLC',
        salaryBand: p09.salaryBand,
        occupation: p09.occupation,
        sponsorNoticeAcknowledged: true,
      }),
    );
    expect(result.sponsorNoticeShown).toBe(true);
  });

  // rules: UW-404
  it('U-31 Dependent child aged 19 in sponsored-children category → validation rejects category', async () => {
    const p09 = PERSONAS.P09!;
    const { applicationId } = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      startApplication(tx, { tenantId: env.tenantId, channel: 'broker', language: 'en', privacyConsent: true }),
    );
    await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      routeRegime(tx, { applicationId, tenantId: env.tenantId, emirateOfVisa: 'abu_dhabi', visaStatus: 'active' }),
    );
    await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      captureIdentity(tx, env.db.asPlatform, env.mocks.icp, env.rules, {
        applicationId,
        tenantId: env.tenantId,
        eid: makeUniqueEid(),
        fullName: p09.fullName,
        dob: p09.dob,
        gender: p09.gender,
        nationality: p09.nationality,
      }),
    );
    await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
      captureDetails(tx, env.mocks.mohre, {
        applicationId,
        tenantId: env.tenantId,
        mobile: '+9715xxxxx10',
        employmentCategory: p09.employmentCategory,
        sponsorType: p09.sponsorType,
        employerName: 'AD Employer LLC',
        salaryBand: p09.salaryBand,
        occupation: p09.occupation,
        sponsorNoticeAcknowledged: true,
      }),
    );
    const dob19 = new Date(Date.now() - 19 * 365.25 * 24 * 3600_000).toISOString().slice(0, 10);
    await expect(
      env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
        addDependent(tx, env.mocks.icp, {
          applicationId,
          tenantId: env.tenantId,
          relationship: 'child',
          fullName: 'AD Child Nineteen',
          passportNo: 'EG1122334',
          dob: dob19,
          gender: 'male',
          nationality: 'EG',
        }),
      ),
    ).rejects.toThrow(/UW-404/);
  });
});
