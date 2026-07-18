import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withDbContext, type SqlExec } from './client';
import { runMigrations } from './migrate';

// Embedded real Postgres (pglite) — mock-first, zero infrastructure, but the
// SQL, policies and triggers are exactly what uat/prod run.
let db: PGlite;
let brokerA: string;
let brokerB: string;
let appA: string;
let appB: string;

const exec: SqlExec = {
  query: async (sql, params) => {
    const res = await db.query(sql, params as unknown[]);
    return { rows: res.rows as Record<string, unknown>[] };
  },
  exec: async (sql) => {
    await db.exec(sql);
  },
};

beforeAll(async () => {
  db = new PGlite();
  await runMigrations(exec);

  // Bootstrap two broker tenants and one application each (platform context)
  await withDbContext(exec, { isPlatform: true, roleCode: 'platform_ops' }, async (tx) => {
    const t = await tx.query<{ id: string }>(
      `INSERT INTO tenants (type, name, status) VALUES
        ('broker', 'Broker A', 'active'),
        ('broker', 'Broker B', 'active')
       RETURNING id`,
    );
    brokerA = t.rows[0]!.id;
    brokerB = t.rows[1]!.id;
  });
  await withDbContext(exec, { tenantId: brokerA, roleCode: 'broker_agent' }, async (tx) => {
    const a = await tx.query<{ id: string }>(
      `INSERT INTO applications (tenant_id, regime) VALUES ($1, 'dubai') RETURNING id`,
      [brokerA],
    );
    appA = a.rows[0]!.id;
  });
  await withDbContext(exec, { tenantId: brokerB, roleCode: 'broker_agent' }, async (tx) => {
    const a = await tx.query<{ id: string }>(
      `INSERT INTO applications (tenant_id, regime) VALUES ($1, 'federal') RETURNING id`,
      [brokerB],
    );
    appB = a.rows[0]!.id;
  });
});

afterAll(async () => {
  await db.close();
});

describe('TEN-001 — hard tenant isolation via RLS', () => {
  it('a tenant sees only its own applications', async () => {
    const rows = await withDbContext(
      exec,
      { tenantId: brokerA, roleCode: 'broker_agent' },
      (tx) => tx.query<{ id: string }>('SELECT id FROM applications'),
    );
    expect(rows.rows.map((r) => r.id)).toEqual([appA]);
  });

  it('a tenant cannot read another tenant’s application even by id', async () => {
    const rows = await withDbContext(
      exec,
      { tenantId: brokerA, roleCode: 'broker_agent' },
      (tx) => tx.query('SELECT id FROM applications WHERE id = $1', [appB]),
    );
    expect(rows.rows).toHaveLength(0);
  });

  it('a tenant cannot insert rows under another tenant’s id', async () => {
    await expect(
      withDbContext(exec, { tenantId: brokerA, roleCode: 'broker_agent' }, (tx) =>
        tx.query(`INSERT INTO applications (tenant_id) VALUES ($1)`, [brokerB]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('platform context reads across tenants (WP-09: platform ops R all)', async () => {
    const rows = await withDbContext(
      exec,
      { isPlatform: true, roleCode: 'platform_ops' },
      (tx) => tx.query('SELECT id FROM applications ORDER BY created_at'),
    );
    expect(rows.rows).toHaveLength(2);
  });

  it('no-context access sees nothing (fail closed)', async () => {
    const rows = await withDbContext(exec, {}, (tx) => tx.query('SELECT id FROM applications'));
    expect(rows.rows).toHaveLength(0);
  });
});

describe('TEN-002 — health-declaration lock', () => {
  let declId: string;

  it('channel role can capture a declaration during the journey (write-only: RETURNING is blocked by the read lock)', async () => {
    await withDbContext(exec, { tenantId: brokerA, roleCode: 'broker_agent' }, async (tx) => {
      const p = await tx.query<{ id: string }>(
        `INSERT INTO persons (tenant_id, application_id, kind, full_name)
         VALUES ($1, $2, 'applicant', 'Test Applicant') RETURNING id`,
        [brokerA, appA],
      );
      // No RETURNING: under RLS, INSERT ... RETURNING would require SELECT
      // rights on the row — which the capturing channel must never have.
      await tx.query(
        `INSERT INTO health_declarations (tenant_id, application_id, person_id, answers)
         VALUES ($1, $2, $3, '{"D1": false}')`,
        [brokerA, appA, p.rows[0]!.id],
      );
    });
    const seen = await withDbContext(exec, { roleCode: 'compliance_officer' }, (tx) =>
      tx.query<{ id: string }>('SELECT id FROM health_declarations'),
    );
    expect(seen.rows).toHaveLength(1);
    declId = seen.rows[0]!.id;
  });

  it('the capturing broker can NEVER read the answers back', async () => {
    const rows = await withDbContext(
      exec,
      { tenantId: brokerA, roleCode: 'broker_agent' },
      (tx) => tx.query('SELECT * FROM health_declarations'),
    );
    expect(rows.rows).toHaveLength(0);
  });

  it('platform ops (non-compliance) cannot read answers either', async () => {
    const rows = await withDbContext(
      exec,
      { isPlatform: true, roleCode: 'platform_ops' },
      (tx) => tx.query('SELECT * FROM health_declarations'),
    );
    expect(rows.rows).toHaveLength(0);
  });

  it('insurer underwriter and platform compliance officer can read', async () => {
    for (const roleCode of ['underwriter', 'compliance_officer']) {
      const rows = await withDbContext(exec, { roleCode }, (tx) =>
        tx.query<{ id: string }>('SELECT id FROM health_declarations'),
      );
      expect(rows.rows.map((r) => r.id)).toEqual([declId]);
    }
  });

  it('declarations can never be updated or deleted (no policy exists)', async () => {
    for (const roleCode of ['underwriter', 'compliance_officer', 'broker_agent']) {
      const upd = await withDbContext(exec, { tenantId: brokerA, roleCode }, (tx) =>
        tx.query(`UPDATE health_declarations SET answers = '{}' RETURNING id`),
      );
      expect(upd.rows).toHaveLength(0);
      const del = await withDbContext(exec, { tenantId: brokerA, roleCode }, (tx) =>
        tx.query('DELETE FROM health_declarations RETURNING id'),
      );
      expect(del.rows).toHaveLength(0);
    }
  });
});

describe('QR-030 — quote immutability', () => {
  it('re-rating must create a new quote; mutating one is impossible', async () => {
    await withDbContext(exec, { tenantId: brokerA, roleCode: 'broker_agent' }, (tx) =>
      tx.query(
        `INSERT INTO quotes (tenant_id, application_id, rate_table_version, premium_aed)
         VALUES ($1, $2, 'RT-2026-07-v1', 750.00)`,
        [brokerA, appA],
      ),
    );
    await expect(
      withDbContext(exec, { tenantId: brokerA, roleCode: 'broker_agent' }, (tx) =>
        tx.query('UPDATE quotes SET premium_aed = 1.00'),
      ),
    ).rejects.toThrow(/QR-030/);
    // status transitions (supersede/expire) remain allowed
    const upd = await withDbContext(exec, { tenantId: brokerA, roleCode: 'broker_agent' }, (tx) =>
      tx.query(`UPDATE quotes SET status = 'superseded' RETURNING id`),
    );
    expect(upd.rows).toHaveLength(1);
  });
});

describe('J-R1 — audit spine is append-only; reads are platform-only', () => {
  it('any context can append; update/delete raise; only platform reads', async () => {
    await withDbContext(exec, { tenantId: brokerA, roleCode: 'broker_agent' }, (tx) =>
      tx.query(
        `INSERT INTO audit_events (tenant_id, action, entity_type, entity_id, rule_ids)
         VALUES ($1, 'application.created', 'application', $2, '{}')`,
        [brokerA, appA],
      ),
    );
    // Runtime contexts: no UPDATE/DELETE policy exists → zero rows reachable
    const upd = await withDbContext(exec, { isPlatform: true, roleCode: 'platform_ops' }, (tx) =>
      tx.query(`UPDATE audit_events SET action = 'tampered' RETURNING id`),
    );
    expect(upd.rows).toHaveLength(0);
    // Even an elevated superuser connection (which bypasses RLS) hits the
    // append-only trigger — defence in depth for J-R1
    await expect(exec.query(`UPDATE audit_events SET action = 'tampered'`)).rejects.toThrow(
      /append-only/,
    );
    await expect(exec.query('DELETE FROM audit_events')).rejects.toThrow(/append-only/);

    const asBroker = await withDbContext(
      exec,
      { tenantId: brokerA, roleCode: 'broker_agent' },
      (tx) => tx.query('SELECT id FROM audit_events'),
    );
    expect(asBroker.rows).toHaveLength(0);
    const asPlatform = await withDbContext(
      exec,
      { isPlatform: true, roleCode: 'platform_ops' },
      (tx) => tx.query('SELECT id FROM audit_events'),
    );
    expect(asPlatform.rows.length).toBeGreaterThan(0);
  });
});

describe('WP-09 §1 — role matrix seeded', () => {
  it('exactly the fixed v1 role set exists', async () => {
    const { rows } = await withDbContext(exec, { isPlatform: true, roleCode: 'platform_ops' }, (tx) =>
      tx.query<{ code: string }>('SELECT code FROM roles ORDER BY code'),
    );
    expect(rows.map((r) => r.code)).toEqual([
      'affiliate',
      'broker_admin',
      'broker_agent',
      'centre_admin',
      'compliance_officer',
      'insurer_auditor',
      'insurer_finance',
      'operator',
      'platform_finance',
      'platform_ops',
      'rates_manager',
      'super_admin',
      'support',
      'underwriter',
    ]);
  });
});
