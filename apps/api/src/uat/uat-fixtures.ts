import { seedDemoCatalogue } from '../db/seed-demo';
import { captureDetails } from '../engine/details.service';
import { routeRegime, startApplication } from '../engine/entry.service';
import { captureIdentity } from '../engine/identity.service';
import { generateQuote } from '../engine/quote.service';
import { runScreening } from '../engine/screening.service';
import {
  makeMocks,
  testRules,
  type EngineMocks,
} from '../testing/journey-fixtures';
import { makeTestDb, type TestDb } from '../testing/test-db';
import type { Persona } from './personas';

/**
 * UAT-PLAN §1/§4 — one fresh embedded-Postgres environment per scenario
 * file, seeded catalogue, mocks in deterministic mode (each mock's default
 * behaviour is overridden per-scenario to select the mode under test).
 */
export async function setupUatEnv(tenantType: 'broker' | 'typing_centre' = 'broker') {
  const db = await makeTestDb();
  await db.asPlatform((tx) => seedDemoCatalogue(tx));
  const tenantId = await db.createTenant(tenantType, `UAT ${tenantType}`);
  const rules = testRules();
  const mocks = makeMocks();
  const roleCode = tenantType === 'typing_centre' ? 'operator' : 'broker_agent';
  return { db, tenantId, rules, mocks, roleCode };
}

export interface UatEnv {
  db: TestDb;
  tenantId: string;
  rules: ReturnType<typeof testRules>;
  mocks: EngineMocks;
  roleCode: string;
}

/** Drives SC-01→SC-02 (entry + regime routing) for a persona. */
export async function startAndRoute(
  env: UatEnv,
  persona: Persona,
  overrides: Partial<{ visaStatus: Persona['visaStatus']; channel: 'direct' | 'typing_centre' | 'broker' | 'affiliate' }> = {},
) {
  const { applicationId } = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
    startApplication(tx, {
      tenantId: env.tenantId,
      channel: overrides.channel ?? (env.roleCode === 'operator' ? 'typing_centre' : 'broker'),
      language: 'en',
      privacyConsent: true,
    }),
  );
  const routed = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
    routeRegime(tx, {
      applicationId,
      tenantId: env.tenantId,
      emirateOfVisa: persona.emirateOfVisa,
      visaStatus: overrides.visaStatus ?? persona.visaStatus,
    }),
  );
  return { applicationId, routed };
}

/** Drives SC-03→SC-06 (identity, details, screening, quote) for a persona. */
export async function driveToQuote(
  env: UatEnv,
  persona: Persona,
  opts: { productCode?: string; eidOverride?: string } = {},
) {
  const { applicationId, routed } = await startAndRoute(env, persona);
  if (routed.declined) return { applicationId, declined: true as const, routed };

  const identity = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
    captureIdentity(tx, env.db.asPlatform, env.mocks.icp, env.rules, {
      applicationId,
      tenantId: env.tenantId,
      eid: opts.eidOverride ?? persona.eid,
      fullName: persona.fullName,
      dob: persona.dob,
      gender: persona.gender,
      nationality: persona.nationality,
    }),
  );
  if (identity.outcome !== 'ok') return { applicationId, declined: identity.outcome === 'declined', identity };

  await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
    captureDetails(tx, env.mocks.mohre, {
      applicationId,
      tenantId: env.tenantId,
      mobile: '+9715xxxxx01',
      employmentCategory: persona.employmentCategory,
      sponsorType: persona.sponsorType,
      employerName: persona.sponsorType === 'employer' ? 'UAT Employer LLC' : undefined,
      salaryBand: persona.salaryBand,
      occupation: persona.occupation,
      sponsorNoticeAcknowledged: true,
    }),
  );

  const screening = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
    runScreening(tx, env.db.asPlatform, env.mocks.screening, { applicationId, tenantId: env.tenantId }),
  );
  if (screening.outcome !== 'clear') {
    return { applicationId, declined: screening.outcome === 'declined', screening, identity };
  }

  const track = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
    tx.query<{ product_track: string }>('SELECT product_track FROM applications WHERE id = $1', [applicationId]),
  );
  const defaultProduct: Record<string, string> = {
    federal_basic: 'FED-BASIC',
    dubai_ebp: 'DXB-EBP',
    ad_basic: 'AD-BASIC',
    enhanced: 'ENH-SILVER',
  };
  const productCode = opts.productCode ?? defaultProduct[track.rows[0]!.product_track] ?? 'FED-BASIC';

  const quote = await env.db.as({ tenantId: env.tenantId, roleCode: env.roleCode }, (tx) =>
    generateQuote(tx, { applicationId, tenantId: env.tenantId, productCode }),
  );
  return { applicationId, declined: false as const, identity, screening, quote, personId: identity.personId! };
}
