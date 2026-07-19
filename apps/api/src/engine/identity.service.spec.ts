import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MockIcpAdapter } from '../integrations/icp_validation/mock';
import { defaultRuleConfig } from '../rules/rule-config';
import { RulesEngine } from '../rules/rules-engine.service';
import { makeTestDb, type TestDb } from '../testing/test-db';
import { makeTestEid } from '../testing/make-eid';
import { eidChecksumValid, formatEid, nameSimilarity, normalizeEid } from './eid';
import { routeRegime, startApplication } from './entry.service';
import { captureIdentity } from './identity.service';

let db: TestDb;
let tenantId: string;
const rules = new RulesEngine(defaultRuleConfig);
const icp = new MockIcpAdapter();

beforeAll(async () => {
  db = await makeTestDb();
  tenantId = await db.createTenant('typing_centre', 'TC');
});

afterAll(() => db.close());

async function newApplication(emirate: 'dubai' | 'sharjah' = 'sharjah'): Promise<string> {
  const { applicationId } = await db.as({ tenantId, roleCode: 'operator' }, (tx) =>
    startApplication(tx, { tenantId, channel: 'typing_centre', language: 'ur', privacyConsent: true }),
  );
  await db.as({ tenantId, roleCode: 'operator' }, (tx) =>
    routeRegime(tx, { applicationId, tenantId, emirateOfVisa: emirate, visaStatus: 'active' }),
  );
  return applicationId;
}

const identity = (applicationId: string, overrides: Record<string, unknown> = {}) =>
  db.as({ tenantId, roleCode: 'operator' }, (tx) =>
    captureIdentity(tx, db.asPlatform, icp, rules, {
      applicationId,
      tenantId,
      eid: makeTestEid(1990, 1234567),
      fullName: 'Rahim Uddin',
      dob: '1990-04-01',
      gender: 'male',
      nationality: 'BD',
      ...overrides,
    }),
  );

describe('UW-102 — EID format & checksum', () => {
  it('test_UW_102_checksum_validation', () => {
    const good = makeTestEid(1985, 7654321);
    expect(eidChecksumValid(good)).toBe(true);
    expect(eidChecksumValid(formatEid(good))).toBe(true); // dashed input accepted
    expect(eidChecksumValid(good.slice(0, 14) + ((Number(good[14]) + 1) % 10))).toBe(false);
    expect(eidChecksumValid('1234567890123456')).toBe(false); // wrong prefix/length
    expect(normalizeEid('784-1990-1234567-0')).toHaveLength(15);
  });

  it('test_UW_102_invalid_eid_declines_with_identity_category', async () => {
    const applicationId = await newApplication();
    const bad = makeTestEid(1990, 1111111);
    const tampered = bad.slice(0, 14) + ((Number(bad[14]) + 5) % 10);
    const result = await identity(applicationId, { eid: tampered });
    expect(result).toEqual({ outcome: 'declined', customerCategory: 'identity' });
    const row = await db.as({ tenantId, roleCode: 'operator' }, (tx) =>
      tx.query<{ state: string }>('SELECT state FROM applications WHERE id = $1', [applicationId]),
    );
    expect(row.rows[0]!.state).toBe('declined');
  });
});

describe('KYC-001 / INT-G1 — ICP validation is authoritative', () => {
  it('passes a clean applicant and stores the ICP result on the person', async () => {
    const applicationId = await newApplication();
    const result = await identity(applicationId);
    expect(result.outcome).toBe('ok');
    const p = await db.as({ tenantId, roleCode: 'operator' }, (tx) =>
      tx.query<{ icp_status: string }>('SELECT icp_status FROM persons WHERE id = $1', [
        result.personId,
      ]),
    );
    expect(p.rows[0]!.icp_status).toBe('pass');
  });

  it('test_KYC_001_icp_fail_refers_to_compliance_queue', async () => {
    const applicationId = await newApplication();
    const eid = makeTestEid(1975, 2222222);
    icp.setResponse(eid, 'expired');
    const result = await identity(applicationId, { eid });
    expect(result.outcome).toBe('referred');
    expect(result.customerCategory).toBe('verification'); // KYC-013 neutral wording
    const c = await db.as({ tenantId, roleCode: 'operator' }, (tx) =>
      tx.query<{ queue: string; trigger_rule_ids: string[] }>(
        'SELECT queue, trigger_rule_ids FROM cases WHERE id = $1',
        [result.caseId],
      ),
    );
    expect(c.rows[0]!.queue).toBe('compliance');
    expect(c.rows[0]!.trigger_rule_ids).toEqual(['KYC-001', 'UW-102']);
  });

  it('test_UW_102_ocr_name_mismatch_refers', async () => {
    const applicationId = await newApplication();
    const result = await identity(applicationId, {
      eid: makeTestEid(1992, 3333333),
      fullName: 'Rahim Uddin',
      ocrName: 'Completely Different Person',
    });
    expect(result.outcome).toBe('referred');
    expect(nameSimilarity('Rahim Uddin', 'RAHIM  uddin')).toBe(1);
  });
});

describe('KYC-002 — no-EID new-arrival path', () => {
  it('requires passport AND visa file, then creates the END-002a endorsement task', async () => {
    const applicationId = await newApplication();
    await expect(identity(applicationId, { eid: undefined, passportNo: 'BD1234567' })).rejects.toThrow(
      /KYC-002/,
    );
    const result = await identity(applicationId, {
      eid: undefined,
      passportNo: 'BD1234567',
      visaFileNo: '201/2026/1234567',
    });
    expect(result.outcome).toBe('ok');
    const t = await db.as({ tenantId, roleCode: 'operator' }, (tx) =>
      tx.query<{ type: string; due_at: string }>(
        `SELECT type, due_at FROM ops_tickets WHERE application_id = $1`,
        [applicationId],
      ),
    );
    expect(t.rows[0]!.type).toBe('eid_endorsement_due');
    expect(new Date(t.rows[0]!.due_at).getTime()).toBeGreaterThan(Date.now());
  });
});

describe('UW-105 — duplicate in-force policy per regime', () => {
  it('test_UW_105_duplicate_blocks_with_endorsement_routing', async () => {
    const eid = makeTestEid(1988, 4444444);
    const firstApp = await newApplication('dubai');
    await identity(firstApp, { eid });
    await db.as({ tenantId, roleCode: 'operator' }, (tx) =>
      tx.query(
        `INSERT INTO policies (tenant_id, application_id, policy_number, status, issued_at)
         VALUES ($1, $2, 'POL-TEST-1', 'registered', now())`,
        [tenantId, firstApp],
      ),
    );
    const secondApp = await newApplication('dubai');
    await expect(identity(secondApp, { eid })).rejects.toThrow(/UW-105/);
    // same EID in a DIFFERENT regime is allowed (per-regime rule)
    const federalApp = await newApplication('sharjah');
    const ok = await identity(federalApp, { eid });
    expect(ok.outcome).toBe('ok');
  });
});

describe('J-R3 — 30-day decline cooling forces manual UW', () => {
  it('test_J_R3_cooling_flags_reapplication', async () => {
    const eid = makeTestEid(1995, 5555555);
    const oldApp = await newApplication();
    await db.as({ tenantId, roleCode: 'operator' }, (tx) =>
      tx.query(
        `INSERT INTO decline_records (eid, application_id, reason_category) VALUES ($1, $2, 'medical')`,
        [eid, oldApp],
      ),
    );
    const reApp = await newApplication();
    const result = await identity(reApp, { eid });
    expect(result.outcome).toBe('ok');
    expect(result.coolingReferral).toBe(true);
    const row = await db.as({ tenantId, roleCode: 'operator' }, (tx) =>
      tx.query<{ cooling_referral: boolean }>(
        'SELECT cooling_referral FROM applications WHERE id = $1',
        [reApp],
      ),
    );
    expect(row.rows[0]!.cooling_referral).toBe(true);
  });
});
