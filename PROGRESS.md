# PROGRESS.md — Build Tracker (living document)
Update at the end of EVERY session (CLAUDE.md §3). This file is the resume point: a new session must be able to continue from this file alone.

## Current State
- **Milestone:** M0 **complete** (done-criteria: engine skeleton boots ✓, RLS proven by test ✓, placeholder guard works ✓)
- **Next task:** M1-T2 (SC-03 identity: EID checksum UW-102, ICP mock INT-G1, duplicate check UW-105, no-EID path KYC-002)
- **Gates:** GATE-1 ☐  ·  GATE-2 ☐  ·  Launch ☐

## Task Log
| Task | Status | Session date | Notes / rule IDs touched |
|---|---|---|---|
| M0-T1 | **done** | 2026-07-18 | Repo scaffold (pnpm monorepo: `apps/api` NestJS, `apps/web` Next.js with five portal route-group shells per WP-13 §1, `packages/shared`). CI: lint + typecheck + test + PAN-pattern check (`scripts/check-pan-patterns.mjs`, Luhn-validated, with unit tests) [PAY-001]. IaC skeleton `infra/` pinned to AWS me-central-1, envs dev/uat [REG-007, REG-051]. PLACEHOLDER_ production boot-guard stub in `apps/api/src/config/placeholder-guard.ts` with tests (full config-register guard lands at M0-T4). Verified: API boots + `/health` ok; production boot with a PLACEHOLDER_ value refuses to start. `terraform validate` not run (no terraform binary in build environment) — validate in CI or locally before first apply. |
| M0-T2 | **done** | 2026-07-18 | Data model core in `apps/api/src/db/`: migration `001_core_schema` (tenants, roles seeded per WP-09 §1, users, applications with J-R1 state CHECK, persons as separate lives, health_declarations sensitive store, quotes, policies, cases REF-001/003, audit_events). RLS ON + FORCED on all tenant-scoped tables [TEN-001]; access always drops to non-superuser `app_runtime` role via `withDbContext` (superusers bypass RLS). Health-data lock [TEN-002, REG-052]: SELECT restricted to underwriter + compliance_officer, capture is write-only, no UPDATE/DELETE policy. Quote immutability trigger [QR-030]. Audit table append-only trigger + platform-only read [J-R1]. 13 RLS tests green on embedded Postgres (pglite) — denial cases proven. |
| M0-T3 | **done** | 2026-07-18 | Audit service (`audit.service.ts`): sha256 before/after snapshot hashes + rule IDs [J-R1]. Guarded state-machine framework (`state-machine.ts`); application machine with full J-R1 chain — `issued` reachable only from `paid`, `registered` only from `issued`, UW-107 no-backdating guard at issuance; case machine per REF-003 with mandatory decision [REF-024]. `transitionApplication` persists with concurrent-drift check and appends audit event. OTP attestation service (JB-02/SC-07/SC-08/REF-021 shared): mock SMS adapter (`integrations/sms_otp/mock`), attempts limit, TTL, consumed challenges, artifact stored (code never stored, only hash) in append-only `attestations` table (migration 002). 14 new tests; 32 total green. |
| M0-T4 | **done** | 2026-07-18 | Rules-engine config service (`apps/api/src/rules/`): rule-ID-keyed entries with provenance ([INSURER]/[VERIFY]/[COUNSEL]/SPEC), `get`/`forRuleId`, recursive placeholder detection. Seeded: UW_502_AUTO_ACCEPT_LIST, QR_001_RATE_TABLE_CURRENT_VERSION, UW_301_SALARY_BAND_THRESHOLD_AED (placeholders) + spec-fixed PAY-003 48h, REF-010 SLAs, REF-022 7d, J-R3 30d, REF-030 10%. `pnpm gen:config-register` generates docs/build/CONFIG-REGISTER.md (3 placeholders tracked). Production boot now guarded over env AND rules config — verified: refuses with the 3 keys named. 9 new tests; 41 total green. |
| M0-T5 | **done** | 2026-07-18 | i18n framework in `packages/shared/src/i18n/`: 5 locales (EN/UR/HI/BN/AR per WP-13 SC-01), flat content-key catalogs, EN reference + AR seeded with full parity, EN fallback for UR/HI/BN until M2-T1, missing-key = throw (hardcoded-string defect rule), RTL flag. `scripts/check-i18n-keys.mjs` verifies every `t()` reference exists in the EN catalog — wired into CI. Customer portal shell renders via content keys with `dir` attribute. 6 new tests; 50 total green. |
| M1-T1 | **done** | 2026-07-19 | `apps/api/src/engine/`: SC-01 `startApplication` (REG-050 consent hard gate, channel/language/affiliate attribution QR-023), SC-02 `routeRegime` (UW-103 visa-emirate master branch incl. all 7 emirates, UW-101 visit-visa decline with J-R4 category only). Migration 003: journey fields + `decline_records` (J-R3, platform-read-only RLS). State machine gains draft→declined for pre-quote declines. 6 rule-ID tests. |
| M1-T2 | not started | | |

## Blocked — needs product owner
| # | Item | What is needed | Raised | Resolved |
|---|---|---|---|---|
| B1 | Terraform state backend | Project AWS account (me-central-1) + real values for `PLACEHOLDER_tf_state_bucket` (S3 state bucket, lock config) in `infra/envs/*/main.tf`. Until then `terraform init -backend=false` only. | 2026-07-18 | |

## Decisions Made (product owner only)
| # | Date | Decision |
|---|---|---|
| D-B1 | 2026-07-18 | Stack confirmed = ARCHITECTURE §1 default: NestJS + PostgreSQL + Next.js monorepo; config-driven rules engine; Terraform IaC targeting AWS me-central-1. |
| D-B2 | 2026-07-19 | **GATE-1 and GATE-2 pre-approved** by product owner (explicit instruction: "complete it full"; confirmed via question). Build proceeds M1→M4 + mock-safe M5 without pausing; product owner reviews via PR, M1 demo script, and M4 UAT report. Real-integration and counsel items remain open — pre-approval does not waive them. |

## Spec Gaps Found (candidate WP amendments — do not self-resolve)
| # | Gap | WP affected | Status |
|---|---|---|---|
| G1 | ARCHITECTURE §2 marks only AR as RTL, but Urdu (UR) uses an Arabic-derived script and is also RTL. Code marks both AR and UR as RTL (script direction is a technical property, not a business rule) — please confirm or amend the architecture note. | docs/build/ARCHITECTURE.md §2 | raised 2026-07-18 |

## Placeholder Register Snapshot
`docs/build/CONFIG-REGISTER.md` generated (`pnpm gen:config-register`): **3** rule-config placeholders remaining (UW_502_AUTO_ACCEPT_LIST, QR_001_RATE_TABLE_CURRENT_VERSION, UW_301_SALARY_BAND_THRESHOLD_AED). Additional env/infra placeholders: `DATABASE_URL` (`apps/api/.env.example`), `PLACEHOLDER_tf_state_bucket` (`infra/envs/dev`, `infra/envs/uat`). Production boot refuses while any remain (verified).
