import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MockIcpAdapter } from '../integrations/icp_validation/mock';
import { MockMohreAdapter } from '../integrations/mohre/mock';
import { MockScreeningAdapter } from '../integrations/screening/mock';
import { defaultRuleConfig } from '../rules/rule-config';
import { RulesEngine } from '../rules/rules-engine.service';
import { seedDemoCatalogue, DEMO_RATE_VERSION } from '../db/seed-demo';
import { makeTestDb, type TestDb } from '../testing/test-db';
import { makeTestEid } from '../testing/make-eid';
import { addDependent, captureDetails } from './details.service';
import { routeRegime, startApplication } from './entry.service';
import { captureIdentity } from './identity.service';
import { generateQuote, requoteIfStale, VAT_RATE } from './quote.service';
import { runScreening } from './screening.service';

let db: TestDb;
let tenantId: string;
const rules = new RulesEngine(defaultRuleConfig);
const icp = new MockIcpAdapter();
const mohre = new MockMohreAdapter();
const screening = new MockScreeningAdapter();
let serial = 8000000;

beforeAll(async () => {
  db = await makeTestDb();
  await db.asPlatform((tx) => seedDemoCatalogue(tx));
  tenantId = await db.createTenant('broker', 'Broker');
});

afterAll(() => db.close());

async function screenedApp(opts: {
  emirate: 'dubai' | 'sharjah' | 'abu_dhabi';
  salaryBand?: 'lt_4k' | '4k_10k' | 'gt_10k';
  dob?: string;
}): Promise<string> {
  const { applicationId } = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
    startApplication(tx, { tenantId, channel: 'broker', language: 'en', privacyConsent: true }),
  );
  await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
    routeRegime(tx, { applicationId, tenantId, emirateOfVisa: opts.emirate, visaStatus: 'active' }),
  );
  await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
    captureIdentity(tx, db.asPlatform, icp, rules, {
      applicationId,
      tenantId,
      eid: makeTestEid(1990, serial++),
      fullName: 'Quote Person',
      dob: opts.dob ?? '1990-01-01',
      gender: 'male',
      nationality: 'NP',
    }),
  );
  await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
    captureDetails(tx, mohre, {
      applicationId,
      tenantId,
      mobile: '+9715xxxxx02',
      employmentCategory: 'private_employee',
      sponsorType: 'employer',
      employerName: 'ACME',
      salaryBand: opts.salaryBand ?? 'lt_4k',
      occupation: 'cleaner',
      sponsorNoticeAcknowledged: true,
    }),
  );
  await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
    runScreening(tx, db.asPlatform, screening, { applicationId, tenantId }),
  );
  return applicationId;
}

const quote = (applicationId: string, productCode: string, extra: Record<string, unknown> = {}) =>
  db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
    generateQuote(tx, { applicationId, tenantId, productCode, ...extra }),
  );

describe('SC-06 — community-rated final vs enhanced indicative', () => {
  it('test_QR_002_federal_basic_final_quote_before_declarations', async () => {
    const app = await screenedApp({ emirate: 'sharjah' });
    const q = await quote(app, 'FED-BASIC');
    expect(q.kind).toBe('final');
    // QR-003 itemisation: 320 base + 25 fees, VAT 5%
    expect(q.breakdown.base).toBe(320);
    expect(q.breakdown.fees).toBe(25);
    expect(q.breakdown.vat).toBe(Math.round(345 * VAT_RATE * 100) / 100);
    expect(q.breakdown.total).toBe(345 + q.breakdown.vat);
    expect(q.breakdown.rateTableVersion).toBe(DEMO_RATE_VERSION);
    const state = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      tx.query<{ state: string }>('SELECT state FROM applications WHERE id = $1', [app]),
    );
    expect(state.rows[0]!.state).toBe('quoted');
  });

  it('test_QR_002_enhanced_quote_is_indicative_with_age_banding', async () => {
    const app = await screenedApp({ emirate: 'dubai', salaryBand: '4k_10k', dob: '1985-01-01' });
    const q = await quote(app, 'ENH-SILVER', { options: { network: 'RN', copay: '0' } });
    expect(q.kind).toBe('indicative');
    expect(q.breakdown.lines[0]!.ageBand).toBe('31-45');
    expect(q.breakdown.lines[0]!.base).toBe(Math.round(1500 * 1.15 * 1.25 * 100) / 100);
  });

  it('test_UW_103_product_track_mismatch_blocked', async () => {
    const app = await screenedApp({ emirate: 'sharjah' }); // federal_basic track
    await expect(quote(app, 'DXB-EBP')).rejects.toThrow(/UW-103/);
    await expect(quote(app, 'ENH-SILVER')).rejects.toThrow(/UW-103/);
  });

  it('test_QR_006_per_life_rating_for_dependents', async () => {
    const app = await screenedApp({ emirate: 'dubai' });
    await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      addDependent(tx, icp, {
        applicationId: app,
        tenantId,
        relationship: 'spouse',
        fullName: 'Spouse Life',
        eid: makeTestEid(1993, serial++),
        dob: '1993-01-01',
        gender: 'female',
        nationality: 'NP',
      }),
    );
    const q = await quote(app, 'DXB-EBP');
    expect(q.breakdown.lines).toHaveLength(2);
    expect(q.breakdown.base).toBe(1400); // 700 per life
  });
});

describe('QR-004 — discounts only from insurer campaigns', () => {
  it('applies a valid campaign and rejects unknown codes', async () => {
    const app = await screenedApp({ emirate: 'dubai', salaryBand: 'gt_10k', dob: '2000-01-01' });
    const q = await quote(app, 'ENH-SILVER', { promoCode: 'DEMO10' });
    expect(q.breakdown.discount).toBeGreaterThan(0);
    const app2 = await screenedApp({ emirate: 'dubai', salaryBand: 'gt_10k' });
    await expect(quote(app2, 'ENH-SILVER', { promoCode: 'MADEUP' })).rejects.toThrow(/QR-004/);
  });
});

describe('QR-005/QR-030 — validity, supersession, re-quote', () => {
  it('supersedes the previous quote on re-quote; quotes stay immutable', async () => {
    const app = await screenedApp({ emirate: 'sharjah' });
    const q1 = await quote(app, 'FED-BASIC');
    const q2 = await quote(app, 'FED-BASIC');
    const rows = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      tx.query<{ id: string; status: string }>(
        'SELECT id, status FROM quotes WHERE application_id = $1 ORDER BY created_at',
        [app],
      ),
    );
    expect(rows.rows.map((r) => r.status)).toEqual(['superseded', 'active']);
    expect(q1.quoteId).not.toBe(q2.quoteId);
  });

  it('test_QR_030_rate_change_requotes_unpaid_but_honours_paid', async () => {
    const app = await screenedApp({ emirate: 'sharjah' });
    const q1 = await quote(app, 'FED-BASIC');
    // insurer publishes a new rate version
    await db.as({ isPlatform: true, roleCode: 'rates_manager' }, async (tx) => {
      await tx.query(`UPDATE rate_tables SET status = 'superseded' WHERE product_code = 'FED-BASIC'`);
      await tx.query(
        `INSERT INTO rate_tables (version, product_code, effective_from, matrix)
         VALUES ('RT-DEMO-2026-08', 'FED-BASIC', '2026-08-01', '{"type":"flat","ratePerLife":360,"fees":25}')`,
      );
    });
    const requoted = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      requoteIfStale(tx, { applicationId: app, tenantId, quoteId: q1.quoteId }),
    );
    expect(requoted.requoted).toBe(true);
    expect(requoted.newTotal).toBeGreaterThan(requoted.oldTotal!);

    // paid application: price honoured, no re-rate
    await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      tx.query(`UPDATE applications SET state = 'paid' WHERE id = $1`, [app]),
    );
    const honoured = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      requoteIfStale(tx, { applicationId: app, tenantId, quoteId: requoted.quoteId }),
    );
    expect(honoured.requoted).toBe(false);
  });
});
