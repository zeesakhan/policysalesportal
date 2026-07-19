// M1-T3: screening results (KYC-010..013), whitelist notes (KYC-012 false
// positives), payer capture (KYC-004) for the EDD trigger (KYC-020).
export const m005Screening = {
  id: '005_screening',
  sql: `
ALTER TABLE applications
  ADD COLUMN payer_name         text,     -- KYC-004: payer ≠ insured
  ADD COLUMN payer_relationship text,
  ADD COLUMN screened_at        timestamptz;  -- KYC-011: pre-issuance re-check if > 7 days

CREATE TABLE screening_results (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id),
  application_id uuid NOT NULL REFERENCES applications(id),
  person_id      uuid REFERENCES persons(id),          -- null = payer screening
  subject_name   text NOT NULL,
  status         text NOT NULL CHECK (status IN ('clear','potential_match','confirmed_match','whitelisted')),
  hits           jsonb,
  disposition_note text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- KYC-012: false-positive whitelist suppresses repeat friction
CREATE TABLE screening_whitelist (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name  text NOT NULL,
  note       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Raw screening detail is compliance-only (J-R4/KYC-013: customers and
-- channels see only the neutral category)
ALTER TABLE screening_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE screening_results FORCE ROW LEVEL SECURITY;
CREATE POLICY screening_results_write ON screening_results FOR INSERT WITH CHECK (true);
CREATE POLICY screening_results_read ON screening_results FOR SELECT
  USING (current_setting('app.is_platform', true) = 'true');
CREATE POLICY screening_results_update ON screening_results FOR UPDATE
  USING (current_setting('app.role_code', true) = 'compliance_officer');

ALTER TABLE screening_whitelist ENABLE ROW LEVEL SECURITY;
ALTER TABLE screening_whitelist FORCE ROW LEVEL SECURITY;
CREATE POLICY screening_whitelist_platform ON screening_whitelist
  USING (current_setting('app.is_platform', true) = 'true')
  WITH CHECK (current_setting('app.role_code', true) = 'compliance_officer');

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime;
`,
};
