// M3: lifecycle & money — endorsements (END-002), cancellations/refunds
// (END-010..015), policy term dates for renewals (END-020/021), commission
// and payout ledgers (QR-020..022), purchase blocks (END-015).
export const m013Lifecycle = {
  id: '013_lifecycle',
  sql: `
ALTER TABLE policies
  ADD COLUMN start_date date,
  ADD COLUMN end_date   date;

CREATE TABLE endorsements (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id),
  policy_id          uuid NOT NULL REFERENCES policies(id),
  type               text NOT NULL CHECK (type IN
    ('eid_addition','name_correction','newborn_addition','dependent_addition',
     'dependent_removal','contact_change','plan_upgrade','regime_change')),
  status             text NOT NULL DEFAULT 'requested' CHECK (status IN
    ('requested','priced','paid','applied','referred','rejected')),
  detail             jsonb,
  additional_premium numeric(12,2),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cancellations (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid NOT NULL REFERENCES tenants(id),
  policy_id                 uuid NOT NULL REFERENCES policies(id),
  reason                    text NOT NULL CHECK (reason IN
    ('leaving_uae','employer_cover','switched_insurer','visa_cancelled','dissatisfaction','other')),
  refund_computed           numeric(12,2) NOT NULL,
  refund_basis              text NOT NULL,
  visa_warning_acknowledged boolean NOT NULL,
  replacement_policy_number text,
  status                    text NOT NULL DEFAULT 'requested' CHECK (status IN
    ('requested','approved','refund_paid')),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

-- QR-020/REG-004: commission due from insurer per policy, 10-business-day aging
CREATE TABLE commission_receivable (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id  uuid NOT NULL UNIQUE REFERENCES policies(id),
  amount_aed numeric(12,2) NOT NULL,
  due_at     timestamptz NOT NULL,
  status     text NOT NULL DEFAULT 'due' CHECK (status IN ('due','received','clawed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- QR-021/022: downstream payouts accrue only on issued+registered; clawback cascades
CREATE TABLE payout_payable (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id),
  policy_id  uuid NOT NULL REFERENCES policies(id),
  amount_aed numeric(12,2) NOT NULL,
  status     text NOT NULL DEFAULT 'accrued' CHECK (status IN ('accrued','paid','clawed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, policy_id)
);

-- END-015: purchase-cancel-refund abuse → block pending compliance review
CREATE TABLE purchase_blocks (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  eid        text NOT NULL UNIQUE,
  reason     text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: tenant isolation for lifecycle tables; ledgers visible to owner tenant
-- + platform (WP-09: commission own only)
DO $do$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['endorsements','cancellations','payout_payable'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format($p$CREATE POLICY %I_tenant ON %I
      USING (current_setting('app.is_platform', true) = 'true'
             OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
      WITH CHECK (current_setting('app.is_platform', true) = 'true'
                  OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)$p$, tbl, tbl);
  END LOOP;
END $do$;

ALTER TABLE commission_receivable ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_receivable FORCE ROW LEVEL SECURITY;
CREATE POLICY commission_receivable_platform ON commission_receivable
  USING (current_setting('app.is_platform', true) = 'true'
         OR current_setting('app.role_code', true) IN ('insurer_finance','insurer_auditor'))
  WITH CHECK (current_setting('app.is_platform', true) = 'true');

ALTER TABLE purchase_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_blocks FORCE ROW LEVEL SECURITY;
CREATE POLICY purchase_blocks_write ON purchase_blocks FOR INSERT WITH CHECK (true);
CREATE POLICY purchase_blocks_read ON purchase_blocks FOR SELECT
  USING (current_setting('app.is_platform', true) = 'true');

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime;
`,
};
