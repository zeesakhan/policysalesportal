// M1-T8: payment references (PAY-001: reference only — no card data, no
// funds), 48h window (PAY-003), idempotent webhook handling keyed on the
// unique provider reference.
export const m011Payments = {
  id: '011_payments',
  sql: `
CREATE TABLE payments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id),
  application_id    uuid NOT NULL REFERENCES applications(id),
  provider_ref      text NOT NULL UNIQUE,
  amount_aed        numeric(12,2) NOT NULL,
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','failed','expired')),
  window_expires_at timestamptz NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX payments_application_idx ON payments (application_id, created_at);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments FORCE ROW LEVEL SECURITY;
-- TEN-005: payment status/reference visible to the transacting tenant and platform
CREATE POLICY payments_access ON payments
  USING (current_setting('app.is_platform', true) = 'true'
         OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (current_setting('app.is_platform', true) = 'true'
              OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime;
`,
};
