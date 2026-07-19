// M5-T2 authz sweep finding: WP-09 §3 grants "Insurer rates: R" on Quotes —
// the rates manager needs read visibility into what sold against their rate
// tables (bordereau/recon input). The original quotes RLS policy only
// covered tenant-isolation + platform; add the insurer-rates read grant.
export const m014InsurerRatesRead = {
  id: '014_insurer_rates_read',
  sql: `
CREATE POLICY quotes_insurer_rates_read ON quotes FOR SELECT
  USING (current_setting('app.role_code', true) = 'rates_manager');
`,
};
