// M1-T6: declaration evaluation STATUS lives on persons (visible to channels
// as required/complete — WP-09 "status only"); declaration CONTENT stays in
// the TEN-002-locked health_declarations store.
export const m008Declarations = {
  id: '008_declarations',
  sql: `
ALTER TABLE persons
  ADD COLUMN declaration_status      text CHECK (declaration_status IN
    ('not_required','pending','clean','auto_load','refer','decline')),
  ADD COLUMN declaration_loading_pct numeric(6,2) NOT NULL DEFAULT 0;

ALTER TABLE health_declarations
  ADD COLUMN attestation_id uuid REFERENCES attestations(id);  -- JB-06/UW-108 evidence link

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime;
`,
};
