// M1-T5: product catalogue + versioned rate tables (QR-001) + quote fields
// (QR-003/005) + insurer campaigns (QR-004). Products and rates are
// insurer-owned configuration; the portal never invents a price.
export const m007ProductsQuotes = {
  id: '007_products_quotes',
  sql: `
CREATE TABLE products (
  code                 text PRIMARY KEY,
  insurer_name         text NOT NULL,
  name                 text NOT NULL,
  track                text NOT NULL CHECK (track IN ('federal_basic','dubai_ebp','ad_basic','enhanced')),
  regime               text NOT NULL CHECK (regime IN ('federal','dubai','abu_dhabi','all')),
  declaration_required boolean NOT NULL,      -- UW-206/304/403 vs UW-5xx
  benefits             jsonb NOT NULL,        -- QR-010/QR-011 identical benefit rows
  status               text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','live')),
  version              int  NOT NULL DEFAULT 1
);

CREATE TABLE rate_tables (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version        text NOT NULL,
  product_code   text NOT NULL REFERENCES products(code),
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active','superseded')),
  effective_from date NOT NULL,
  matrix         jsonb NOT NULL,              -- rates + fees; enhanced: age-band × options
  UNIQUE (product_code, version)
);

-- QR-004/REG-005: campaigns are the ONLY source of discounts, insurer-owned
CREATE TABLE campaigns (
  code         text PRIMARY KEY,
  product_code text REFERENCES products(code), -- null = all products of the insurer
  percent_off  numeric(5,2) NOT NULL CHECK (percent_off > 0 AND percent_off <= 100),
  valid_from   date NOT NULL,
  valid_to     date NOT NULL
);

ALTER TABLE quotes
  ADD COLUMN product_code text REFERENCES products(code),
  ADD COLUMN kind         text NOT NULL DEFAULT 'final' CHECK (kind IN ('final','indicative')),
  ADD COLUMN breakdown    jsonb,
  ADD COLUMN valid_until  timestamptz,
  ADD COLUMN promo_code   text;

-- Widen the immutability guard (QR-030) to the new core columns: only status
-- may ever change after insert
CREATE OR REPLACE FUNCTION quotes_immutable_guard() RETURNS trigger AS $fn$
BEGIN
  IF NEW.rate_table_version IS DISTINCT FROM OLD.rate_table_version
     OR NEW.premium_aed IS DISTINCT FROM OLD.premium_aed
     OR NEW.application_id IS DISTINCT FROM OLD.application_id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.product_code IS DISTINCT FROM OLD.product_code
     OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.breakdown::text IS DISTINCT FROM OLD.breakdown::text
     OR NEW.valid_until IS DISTINCT FROM OLD.valid_until
     OR NEW.promo_code IS DISTINCT FROM OLD.promo_code THEN
    RAISE EXCEPTION 'QR-030: quotes are immutable — re-rating must create a new quote';
  END IF;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

-- Catalogue is readable in every context; writes are rates-manager or
-- platform (product approval AD-04) only
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE products FORCE ROW LEVEL SECURITY;
CREATE POLICY products_read ON products FOR SELECT USING (true);
CREATE POLICY products_write ON products
  USING (current_setting('app.role_code', true) IN ('rates_manager') OR current_setting('app.is_platform', true) = 'true')
  WITH CHECK (current_setting('app.role_code', true) IN ('rates_manager') OR current_setting('app.is_platform', true) = 'true');

ALTER TABLE rate_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_tables FORCE ROW LEVEL SECURITY;
CREATE POLICY rate_tables_read ON rate_tables FOR SELECT USING (true);
CREATE POLICY rate_tables_write ON rate_tables
  USING (current_setting('app.role_code', true) IN ('rates_manager') OR current_setting('app.is_platform', true) = 'true')
  WITH CHECK (current_setting('app.role_code', true) IN ('rates_manager') OR current_setting('app.is_platform', true) = 'true');

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns FORCE ROW LEVEL SECURITY;
CREATE POLICY campaigns_read ON campaigns FOR SELECT USING (true);
CREATE POLICY campaigns_write ON campaigns
  USING (current_setting('app.role_code', true) IN ('rates_manager') OR current_setting('app.is_platform', true) = 'true')
  WITH CHECK (current_setting('app.role_code', true) IN ('rates_manager') OR current_setting('app.is_platform', true) = 'true');

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime;
`,
};
