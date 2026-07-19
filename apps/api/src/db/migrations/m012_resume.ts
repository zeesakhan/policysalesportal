// M1-T10: save & resume (J-R2) — 14-day retention, resume via WhatsApp link,
// one reminder max (no spam to this segment).
export const m012Resume = {
  id: '012_resume',
  sql: `
ALTER TABLE applications
  ADD COLUMN resume_token      uuid UNIQUE,
  ADD COLUMN resume_expires_at timestamptz,
  ADD COLUMN reminder_sent     boolean NOT NULL DEFAULT false;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime;
`,
};
