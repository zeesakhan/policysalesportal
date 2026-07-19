/**
 * Minimal SQL access contract satisfied by both `pg` (real PostgreSQL in
 * uat/prod) and `@electric-sql/pglite` (embedded Postgres for dev and tests —
 * mock-first, CLAUDE.md §3.5). Everything in the data layer codes against
 * this interface so the engine runs end-to-end with zero infrastructure.
 */
export interface SqlExec {
  query<R = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: R[] }>;
  /** Multi-statement script execution (migrations). pglite: `.exec`; pg: plain `query`. */
  exec(sql: string): Promise<void>;
}

export interface DbContext {
  tenantId?: string;
  roleCode?: string;
  isPlatform?: boolean;
}

/**
 * Runs `fn` inside a transaction with the RLS context applied via
 * `set_config(..., true)` (transaction-local). All tenant-scoped access MUST
 * go through this wrapper — RLS policies read these settings (TEN-001).
 * `exec` must be a single logical connection (pglite instance or a checked-out
 * pg client), never a pool.
 */
export async function withDbContext<T>(
  exec: SqlExec,
  ctx: DbContext,
  fn: (exec: SqlExec) => Promise<T>,
): Promise<T> {
  await exec.query('BEGIN');
  try {
    // Drop to the non-superuser runtime role for the duration of the
    // transaction — superusers bypass RLS, so staying elevated would silently
    // disable tenant isolation (TEN-001). SET LOCAL reverts on COMMIT/ROLLBACK.
    await exec.query('SET LOCAL ROLE app_runtime');
    await exec.query(`SELECT set_config('app.tenant_id', $1, true)`, [ctx.tenantId ?? '']);
    await exec.query(`SELECT set_config('app.role_code', $1, true)`, [ctx.roleCode ?? '']);
    await exec.query(`SELECT set_config('app.is_platform', $1, true)`, [
      ctx.isPlatform ? 'true' : 'false',
    ]);
    const result = await fn(exec);
    await exec.query('COMMIT');
    return result;
  } catch (err) {
    await exec.query('ROLLBACK');
    throw err;
  }
}
