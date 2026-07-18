# PROGRESS.md — Build Tracker (living document)
Update at the end of EVERY session (CLAUDE.md §3). This file is the resume point: a new session must be able to continue from this file alone.

## Current State
- **Milestone:** M0
- **Next task:** M0-T3 (audit spine service + state-machine framework + OTP attestation service)
- **Gates:** GATE-1 ☐  ·  GATE-2 ☐  ·  Launch ☐

## Task Log
| Task | Status | Session date | Notes / rule IDs touched |
|---|---|---|---|
| M0-T1 | **done** | 2026-07-18 | Repo scaffold (pnpm monorepo: `apps/api` NestJS, `apps/web` Next.js with five portal route-group shells per WP-13 §1, `packages/shared`). CI: lint + typecheck + test + PAN-pattern check (`scripts/check-pan-patterns.mjs`, Luhn-validated, with unit tests) [PAY-001]. IaC skeleton `infra/` pinned to AWS me-central-1, envs dev/uat [REG-007, REG-051]. PLACEHOLDER_ production boot-guard stub in `apps/api/src/config/placeholder-guard.ts` with tests (full config-register guard lands at M0-T4). Verified: API boots + `/health` ok; production boot with a PLACEHOLDER_ value refuses to start. `terraform validate` not run (no terraform binary in build environment) — validate in CI or locally before first apply. |
| M0-T2 | **done** | 2026-07-18 | Data model core in `apps/api/src/db/`: migration `001_core_schema` (tenants, roles seeded per WP-09 §1, users, applications with J-R1 state CHECK, persons as separate lives, health_declarations sensitive store, quotes, policies, cases REF-001/003, audit_events). RLS ON + FORCED on all tenant-scoped tables [TEN-001]; access always drops to non-superuser `app_runtime` role via `withDbContext` (superusers bypass RLS). Health-data lock [TEN-002, REG-052]: SELECT restricted to underwriter + compliance_officer, capture is write-only, no UPDATE/DELETE policy. Quote immutability trigger [QR-030]. Audit table append-only trigger + platform-only read [J-R1]. 13 RLS tests green on embedded Postgres (pglite) — denial cases proven. |
| M0-T3 | not started | | |

## Blocked — needs product owner
| # | Item | What is needed | Raised | Resolved |
|---|---|---|---|---|
| B1 | Terraform state backend | Project AWS account (me-central-1) + real values for `PLACEHOLDER_tf_state_bucket` (S3 state bucket, lock config) in `infra/envs/*/main.tf`. Until then `terraform init -backend=false` only. | 2026-07-18 | |

## Decisions Made (product owner only)
| # | Date | Decision |
|---|---|---|
| D-B1 | 2026-07-18 | Stack confirmed = ARCHITECTURE §1 default: NestJS + PostgreSQL + Next.js monorepo; config-driven rules engine; Terraform IaC targeting AWS me-central-1. |

## Spec Gaps Found (candidate WP amendments — do not self-resolve)
| # | Gap | WP affected | Status |
|---|---|---|---|
| | | | |

## Placeholder Register Snapshot
CONFIG-REGISTER.md not yet generated (arrives at M0-T4). Interim `PLACEHOLDER_` values in the tree: `DATABASE_URL` (`apps/api/.env.example`), `PLACEHOLDER_tf_state_bucket` (`infra/envs/dev`, `infra/envs/uat`).
