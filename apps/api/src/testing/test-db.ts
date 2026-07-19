import { PGlite } from '@electric-sql/pglite';
import { withDbContext, type DbContext, type SqlExec } from '../db/client';
import { runMigrations } from '../db/migrate';

/** Embedded real Postgres for tests — same SQL/policies/triggers as uat/prod. */
export interface TestDb {
  exec: SqlExec;
  close(): Promise<void>;
  /** Run fn in a platform (system) context. */
  asPlatform<T>(fn: (tx: SqlExec) => Promise<T>): Promise<T>;
  /** Run fn in an arbitrary RLS context. */
  as<T>(ctx: DbContext, fn: (tx: SqlExec) => Promise<T>): Promise<T>;
  createTenant(type: string, name: string): Promise<string>;
}

export async function makeTestDb(): Promise<TestDb> {
  const db = new PGlite();
  const exec: SqlExec = {
    query: async (sql, params) => {
      const res = await db.query(sql, params as unknown[]);
      return { rows: res.rows as Record<string, unknown>[] };
    },
    exec: async (sql) => {
      await db.exec(sql);
    },
  };
  await runMigrations(exec);
  const asPlatform = <T>(fn: (tx: SqlExec) => Promise<T>) =>
    withDbContext(exec, { isPlatform: true, roleCode: 'platform_ops' }, fn);
  return {
    exec,
    close: () => db.close(),
    asPlatform,
    as: (ctx, fn) => withDbContext(exec, ctx, fn),
    createTenant: async (type, name) => {
      const r = await asPlatform((tx) =>
        tx.query<{ id: string }>(
          `INSERT INTO tenants (type, name, status) VALUES ($1, $2, 'active') RETURNING id`,
          [type, name],
        ),
      );
      return r.rows[0]!.id;
    },
  };
}
