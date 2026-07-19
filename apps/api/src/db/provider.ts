import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import { PLACEHOLDER_PREFIX } from '@psp/shared';
import { withDbContext, type DbContext, type SqlExec } from './client';
import { runMigrations } from './migrate';
import { seedDemoCatalogue } from './seed-demo';

/**
 * Runtime database provider. uat/prod: PostgreSQL via DATABASE_URL. dev (or
 * placeholder DATABASE_URL): embedded Postgres (pglite) with migrations + the
 * demo catalogue — the whole engine runs with zero infrastructure
 * (CLAUDE.md §3.5 mock-first).
 */
export interface Db {
  /** Single-connection exec for context-wrapped work. */
  run<T>(ctx: DbContext, fn: (tx: SqlExec) => Promise<T>): Promise<T>;
  runSystem<T>(fn: (tx: SqlExec) => Promise<T>): Promise<T>;
}

let devDb: PGlite | undefined;

export async function createDb(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (!url || url.startsWith(PLACEHOLDER_PREFIX)) {
    devDb ??= new PGlite();
    const db = devDb;
    const exec: SqlExec = {
      query: async <R = Record<string, unknown>>(sql: string, params?: unknown[]) => {
        const res = await db.query(sql, params);
        return { rows: res.rows as R[] };
      },
      exec: async (sql) => {
        await db.exec(sql);
      },
    };
    await runMigrations(exec);
    await withDbContext(exec, { isPlatform: true, roleCode: 'platform_ops' }, (tx) =>
      seedDemoCatalogue(tx),
    );
    return {
      run: (ctx, fn) => withDbContext(exec, ctx, fn),
      runSystem: (fn) => withDbContext(exec, { isPlatform: true, roleCode: 'platform_ops' }, fn),
    };
  }

  const pool = new Pool({ connectionString: url });
  const withClient = async <T>(ctx: DbContext, fn: (tx: SqlExec) => Promise<T>): Promise<T> => {
    const client = await pool.connect();
    try {
      const exec: SqlExec = {
        query: async <R = Record<string, unknown>>(sql: string, params?: unknown[]) => {
          const res = await client.query(sql, params);
          return { rows: res.rows as R[] };
        },
        exec: async (sql) => {
          await client.query(sql);
        },
      };
      return await withDbContext(exec, ctx, fn);
    } finally {
      client.release();
    }
  };
  return {
    run: withClient,
    runSystem: (fn) => withClient({ isPlatform: true, roleCode: 'platform_ops' }, fn),
  };
}
