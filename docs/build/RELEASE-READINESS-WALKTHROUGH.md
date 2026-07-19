# RELEASE-READINESS Walkthrough (M5-T5)

Line-by-line pass over `docs/build/RELEASE-READINESS.md` with evidence links
or an explicit reason the item is open. The checklist file itself is left
for the product owner to actually check off — this document is the evidence
trail behind each line, produced by the AI developer per BUILD-PLAN M5-T5.
**No line here is a launch decision** — that is the product owner's alone
(RELEASE-READINESS.md's own closing line).

## Functional

- [~] **All WP-12 UAT scenarios pass or carry signed waivers.**
  Evidence: `uat/UAT-REPORT.md` — 42/42 automated scenarios pass, 0
  waivers needed. **Partial**: the WP-12 Part C physical sign-off block
  (business owner / underwriting rep / compliance / product-tech
  signatures) is unsigned — that is a human action, not a build task.
- [ ] **All three regimes STP end-to-end on real insurer sandbox.**
  Open. `pnpm demo` and `e2e-regimes.spec.ts` prove this on mocks
  (M1-T11). Real-sandbox proof requires the M5-T1 real insurer adapter,
  gated on partner API credentials — not available in this environment.
- [ ] **Referral, counter-offer, decline+alternative flows verified with
  insurer underwriter user.**
  Open for the same reason. Mock evidence: U-42/U-43/U-44
  (`enhanced.uat.spec.ts`), `decision.service.spec.ts`. A real
  underwriter user needs the live insurer portal access this build
  cannot provision.
- [x] **Endorsements, cancellation+refund display, renewal re-eligibility
  verified.**
  Evidence (on mocks/demo data — no "real" qualifier on this line):
  `lifecycle.spec.ts`, UAT U-80…U-86 (`lifecycle-money.uat.spec.ts`).
- [~] **Bordereau ties exactly to issued policies.**
  Evidence: U-86 proves exact tie-out on demo data shapes
  (`bordereau()` in `reports.service.ts`). **Open**: the real bordereau
  *format* is a per-partner annex (MIS §2: "agreed CSV/Excel layout per
  partner annex") — not yet defined because no partner annex exists.

## Configuration & Placeholders

- [ ] **CONFIG-REGISTER.md shows zero PLACEHOLDER_ values.**
  Open by design — `docs/build/CONFIG-REGISTER.md` currently lists
  **9** placeholders (UW_502/UW_207/UW_506/UW_508 lists+cap,
  QR_001 rate version, UW_301 salary threshold, END_011 refund table,
  QR_020 commission %, QR_021 payout table). Every one requires the
  signed insurer annex or a business decision (QR_021 payout table is
  explicitly "[BUSINESS to set]" per WP-05 QR-021). Production boot is
  verified to refuse to start while any remain
  (`rules-engine.spec.ts`).
- [ ] **Every [VERIFY] item re-checked against current DHA/DoH/MOHRE
  publications.** Open — needs a human to check current regulator
  publications; a build task cannot verify external-world facts. Items:
  UW-301 (Dubai salary band), UW-401 (AD threshold), UW-206/304/403
  (declaration-required flags), UW-203 (newborn standalone eligibility).
- [ ] **Rate tables, loading lists, decline lists, campaigns loaded and
  version-locked by the insurer user.** Open — demo/placeholder values
  only (`seed-demo.ts`); IN-03/IN-04/IN-05 screens exist and are
  functional (M2-T4) for the insurer user to load real values into once
  the annex is signed.

## Integrations (real)

All six items in this section are **open**, gated on M5-T1 (real
integration adapters, deferred — credentials not available in this
environment). Every adapter has a mock implementation that the full
journey runs against end-to-end (CLAUDE.md §3.5 mock-first), each behind
a port interface so a real adapter is a drop-in swap, not a rebuild:
- ICP Validation Gateway: `apps/api/src/integrations/icp_validation/{port,mock}.ts`
- Card-reader/EID SDK: not yet built even as a mock (no INT-G2 port
  exists) — flagged here as a genuine gap, not just "real adapter
  pending"; a mock is buildable without hardware, unlike the others.
- MOHRE: `apps/api/src/integrations/mohre/{port,mock}.ts`
- Screening engine: `apps/api/src/integrations/screening/{port,mock}.ts`
- Insurer API + payment rails: `apps/api/src/integrations/insurer/{port,mock}.ts`
- WhatsApp/SMS: `apps/api/src/integrations/{whatsapp,sms_otp}/{port,mock}.ts`

## Security & Compliance

- [x] **Full WP-09 matrix authz test sweep green.**
  Evidence: `apps/api/src/security/authz-matrix.spec.ts` — one test
  block per matrix row (Applications, Health declarations, Quotes, Rate
  tables, Referral queue, Compliance queue, Policies,
  Endorsements/cancellations, Commission/payout, Tenant management,
  Audit logs), 18 tests, all roles from WP-09 §1 exercised. This sweep
  found and fixed a real gap: quotes had no read policy for the insurer
  rates-manager role (migration `014_insurer_rates_read`).
- [x] **TEN-002 health-data lock: denial + audit evidence, re-run on
  prod-config.** Evidence: `rls.spec.ts` (M0), U-71
  (`channels-permissions.uat.spec.ts`). "Prod-config" caveat: RLS policy
  behaviour is identical in every environment (same SQL, same
  `app_runtime` role) — there is no separate "prod mode" for RLS to
  diverge in, so mock-environment evidence is representative.
- [x] **No card data anywhere: CI check + manual sweep.**
  Evidence: `scripts/check-pan-patterns.mjs` runs in CI on every push
  (`.github/workflows/ci.yml`); U-63 (`payment-issuance.uat.spec.ts`)
  additionally scans live database content from a completed payment
  journey, not just source text.
- [ ] **Data residency evidence: all stores/backups/logs in UAE region.**
  Open — `infra/` pins `me-central-1` in Terraform (M0-T1), but no
  actual cloud resources have been provisioned (blocked item B1 in
  PROGRESS.md: no AWS account yet). No backups exist to evidence because
  nothing is deployed.
- [ ] **OWASP baseline scan; secrets audit; MFA; session policy.**
  **Secrets audit: done** — no `.env` files or credentials committed
  (verified: only `.env.example` with `PLACEHOLDER_` values is
  tracked). **OWASP scan: open** — needs a running deployed target, not
  available. **MFA: open** — no real IdP exists yet (mock header auth
  only, M5-T2 real-auth deferred). **Session policy (TEN-013, 15-min
  timeout for privileged roles, device binding for operators, no
  concurrent sessions): open** — not implemented; the current mock-auth
  layer has no session concept at all. **Flagged as a real gap**, not a
  formality — the real IdP work (M5-T2) is where this belongs.
- [ ] **PDPL artefacts: privacy notices, sensitive-consent capture,
  DSAR extract.** **Sensitive-consent capture: done** — REG-050 hard
  gates at SC-01 (`startApplication`) and SC-07
  (`submitDeclaration`), tested. **DSAR extract: done** —
  `dsarExtract()` (MIS-011), platform/compliance-only via RLS. **Privacy
  notices live in all languages: open** — no dedicated privacy-notice
  content page exists yet (only the SC-01 consent checkbox + link
  placeholder); the linked notice document itself needs legal drafting.
- [ ] **Audit trail: random policy reconstructed end-to-end within SLA.**
  Open as a live drill (needs a deployed environment with real
  production-like data volume to time against the 1-business-day MIS-010
  SLA meaningfully). Mechanism is evidenced:
  `GET /admin/audit?entityId=` reconstructs any application/policy's
  full history by ID (AD-07); tested structurally in
  `transition-audit.spec.ts`.

## Operations

- [x] **Runbooks: registration-failure queue, reconciliation break,
  tenant suspension, incident comms — walked through once each.**
  Written: `docs/ops/RUNBOOK-registration-failure-queue.md`,
  `RUNBOOK-reconciliation-break.md`, `RUNBOOK-tenant-suspension.md`,
  `RUNBOOK-incident-comms.md`. **"Walked through" caveat**: written and
  internally consistent with the built system, but not yet walked
  through live with an actual ops team — that walkthrough is a human
  action to schedule before launch.
- [ ] **Alerting live.** Open — no monitoring/alerting stack is wired
  up; this build environment has no deployed target to alert on. The
  signals to alert on are identified and queryable
  (`GET /reports/exceptions`, `GET /ops/tickets`) — wiring them into a
  paging system is an M5 build task not started.
- [ ] **Backup + restore drill.** Open — no deployed database exists to
  back up (blocked on B1, no AWS account).
- [ ] **Performance: p95 targets, quote < 500ms under load.** Open — no
  load-testing target exists; PGlite (the dev/test database) is not
  representative of production Postgres performance characteristics.

## Business

All four items are explicitly product-owner/business actions, not build
tasks: WP-12 Part A sign-off, tenant onboarding in prod, pilot plan
agreement, and the launch decision itself. Nothing here can be evidenced
by code.

## Summary

| Section | Done | Partial | Open |
|---|---|---|---|
| Functional | 1 | 2 | 2 |
| Configuration & Placeholders | 0 | 0 | 3 |
| Integrations (real) | 0 | 0 | 6 |
| Security & Compliance | 3 | 0 | 4 |
| Operations | 1 | 0 | 3 |
| Business | 0 | 0 | 4 |

**Everything buildable on mocks without real-world credentials, hardware, or
business decisions has been built and evidenced.** Every open item traces to
one of three root causes: (1) no signed insurer partner annex yet, (2) no
provisioned cloud infrastructure yet (blocked item B1), (3) no real
integration credentials yet (M5-T1, explicitly deferred). None of these can
be closed by further coding in this environment — they need the product
owner's action per README.md's own division of labour ("Your job as product
owner — the parts AI cannot do").
