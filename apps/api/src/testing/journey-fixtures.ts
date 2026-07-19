import { MockIcpAdapter } from '../integrations/icp_validation/mock';
import { MockInsurerAdapter } from '../integrations/insurer/mock';
import { MockMohreAdapter } from '../integrations/mohre/mock';
import { MockScreeningAdapter } from '../integrations/screening/mock';
import { MockSmsAdapter } from '../integrations/sms_otp/mock';
import { OtpAttestationService, type AttestationPurpose } from '../attestation/otp.service';
import { defaultRuleConfig } from '../rules/rule-config';
import { RulesEngine } from '../rules/rules-engine.service';
import { captureDetails } from '../engine/details.service';
import { routeRegime, startApplication } from '../engine/entry.service';
import { captureIdentity } from '../engine/identity.service';
import { generateQuote } from '../engine/quote.service';
import { runScreening } from '../engine/screening.service';
import { decide } from '../engine/decision.service';
import { makeTestEid } from './make-eid';
import type { TestDb } from './test-db';

/** One set of deterministic mocks for a whole journey (UAT-PLAN modes). */
export function makeMocks() {
  return {
    icp: new MockIcpAdapter(),
    mohre: new MockMohreAdapter(),
    screening: new MockScreeningAdapter(),
    insurer: new MockInsurerAdapter(),
    sms: new MockSmsAdapter(),
  };
}

export type EngineMocks = ReturnType<typeof makeMocks>;

/** Insurer-annex values resolved for tests. */
export function testRules(): RulesEngine {
  return new RulesEngine(
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
}

let serial = 1000000;
export const nextSerial = () => serial++;

export interface JourneyOpts {
  emirate?: 'dubai' | 'sharjah' | 'abu_dhabi';
  dob?: string;
  salaryBand?: 'lt_4k' | '4k_10k' | 'gt_10k';
  product?: string;
  fullName?: string;
  roleCode?: string;
}

/** Drives a clean applicant to an active quote (community: final). */
export async function buildQuotedApp(
  db: TestDb,
  tenantId: string,
  rules: RulesEngine,
  mocks: EngineMocks,
  opts: JourneyOpts = {},
): Promise<{ applicationId: string; personId: string; eid: string }> {
  const roleCode = opts.roleCode ?? 'broker_agent';
  const emirate = opts.emirate ?? 'sharjah';
  const { applicationId } = await db.as({ tenantId, roleCode }, (tx) =>
    startApplication(tx, { tenantId, channel: 'broker', language: 'en', privacyConsent: true }),
  );
  await db.as({ tenantId, roleCode }, (tx) =>
    routeRegime(tx, { applicationId, tenantId, emirateOfVisa: emirate, visaStatus: 'active' }),
  );
  const eid = makeTestEid(1990, nextSerial());
  const identity = await db.as({ tenantId, roleCode }, (tx) =>
    captureIdentity(tx, db.asPlatform, mocks.icp, rules, {
      applicationId,
      tenantId,
      eid,
      fullName: opts.fullName ?? `Journey Person ${serial}`,
      dob: opts.dob ?? '1990-01-01',
      gender: 'male',
      nationality: 'IN',
    }),
  );
  await db.as({ tenantId, roleCode }, (tx) =>
    captureDetails(tx, mocks.mohre, {
      applicationId,
      tenantId,
      mobile: '+9715xxxxx99',
      employmentCategory: 'private_employee',
      sponsorType: 'employer',
      salaryBand: opts.salaryBand ?? 'lt_4k',
      occupation: 'cook',
      sponsorNoticeAcknowledged: true,
    }),
  );
  await db.as({ tenantId, roleCode }, (tx) =>
    runScreening(tx, db.asPlatform, mocks.screening, { applicationId, tenantId }),
  );
  const product =
    opts.product ??
    (emirate === 'sharjah' ? 'FED-BASIC' : emirate === 'dubai' ? 'DXB-EBP' : 'AD-BASIC');
  await db.as({ tenantId, roleCode }, (tx) =>
    generateQuote(tx, { applicationId, tenantId, productCode: product }),
  );
  return { applicationId, personId: identity.personId!, eid };
}

/** Clean community journey to payment_pending via the decision matrix. */
export async function buildToPaymentPending(
  db: TestDb,
  tenantId: string,
  rules: RulesEngine,
  mocks: EngineMocks,
  opts: JourneyOpts = {},
): Promise<{ applicationId: string; personId: string; eid: string }> {
  const built = await buildQuotedApp(db, tenantId, rules, mocks, opts);
  await db.as({ tenantId, roleCode: opts.roleCode ?? 'broker_agent' }, (tx) =>
    decide(tx, rules, { applicationId: built.applicationId, tenantId }),
  );
  return built;
}

/** Runs a real OTP attestation via the mock SMS adapter. */
export async function attest(
  db: TestDb,
  tenantId: string,
  applicationId: string,
  purpose: AttestationPurpose,
  mocks: EngineMocks,
): Promise<string> {
  const svc = new OtpAttestationService(mocks.sms);
  const { challengeId } = await svc.createChallenge({
    tenantId,
    applicationId,
    purpose,
    phone: '+9715xxxxx99',
  });
  const last = mocks.sms.sent[mocks.sms.sent.length - 1]!;
  const code = /(\d{6})/.exec(last.message)![1]!;
  const { attestationId } = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
    svc.verify(tx, challengeId, code),
  );
  return attestationId;
}
