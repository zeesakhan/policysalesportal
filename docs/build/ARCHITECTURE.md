# ARCHITECTURE.md — Technical Constraints & Stack
**Status:** Default stack proposed below; product owner may override before M0 completes. Everything else in this file is constraint, not preference.

## 1. Stack (default — override only with product-owner decision in PROGRESS.md)
- **Backend:** Node.js (NestJS) or equivalent typed framework; PostgreSQL; REST + webhooks.
- **Frontend:** Next.js; one codebase, five portal shells (route groups per tenant type); mobile-first for the customer journey.
- **Rules engine:** configuration-driven (JSON/DB-stored rules keyed by rule ID), evaluated by a single service. Business rules must be changeable without redeploying code wherever the WP marks them `[INSURER]`.
- **Infra:** UAE-region cloud (e.g., AWS me-central-1 or Azure UAE North). All persistence, backups and logs in-country (REG-007/051). IaC from M0.

## 2. Structural Constraints (from the WP suite — binding)
- **Multi-tenancy:** tenant isolation enforced at the data layer (row-level security or equivalent), not in UI/queries alone (TEN-001). One shared schema with `tenant_id` + RLS is acceptable; per-tenant DBs are not required.
- **RBAC:** roles exactly as WP-09 §3 matrix. No custom roles in v1. Health-declaration entities live in a separately-permissioned store/table with column-level control (TEN-002); every privileged read emits an audit event (TEN-004).
- **Audit spine:** append-only audit event table (who, tenant, action, entity, before/after hash, rule IDs, timestamp) written by every engine step (J-R1). Retrievable by EID/policy/date within 1 business day (MIS-010). Retention 10 years.
- **State machines, not flags:** Application (draft → screened → quoted → declared → uw_decided → payment_pending → paid → issued → registered → delivered) and Case (REF-003 states) are explicit state machines with guarded transitions; illegal transitions must be impossible, not just unlikely (e.g., `issued` requires `paid`; `registered` requires `issued`; UW-107 forbids backdating at the transition guard).
- **Idempotent webhooks:** payment-confirmed, issuance, registration webhooks must be idempotent and re-orderable; the three-way match job (PAY-030) is the reconciliation backstop, built early (M1), not last.
- **No card data anywhere:** payment is redirect/link to insurer rails (PAY-001). Add a CI check that fails the build if PAN-like patterns appear in fixtures/logs schema.
- **i18n from day one:** EN/UR/HI/BN/AR content keys; AR = RTL. Hardcoded customer-facing strings are a defect.
- **OTP attestation service:** one shared service used by consent (JB-02), declaration (SC-07), review (SC-08), counter-offer (REF-021) — each producing a stored attestation artifact linked to the application.
- **Quote immutability:** a quote snapshots the rate-table version (QR-001/030); re-rating creates a new quote, never mutates one.

## 3. Integration Adapters (mock-first; see CLAUDE.md §3.5)
`insurer` (quote-confirm, issue, endorse, cancel, payment-link, registration-status) · `icp_validation` (INT-G1) · `icp_card_reader` (INT-G2, typing-centre desks) · `mohre` (INT-G3) · `screening` (INT-G4 lists) · `whatsapp` · `sms_otp` · `email`. Each adapter: interface + mock + contract tests. Mocks must simulate failure modes (ICP mismatch, registration failure ×3, payment timeout) because UAT scenarios depend on them.

## 4. Environments
`dev` → `uat` (seeded with the UAT data pack, mocks in deterministic mode) → `prod` (refuses to start with PLACEHOLDER_ config, per CLAUDE.md §2). Seed scripts are code, versioned, re-runnable.

## 5. Non-Functional Targets
Customer journey p95 page action < 2s on 3G-class mobile; quote computation < 500ms; STP end-to-end (pay→issued) SLA timer instrumented (PAY-021); uptime target 99.5% v1; daily backup + restore drill before launch (evidence for RELEASE-READINESS).
