import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashSnapshot } from '../audit/audit.service';
import { withDbContext, type SqlExec } from '../db/client';
import { runMigrations } from '../db/migrate';
import { transitionApplication } from './application-machine';

let db: PGlite;
let tenantId: string;
let applicationId: string;

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
  await withDbContext(exec, { isPlatform: true, roleCode: 'platform_ops' }, async (tx) => {
    const t = await tx.query<{ id: string }>(
      `INSERT INTO tenants (type, name, status) VALUES ('broker', 'Broker', 'active') RETURNING id`,
    );
    tenantId = t.rows[0]!.id;
  });
  await withDbContext(exec, { tenantId, roleCode: 'broker_agent' }, async (tx) => {
    const a = await tx.query<{ id: string }>(
      `INSERT INTO applications (tenant_id, regime) VALUES ($1, 'federal') RETURNING id`,
      [tenantId],
    );
    applicationId = a.rows[0]!.id;
  });
});

afterAll(async () => {
  await db.close();
});

describe('persisted transitions write the audit spine (J-R1)', () => {
  it('updates state and appends an audit event with rule IDs and hashes', async () => {
    await withDbContext(exec, { tenantId, roleCode: 'broker_agent' }, (tx) =>
      transitionApplication(tx, {
        applicationId,
        tenantId,
        from: 'draft',
        to: 'screened',
      }),
    );

    const app = await withDbContext(exec, { tenantId, roleCode: 'broker_agent' }, (tx) =>
      tx.query<{ state: string }>('SELECT state FROM applications WHERE id = $1', [applicationId]),
    );
    expect(app.rows[0]!.state).toBe('screened');

    const events = await withDbContext(exec, { isPlatform: true, roleCode: 'platform_ops' }, (tx) =>
      tx.query<{ action: string; rule_ids: string[]; before_hash: string; after_hash: string }>(
        `SELECT action, rule_ids, before_hash, after_hash FROM audit_events WHERE entity_id = $1`,
        [applicationId],
      ),
    );
    expect(events.rows).toHaveLength(1);
    expect(events.rows[0]!.action).toBe('application.transition.draft->screened');
    expect(events.rows[0]!.rule_ids).toEqual(['KYC-001', 'KYC-011']);
    expect(events.rows[0]!.before_hash).toBe(hashSnapshot({ state: 'draft' }));
    expect(events.rows[0]!.after_hash).toBe(hashSnapshot({ state: 'screened' }));
  });

  it('rejects an illegal persisted transition without touching the row', async () => {
    await expect(
      withDbContext(exec, { tenantId, roleCode: 'broker_agent' }, (tx) =>
        transitionApplication(tx, { applicationId, tenantId, from: 'screened', to: 'issued' }),
      ),
    ).rejects.toThrow(/Illegal transition/);
    const app = await withDbContext(exec, { tenantId, roleCode: 'broker_agent' }, (tx) =>
      tx.query<{ state: string }>('SELECT state FROM applications WHERE id = $1', [applicationId]),
    );
    expect(app.rows[0]!.state).toBe('screened');
  });

  it('detects concurrent state drift via the guarded UPDATE', async () => {
    await expect(
      withDbContext(exec, { tenantId, roleCode: 'broker_agent' }, (tx) =>
        transitionApplication(tx, { applicationId, tenantId, from: 'draft', to: 'screened' }),
      ),
    ).rejects.toThrow(/not in state 'draft'/);
  });
});
