// M1-T2: identity capture support — ICP validation result on persons
// (KYC-001), decline-cooling referral flag (J-R3), and the ops-ticket table
// (used here for the KYC-002 EID-endorsement task; PAY-023 registration
// failures reuse it in M1-T9).
export const m004Identity = {
  id: '004_identity',
  sql: `
ALTER TABLE persons
  ADD COLUMN icp_status     text CHECK (icp_status IN ('pass','mismatch','expired','not_found','not_checked')) DEFAULT 'not_checked',
  ADD COLUMN icp_checked_at timestamptz,
  ADD COLUMN visa_file_no   text;

-- J-R3: re-application within the 30-day cooling window is forced to manual
-- UW instead of STP; the flag rides on the application
ALTER TABLE applications ADD COLUMN cooling_referral boolean NOT NULL DEFAULT false;

CREATE TABLE ops_tickets (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id),
  application_id uuid REFERENCES applications(id),
  type           text NOT NULL CHECK (type IN ('eid_endorsement_due','registration_failure','reconciliation_break')),
  status         text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  due_at         timestamptz,
  detail         jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ops_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_tickets FORCE ROW LEVEL SECURITY;
-- ops queues are worked platform-side (Journey E); tenants may see their own
CREATE POLICY ops_tickets_access ON ops_tickets
  USING (current_setting('app.is_platform', true) = 'true'
         OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (current_setting('app.is_platform', true) = 'true'
              OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime;
`,
};
