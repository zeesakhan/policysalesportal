import type { SqlExec } from './client';
import { m001CoreSchema } from './migrations/m001_core_schema';
import { m002Attestations } from './migrations/m002_attestations';
import { m003JourneyFields } from './migrations/m003_journey_fields';
import { m004Identity } from './migrations/m004_identity';
import { m005Screening } from './migrations/m005_screening';
import { m006Details } from './migrations/m006_details';
import { m007ProductsQuotes } from './migrations/m007_products_quotes';
import { m008Declarations } from './migrations/m008_declarations';
import { m009CasesCounterOffers } from './migrations/m009_cases_counteroffers';
import { m010UwReadReferred } from './migrations/m010_uw_read_referred';
import { m011Payments } from './migrations/m011_payments';

export interface Migration {
  id: string;
  sql: string;
}

export const migrations: Migration[] = [
  m001CoreSchema,
  m002Attestations,
  m003JourneyFields,
  m004Identity,
  m005Screening,
  m006Details,
  m007ProductsQuotes,
  m008Declarations,
  m009CasesCounterOffers,
  m010UwReadReferred,
  m011Payments,
];

export async function runMigrations(exec: SqlExec): Promise<string[]> {
  await exec.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);

  const applied: string[] = [];
  for (const migration of migrations) {
    const { rows } = await exec.query<{ id: string }>(
      'SELECT id FROM schema_migrations WHERE id = $1',
      [migration.id],
    );
    if (rows.length > 0) continue;
    await exec.exec(migration.sql);
    await exec.query('INSERT INTO schema_migrations (id) VALUES ($1)', [migration.id]);
    applied.push(migration.id);
  }
  return applied;
}
