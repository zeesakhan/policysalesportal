// M1-T4: SC-04/SC-05 sponsor context, product-track routing, dependent
// relationship.
export const m006Details = {
  id: '006_details',
  sql: `
ALTER TABLE applications
  ADD COLUMN employer_name        text,
  ADD COLUMN sponsor_name         text,
  ADD COLUMN sponsor_relationship text,
  -- routing outcome of UW-204/301/401: which product track this application quotes on
  ADD COLUMN product_track        text CHECK (product_track IN ('federal_basic','dubai_ebp','ad_basic','enhanced'));

ALTER TABLE persons
  ADD COLUMN relationship text CHECK (relationship IN ('spouse','child','parent','other')),
  ADD COLUMN mohre_status text CHECK (mohre_status IN ('match','no_record'));

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime;
`,
};
