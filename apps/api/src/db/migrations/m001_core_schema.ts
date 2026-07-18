// M0-T2 data model core (BUILD-PLAN). Tenant isolation is enforced at the data
// layer with row-level security (TEN-001), not in queries/UI. FORCE ROW LEVEL
// SECURITY keeps policies active even for the table owner, so isolation is
// testable and real in every environment.
export const m001CoreSchema = {
  id: '001_core_schema',
  sql: `
-- ---------------------------------------------------------------- tenants
CREATE TABLE tenants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type        text NOT NULL CHECK (type IN ('platform','insurer','broker','typing_centre','affiliate')),
  name        text NOT NULL,
  -- TEN-010..TEN-012 lifecycle
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','suspended','offboarded')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- roles (WP-09 §1 — fixed set, no custom roles in v1)
CREATE TABLE roles (
  code        text PRIMARY KEY,
  tenant_type text NOT NULL CHECK (tenant_type IN ('platform','insurer','broker','typing_centre','affiliate')),
  name        text NOT NULL
);

INSERT INTO roles (code, tenant_type, name) VALUES
  ('super_admin',        'platform',      'Super-admin'),
  ('platform_ops',       'platform',      'Ops'),
  ('compliance_officer', 'platform',      'Compliance officer'),
  ('platform_finance',   'platform',      'Finance'),
  ('support',            'platform',      'Support'),
  ('underwriter',        'insurer',       'Underwriter'),
  ('rates_manager',      'insurer',       'Product/rates manager'),
  ('insurer_finance',    'insurer',       'Finance'),
  ('insurer_auditor',    'insurer',       'Read-only auditor'),
  ('broker_admin',       'broker',        'Broker admin'),
  ('broker_agent',       'broker',        'Broker agent'),
  ('centre_admin',       'typing_centre', 'Centre admin'),
  ('operator',           'typing_centre', 'Operator'),
  ('affiliate',          'affiliate',     'Affiliate');

-- ---------------------------------------------------------------- users
CREATE TABLE users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  email       text NOT NULL UNIQUE,
  full_name   text NOT NULL,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_roles (
  user_id   uuid NOT NULL REFERENCES users(id),
  role_code text NOT NULL REFERENCES roles(code),
  PRIMARY KEY (user_id, role_code)
);

-- ---------------------------------------------------------------- applications
-- State list per ARCHITECTURE §2 (J-R1); transitions are guarded by the state
-- machine service (M0-T3) — the CHECK constraint is the last line of defence.
CREATE TABLE applications (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id),
  acting_user_id uuid REFERENCES users(id),          -- KYC-003 / TEN-013
  regime         text CHECK (regime IN ('federal','dubai','abu_dhabi')),
  state          text NOT NULL DEFAULT 'draft' CHECK (state IN
    ('draft','screened','quoted','declared','uw_decided','payment_pending',
     'paid','issued','registered','delivered','declined')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- persons (each insured is a separate life — UW-307/UW-404)
CREATE TABLE persons (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id),
  application_id uuid NOT NULL REFERENCES applications(id),
  kind           text NOT NULL CHECK (kind IN ('applicant','dependent')),
  full_name      text NOT NULL,
  eid            text,                               -- UW-102/UW-105 dedupe key
  passport_no    text,                               -- KYC-002 no-EID path
  dob            date,
  gender         text,
  nationality    text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- health declarations (TEN-002 sensitive store)
-- Separately-permissioned table: content visible ONLY to insurer underwriter
-- and platform compliance officer (REG-052). Everyone else sees status via
-- the application, never this table.
CREATE TABLE health_declarations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id),
  application_id uuid NOT NULL REFERENCES applications(id),
  person_id      uuid NOT NULL REFERENCES persons(id),
  answers        jsonb NOT NULL,                     -- D1–D8 / MAF answers
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- quotes (immutable — QR-001/QR-030)
CREATE TABLE quotes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id),
  application_id     uuid NOT NULL REFERENCES applications(id),
  rate_table_version text NOT NULL,                  -- snapshot, never re-pointed
  premium_aed        numeric(12,2) NOT NULL,
  status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active','superseded','expired')),
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- Re-rating creates a new quote, never mutates one (QR-030): only the status
-- column may change after insert.
CREATE FUNCTION quotes_immutable_guard() RETURNS trigger AS $fn$
BEGIN
  IF NEW.rate_table_version IS DISTINCT FROM OLD.rate_table_version
     OR NEW.premium_aed IS DISTINCT FROM OLD.premium_aed
     OR NEW.application_id IS DISTINCT FROM OLD.application_id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'QR-030: quotes are immutable — re-rating must create a new quote';
  END IF;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

CREATE TRIGGER quotes_immutable BEFORE UPDATE ON quotes
  FOR EACH ROW EXECUTE FUNCTION quotes_immutable_guard();

-- ---------------------------------------------------------------- policies
CREATE TABLE policies (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id),
  application_id uuid NOT NULL REFERENCES applications(id),
  policy_number  text UNIQUE,
  status         text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','registered','delivered','cancelled')),
  issued_at      timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- cases (REF-001..003)
CREATE TABLE cases (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id),
  application_id   uuid NOT NULL REFERENCES applications(id),
  queue            text NOT NULL CHECK (queue IN ('underwriting','compliance')),   -- REF-001
  state            text NOT NULL DEFAULT 'created' CHECK (state IN
    ('created','in_review','info_requested','decided','closed')),                  -- REF-003
  decision         text CHECK (decision IN ('accept','accept_with_terms','decline')),
  trigger_rule_ids text[] NOT NULL,                                                -- REF-002
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- audit spine (J-R1, MIS-010; append-only, 10y retention)
CREATE TABLE audit_events (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  tenant_id     uuid,
  actor_user_id uuid,
  action        text NOT NULL,
  entity_type   text NOT NULL,
  entity_id     text,
  before_hash   text,
  after_hash    text,
  rule_ids      text[] NOT NULL DEFAULT '{}',
  details       jsonb
);

CREATE FUNCTION audit_events_append_only() RETURNS trigger AS $fn$
BEGIN
  RAISE EXCEPTION 'J-R1: audit_events is append-only';
END;
$fn$ LANGUAGE plpgsql;

CREATE TRIGGER audit_events_no_update BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_append_only();

CREATE INDEX audit_events_entity_idx ON audit_events (entity_type, entity_id);
CREATE INDEX audit_events_tenant_time_idx ON audit_events (tenant_id, occurred_at);

-- ---------------------------------------------------------------- row-level security (TEN-001)
-- Context is set per transaction by the data-access layer:
--   app.tenant_id    — acting tenant
--   app.role_code    — acting role (WP-09 §1 codes)
--   app.is_platform  — 'true' for platform-tenant roles (see WP-09 §3 for
--                      per-capability limits enforced app-side)

-- tenants: platform manages all; a tenant may read itself
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenants_access ON tenants
  USING (current_setting('app.is_platform', true) = 'true'
         OR id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (current_setting('app.is_platform', true) = 'true');

-- users: own tenant only; platform sees all (WP-09 "own users")
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
CREATE POLICY users_tenant_isolation ON users
  USING (current_setting('app.is_platform', true) = 'true'
         OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (current_setting('app.is_platform', true) = 'true'
              OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- generic tenant isolation for journey data (TEN-001)
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications FORCE ROW LEVEL SECURITY;
CREATE POLICY applications_tenant_isolation ON applications
  USING (current_setting('app.is_platform', true) = 'true'
         OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (current_setting('app.is_platform', true) = 'true'
              OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE persons ENABLE ROW LEVEL SECURITY;
ALTER TABLE persons FORCE ROW LEVEL SECURITY;
CREATE POLICY persons_tenant_isolation ON persons
  USING (current_setting('app.is_platform', true) = 'true'
         OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (current_setting('app.is_platform', true) = 'true'
              OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes FORCE ROW LEVEL SECURITY;
CREATE POLICY quotes_tenant_isolation ON quotes
  USING (current_setting('app.is_platform', true) = 'true'
         OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (current_setting('app.is_platform', true) = 'true'
              OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE policies FORCE ROW LEVEL SECURITY;
CREATE POLICY policies_tenant_isolation ON policies
  USING (current_setting('app.is_platform', true) = 'true'
         OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (current_setting('app.is_platform', true) = 'true'
              OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE cases FORCE ROW LEVEL SECURITY;
CREATE POLICY cases_tenant_isolation ON cases
  USING (current_setting('app.is_platform', true) = 'true'
         OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (current_setting('app.is_platform', true) = 'true'
              OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- health declarations (TEN-002): content readable ONLY by insurer underwriter
-- and platform compliance officer. Channel roles may write during capture but
-- can never read back. No UPDATE/DELETE policy exists → both are impossible.
-- (Underwriter scoping to referred applications is enforced app-side in M1.)
ALTER TABLE health_declarations ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_declarations FORCE ROW LEVEL SECURITY;
CREATE POLICY health_declarations_read_lock ON health_declarations FOR SELECT
  USING (current_setting('app.role_code', true) IN ('underwriter', 'compliance_officer'));
CREATE POLICY health_declarations_capture ON health_declarations FOR INSERT
  WITH CHECK (current_setting('app.is_platform', true) = 'true'
              OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- audit_events: anyone writes (every engine step, J-R1); only platform reads
-- (WP-09 matrix: audit logs R for platform ops + compliance, X for all others).
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_events_write ON audit_events FOR INSERT WITH CHECK (true);
CREATE POLICY audit_events_read ON audit_events FOR SELECT
  USING (current_setting('app.is_platform', true) = 'true');

-- ---------------------------------------------------------------- runtime role
-- All application access runs as this non-superuser role (withDbContext does
-- SET LOCAL ROLE) so RLS genuinely applies — superusers bypass RLS entirely.
DO $do$ BEGIN
  CREATE ROLE app_runtime NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime;
`,
};
