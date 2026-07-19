// M1-T7: referral case detail (REF-002: snapshot + SLA + decision record) and
// counter-offers (REF-021/022). Also opens the case tables to the insurer
// underwriter role: referral cases are worked cross-tenant by the insurer
// (WP-09: Insurer UW — referral queue CRU, applications R referred), while
// compliance cases stay platform-side (REF-001).
export const m009CasesCounterOffers = {
  id: '009_cases_counteroffers',
  sql: `
ALTER TABLE cases
  ADD COLUMN sla_due_at        timestamptz,   -- REF-010
  ADD COLUMN snapshot          jsonb,         -- REF-002 (statuses only — never declaration answers)
  ADD COLUMN decided_by        uuid,          -- REF-024
  ADD COLUMN rationale         text,          -- REF-024 (internal)
  ADD COLUMN info_requested_at timestamptz;   -- REF-003: pauses the SLA clock

CREATE POLICY cases_underwriting_queue ON cases
  USING (current_setting('app.role_code', true) = 'underwriter' AND queue = 'underwriting')
  WITH CHECK (current_setting('app.role_code', true) = 'underwriter' AND queue = 'underwriting');
CREATE POLICY cases_compliance_queue ON cases
  USING (current_setting('app.role_code', true) = 'compliance_officer' AND queue = 'compliance')
  WITH CHECK (current_setting('app.role_code', true) = 'compliance_officer' AND queue = 'compliance');

CREATE TABLE counter_offers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id),
  application_id uuid NOT NULL REFERENCES applications(id),
  case_id        uuid NOT NULL REFERENCES cases(id),
  loading_pct    numeric(6,2) NOT NULL DEFAULT 0,
  exclusion_text text,
  quote_id       uuid REFERENCES quotes(id),  -- revised final quote (UW-506/507)
  status         text NOT NULL DEFAULT 'offered' CHECK (status IN ('offered','accepted','lapsed','declined')),
  valid_until    timestamptz NOT NULL,        -- REF-022: 7 days
  attestation_id uuid REFERENCES attestations(id),  -- REF-021: positive OTP acceptance
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE counter_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE counter_offers FORCE ROW LEVEL SECURITY;
CREATE POLICY counter_offers_tenant ON counter_offers
  USING (current_setting('app.is_platform', true) = 'true'
         OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
         OR current_setting('app.role_code', true) = 'underwriter')
  WITH CHECK (current_setting('app.is_platform', true) = 'true'
              OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
              OR current_setting('app.role_code', true) = 'underwriter');

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime;
`,
};
