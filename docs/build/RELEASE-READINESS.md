# RELEASE-READINESS.md — "Final Product Ready" Checklist
The product is launch-ready only when every line has an evidence link (test run, report, screenshot, config export, drill record). Opinions don't check boxes; evidence does.

## Functional
- [ ] All WP-12 UAT scenarios pass or carry signed waivers (link UAT report; GATE-2 signature)
- [ ] All three regimes STP end-to-end on **real** insurer sandbox (not mocks)
- [ ] Referral, counter-offer, decline+alternative flows verified with insurer underwriter user
- [ ] Endorsements, cancellation+refund display, renewal re-eligibility verified
- [ ] Bordereau generated for a test period ties exactly to issued policies (U-86 on real data shapes)

## Configuration & Placeholders
- [ ] CONFIG-REGISTER.md shows **zero** PLACEHOLDER_ values; every [INSURER] value loaded from signed partner annex
- [ ] Every [VERIFY] item re-checked against current DHA/DoH/MOHRE publications, dated, initialled
- [ ] Rate tables, loading lists, decline lists, campaigns loaded and version-locked by the insurer user

## Integrations (real)
- [ ] ICP Validation Gateway live: pass/fail/expired paths tested with ICP test environment (cooperation contract completed)
- [ ] Card-reader chip read working at one pilot typing-centre desk
- [ ] MOHRE validation live or product-owner-approved fallback documented
- [ ] Screening engine on live EOCN/UN feeds; list-update propagation timed; goAML registration confirmed
- [ ] Insurer API + payment rails live: payment, issuance ≤15min, registration confirmation, refund status
- [ ] WhatsApp/SMS templates approved and delivering in all 5 languages (Arabic RTL sighted)

## Security & Compliance
- [ ] Full WP-09 matrix authz test sweep green (every role × capability cell)
- [ ] TEN-002 health-data lock: denial + audit evidence (U-71) re-run on prod-config
- [ ] No card data anywhere: CI check + manual sweep of logs/DB (U-63)
- [ ] Data residency evidence: all stores/backups/logs in UAE region; 10-year retention configured
- [ ] OWASP baseline scan: no high findings open; secrets audit clean; MFA on privileged roles; session policy per TEN-013
- [ ] PDPL artefacts: privacy notices live in all languages, sensitive-consent capture verified, DSAR extract tested (MIS-011)
- [ ] Audit trail: random policy reconstructed end-to-end from audit events within SLA (MIS-010 drill)

## Operations
- [ ] Runbooks: registration-failure queue, reconciliation break, tenant suspension, incident comms — walked through once each
- [ ] Alerting live: SLA breaches (PAY-021/023, REF-012), three-way-match orphans, error budgets
- [ ] Backup + restore drill completed with timing evidence
- [ ] Performance: p95 targets met on 3G-class mobile test; quote < 500ms under load

## Business
- [ ] WP-12 Part A checklist fully signed (incl. WP-13 addendum rows)
- [ ] At least one tenant of each type onboarded in prod (gates TEN-010 passed: agreements, AML attestation)
- [ ] Pilot plan: first typing centre + first 50 policies monitoring plan agreed
- [ ] Launch decision recorded by product owner in PROGRESS.md

**Launch recommendation** may be made by the AI developer; **launch decision** is the product owner's alone.
