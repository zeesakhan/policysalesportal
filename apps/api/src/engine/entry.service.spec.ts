import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeTestDb, type TestDb } from '../testing/test-db';
import { routeRegime, startApplication } from './entry.service';
import { EMIRATES, regimeForEmirate } from './regime';

let db: TestDb;
let tenantId: string;

beforeAll(async () => {
  db = await makeTestDb();
  tenantId = await db.createTenant('broker', 'Broker');
});

afterAll(() => db.close());

const start = () =>
  db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
    startApplication(tx, {
      tenantId,
      channel: 'broker',
      language: 'en',
      privacyConsent: true,
    }),
  );

describe('SC-01 entry (REG-050 consent, QR-023 attribution)', () => {
  it('test_REG_050_consent_required — refuses to start without privacy consent', async () => {
    await expect(
      db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
        startApplication(tx, {
          tenantId,
          channel: 'direct',
          language: 'ur',
          privacyConsent: false,
        }),
      ),
    ).rejects.toThrow(/REG-050/);
  });

  it('records consent timestamp, channel, language and affiliate attribution', async () => {
    const { applicationId } = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      startApplication(tx, {
        tenantId,
        channel: 'direct',
        language: 'bn',
        affiliateCode: 'AFF-123',
        privacyConsent: true,
      }),
    );
    const row = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      tx.query<{ consent_at: string; affiliate_code: string; language: string }>(
        'SELECT consent_at, affiliate_code, language FROM applications WHERE id = $1',
        [applicationId],
      ),
    );
    expect(row.rows[0]!.consent_at).toBeTruthy();
    expect(row.rows[0]!.affiliate_code).toBe('AFF-123');
    expect(row.rows[0]!.language).toBe('bn');
    const audit = await db.asPlatform((tx) =>
      tx.query<{ rule_ids: string[] }>(
        `SELECT rule_ids FROM audit_events WHERE entity_id = $1 AND action = 'application.started'`,
        [applicationId],
      ),
    );
    expect(audit.rows[0]!.rule_ids).toEqual(['REG-050', 'QR-023']);
  });
});

describe('SC-02 regime routing (UW-101, UW-103)', () => {
  it('test_UW_103_regime_mapping — visa emirate is the master branch', () => {
    expect(regimeForEmirate('dubai')).toBe('dubai');
    expect(regimeForEmirate('abu_dhabi')).toBe('abu_dhabi');
    for (const northern of ['sharjah', 'ajman', 'umm_al_quwain', 'ras_al_khaimah', 'fujairah'] as const) {
      expect(regimeForEmirate(northern)).toBe('federal');
    }
    expect(EMIRATES).toHaveLength(7);
  });

  it('test_UW_103_sets_regime_from_visa_not_residence', async () => {
    const { applicationId } = await start();
    const result = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      routeRegime(tx, {
        applicationId,
        tenantId,
        emirateOfVisa: 'dubai',
        visaStatus: 'active',
      }),
    );
    expect(result).toEqual({ regime: 'dubai', declined: false });
    const row = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      tx.query<{ regime: string; state: string }>(
        'SELECT regime, state FROM applications WHERE id = $1',
        [applicationId],
      ),
    );
    expect(row.rows[0]).toEqual({ regime: 'dubai', state: 'draft' });
  });

  it('test_UW_101_visit_visa_declines_with_category_only', async () => {
    const { applicationId } = await start();
    const result = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      routeRegime(tx, {
        applicationId,
        tenantId,
        emirateOfVisa: 'sharjah',
        visaStatus: 'visit',
      }),
    );
    expect(result.declined).toBe(true);
    expect(result.customerCategory).toBe('visa_status'); // J-R4: category, never rule detail
    const row = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      tx.query<{ state: string; decline_reason: string }>(
        'SELECT state, decline_reason FROM applications WHERE id = $1',
        [applicationId],
      ),
    );
    expect(row.rows[0]).toEqual({ state: 'declined', decline_reason: 'visa_status' });
  });

  it('in-process visas proceed (UW-101 blocks only visit/tourist)', async () => {
    const { applicationId } = await start();
    const result = await db.as({ tenantId, roleCode: 'broker_agent' }, (tx) =>
      routeRegime(tx, {
        applicationId,
        tenantId,
        emirateOfVisa: 'ajman',
        visaStatus: 'in_process',
      }),
    );
    expect(result).toEqual({ regime: 'federal', declined: false });
  });
});
