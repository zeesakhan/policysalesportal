// M0-T3: OTP attestation artifacts (ARCHITECTURE §2). One shared service is
// used by consent (JB-02), declaration (SC-07), review (SC-08) and
// counter-offer (REF-021); each successful verification stores an artifact
// linked to the application as contract evidence.
export const m002Attestations = {
  id: '002_attestations',
  sql: `
CREATE TABLE attestations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id),
  application_id uuid NOT NULL REFERENCES applications(id),
  purpose        text NOT NULL CHECK (purpose IN ('consent','declaration','review','counter_offer')),
  phone          text NOT NULL,
  method         text NOT NULL DEFAULT 'sms_otp',
  verified_at    timestamptz NOT NULL,
  artifact       jsonb NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE attestations ENABLE ROW LEVEL SECURITY;
ALTER TABLE attestations FORCE ROW LEVEL SECURITY;
CREATE POLICY attestations_tenant_isolation ON attestations
  USING (current_setting('app.is_platform', true) = 'true'
         OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (current_setting('app.is_platform', true) = 'true'
              OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- Attestations are evidence: append-only like the audit spine
CREATE TRIGGER attestations_no_update BEFORE UPDATE OR DELETE ON attestations
  FOR EACH ROW EXECUTE FUNCTION audit_events_append_only();

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime;
`,
};
