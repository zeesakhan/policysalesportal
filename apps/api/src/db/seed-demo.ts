import type { SqlExec } from './client';

/**
 * DEMO catalogue + rates for dev/uat mocks (ARCHITECTURE §4: seed scripts are
 * code, versioned, re-runnable). Every value here is demonstration data — the
 * real rate tables are insurer-owned [INSURER] annex configuration loaded via
 * IN-03; production boot stays blocked by the QR_001 placeholder until then.
 */
export const DEMO_RATE_VERSION = 'RT-DEMO-2026-07';

export async function seedDemoCatalogue(exec: SqlExec): Promise<void> {
  const existing = await exec.query<{ code: string }>(`SELECT code FROM products LIMIT 1`);
  if (existing.rows.length > 0) return; // re-runnable

  const benefits = (limit: string) =>
    JSON.stringify({
      annualLimit: limit,
      network: 'demo network',
      rows: ['inpatient', 'outpatient', 'medicines', 'maternity per schedule'],
      exclusions: ['cosmetic treatment', 'experimental treatment'],
    });

  await exec.query(
    `INSERT INTO products (code, insurer_name, name, track, regime, declaration_required, benefits, status) VALUES
     ('FED-BASIC', 'Demo Insurance Co', 'Federal Basic Health Scheme (DEMO)', 'federal_basic', 'federal', false, $1, 'live'),
     ('DXB-EBP',   'Demo Insurance Co', 'Dubai Essential Benefits Plan (DEMO)', 'dubai_ebp', 'dubai', false, $2, 'live'),
     ('AD-BASIC',  'Demo Insurance Co', 'Abu Dhabi Basic Plan (DEMO)', 'ad_basic', 'abu_dhabi', false, $3, 'live'),
     ('ENH-SILVER','Demo Insurance Co', 'Enhanced Silver (DEMO)', 'enhanced', 'all', true, $4, 'live'),
     ('ENH-GOLD',  'Demo Insurance Co', 'Enhanced Gold (DEMO)', 'enhanced', 'all', true, $5, 'live')`,
    [
      benefits('AED 150,000'),
      benefits('AED 150,000'),
      benefits('AED 250,000'),
      benefits('AED 500,000'),
      benefits('AED 1,000,000'),
    ],
  );

  // Community-rated: flat per-life rate (QR-002). Enhanced: age-band matrix
  // with option multipliers (network/co-pay/maternity).
  const flat = (rate: number) => JSON.stringify({ type: 'flat', ratePerLife: rate, fees: 25 });
  const enhanced = (base: Record<string, number>) =>
    JSON.stringify({
      type: 'age_banded',
      fees: 50,
      bands: base,
      options: {
        network: { GN: 1, RN: 1.15 },
        copay: { '20': 1, '10': 1.1, '0': 1.25 },
        maternityAddon: 400,
      },
    });

  await exec.query(
    `INSERT INTO rate_tables (version, product_code, effective_from, matrix) VALUES
     ($1, 'FED-BASIC',  '2026-07-01', $2),
     ($1, 'DXB-EBP',    '2026-07-01', $3),
     ($1, 'AD-BASIC',   '2026-07-01', $4),
     ($1, 'ENH-SILVER', '2026-07-01', $5),
     ($1, 'ENH-GOLD',   '2026-07-01', $6)`,
    [
      DEMO_RATE_VERSION,
      flat(320),
      flat(700),
      flat(800),
      enhanced({ '0-17': 900, '18-30': 1200, '31-45': 1500, '46-60': 2200, '61-65': 3500, '66+': 5200 }),
      enhanced({ '0-17': 1400, '18-30': 1900, '31-45': 2400, '46-60': 3400, '61-65': 5200, '66+': 7800 }),
    ],
  );

  await exec.query(
    `INSERT INTO campaigns (code, product_code, percent_off, valid_from, valid_to) VALUES
     ('DEMO10', 'ENH-SILVER', 10, '2026-01-01', '2026-12-31')`,
  );
}
