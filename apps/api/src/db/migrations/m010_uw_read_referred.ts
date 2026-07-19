// WP-09 matrix: Insurer UW — "Applications R referred". The underwriter role
// may READ applications that sit in the underwriting queue; all writes stay
// with the engine (system context) which records the insurer's decision
// (REF-024: the portal never alters an insurer decision — it executes it).
export const m010UwReadReferred = {
  id: '010_uw_read_referred',
  sql: `
CREATE POLICY applications_underwriter_referred ON applications FOR SELECT
  USING (current_setting('app.role_code', true) = 'underwriter'
         AND EXISTS (SELECT 1 FROM cases c
                     WHERE c.application_id = applications.id
                       AND c.queue = 'underwriting'));

CREATE POLICY persons_underwriter_referred ON persons FOR SELECT
  USING (current_setting('app.role_code', true) = 'underwriter'
         AND EXISTS (SELECT 1 FROM cases c
                     WHERE c.application_id = persons.application_id
                       AND c.queue = 'underwriting'));

CREATE POLICY quotes_underwriter_referred ON quotes FOR SELECT
  USING (current_setting('app.role_code', true) = 'underwriter'
         AND EXISTS (SELECT 1 FROM cases c
                     WHERE c.application_id = quotes.application_id
                       AND c.queue = 'underwriting'));
`,
};
