// M1: journey capture fields (WP-13 SC-01..SC-05) and the EID-keyed decline
// cooling record (J-R3). Cross-channel controls (decline cooling, duplicate
// policy) intentionally read platform-wide — they exist to stop channel
// shopping, so they cannot be tenant-scoped.
export const m003JourneyFields = {
  id: '003_journey_fields',
  sql: `
ALTER TABLE applications
  ADD COLUMN channel              text CHECK (channel IN ('direct','typing_centre','broker','affiliate')),
  ADD COLUMN language             text,                          -- SC-01 (EN/UR/HI/BN/AR)
  ADD COLUMN affiliate_code       text,                          -- QR-023 attribution
  ADD COLUMN consent_at           timestamptz,                   -- REG-050 privacy consent record
  ADD COLUMN emirate_of_visa      text,                          -- UW-103 master branch
  ADD COLUMN visa_status          text CHECK (visa_status IN ('active','in_process','visit')),
  ADD COLUMN mobile               text,                          -- SC-04 delivery + attestation identity
  ADD COLUMN email                text,
  ADD COLUMN employment_category  text CHECK (employment_category IN
    ('private_employee','domestic_worker','self_sponsored','freelancer','dependent')),
  ADD COLUMN sponsor_type         text CHECK (sponsor_type IN ('employer','self','family')),
  ADD COLUMN salary_band          text CHECK (salary_band IN ('lt_4k','4k_10k','gt_10k')),  -- UW-301/401 banding (attestation, UW-302)
  ADD COLUMN occupation           text,                          -- UW-207 restricted-list check
  ADD COLUMN emirate_of_residence text,                          -- informational only (NOT regime — UW-103)
  ADD COLUMN decline_reason       text CHECK (decline_reason IN ('visa_status','identity','medical','eligibility','verification'));

-- J-R3: EID-keyed decline record, 30-day cooling; checked cross-channel
CREATE TABLE decline_records (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  eid            text NOT NULL,
  application_id uuid NOT NULL REFERENCES applications(id),
  reason_category text NOT NULL,
  declined_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX decline_records_eid_idx ON decline_records (eid, declined_at);

ALTER TABLE decline_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE decline_records FORCE ROW LEVEL SECURITY;
-- any journey context may write; only platform (and the engine's system
-- context) may read — channels never see other channels' declines (J-R4)
CREATE POLICY decline_records_write ON decline_records FOR INSERT WITH CHECK (true);
CREATE POLICY decline_records_read ON decline_records FOR SELECT
  USING (current_setting('app.is_platform', true) = 'true');

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime;
`,
};
