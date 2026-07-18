# BUILD-PLAN.md — Phased Plan (session-sized tasks)
Work strictly in order within a milestone; milestones M0→M5. Every task ends with tests + PROGRESS.md update. Task IDs are `M<x>-T<y>`.

## M0 — Foundations
- M0-T1 Repo scaffold, CI (lint, test, PAN-pattern check), IaC skeleton for UAE region, environments dev/uat.
- M0-T2 Data model core: tenants, users, roles (WP-09 matrix seeded), applications, persons (applicant/dependent lives), quotes, policies, cases, audit events. RLS on.
- M0-T3 Audit spine service + state-machine framework (guarded transitions) + OTP attestation service (mock SMS).
- M0-T4 Rules-engine service: loads rule config by rule ID; config register generated to CONFIG-REGISTER.md; PLACEHOLDER_ startup guard.
- M0-T5 i18n framework + content-key extraction; seed EN + AR keys.

## M1 — The Application Engine (on mocks)  → ends at GATE-1
- M1-T1 SC-01/SC-02: entry, consent record, regime routing incl. visit-visa block (UW-101, UW-103).
- M1-T2 SC-03 identity: EID checksum, OCR stub, ICP mock validation (INT-G1), duplicate check (UW-105), no-EID path (KYC-002).
- M1-T3 Screening adapter (mock) + compliance-hold flow (KYC-010–013); async fire at S4.
- M1-T4 SC-04/SC-05: details, sponsor logic (UW-402 notice), salary bands (UW-301/401), dependents as separate lives (UW-307/404), MOHRE mock check (KYC-001a).
- M1-T5 Product catalogue + rate tables (versioned) + quote service (QR-001–012); community-rated instant final quote vs enhanced indicative (WP-13 SC-06).
- M1-T6 SC-07 declarations D1–D8 + MAF expansion; auto-load path (UW-501–506); sensitive-data store with TEN-002 lock.
- M1-T7 UW decision service: full STP/REFER/DECLINE matrix (WP-04 §7) incl. 30-day decline cooling (J-R3); referral case creation (REF-001–003).
- M1-T8 SC-08/SC-09: review + OTP attestation; payment adapter (mock insurer gateway) with 48h window (PAY-003), webhooks idempotent.
- M1-T9 Issuance + registration orchestration (PAY-020–023): mock insurer issue, mock registration with failure×3→ops ticket; three-state tracker; three-way match job (PAY-030).
- M1-T10 SC-10/SC-11/SC-12: delivery (mock WhatsApp/email), my-policies, save & resume (J-R2).
- M1-T11 End-to-end demo script on mocks for all three regimes → **GATE-1 review**.

## M2 — Portal Skins
- M2-T1 Customer portal polish: mobile-first, 5 languages, RTL, accessibility pass.
- M2-T2 Typing centre portal TC-01–06 (consent screen TC-02a, print pack, payout view, operator device binding TEN-013).
- M2-T3 Broker portal BR-01–08 (client book, bulk intake with per-life validation, commission views, client-facing quote PDF).
- M2-T4 Insurer/TPA portal IN-01–08 (referral queue with SLA clocks REF-010–012, product designer with approval pipeline, rate/loading/campaign managers, registration ops, bordereau generator per MIS §2).
- M2-T5 Platform admin AD-01–08 (tenant lifecycle TEN-010–012, compliance workbench, conduct monitor, content manager, audit viewer, exceptions dashboard).
- M2-T6 Affiliate attribution flow (QR-023) + affiliate view (TEN-003).

## M3 — Lifecycle & Money
- M3-T1 Endorsement catalogue END-002 (incl. newborn SLA warning, EID-addition task).
- M3-T2 Cancellation + refund computation display + visa warning + clawback cascade (END-010–015, QR-022).
- M3-T3 Renewals with re-run eligibility (END-020–021).
- M3-T4 Commission/payout ledgers + statements + accounting export (QR-020–022, MIS ledgers).
- M3-T5 Reports catalogue v1 + metrics dictionary implementation (MIS-001–020); DSAR extract (MIS-011).

## M4 — UAT  → ends at GATE-2
- M4-T1 UAT environment seeded with `/docs/build/UAT-PLAN.md` data pack; mocks in deterministic mode.
- M4-T2 Automate all WP-12 Part B scenarios (U-01…U-86) as end-to-end tests; produce traceability matrix (scenario ↔ rule IDs ↔ test file).
- M4-T3 Execute manual UAT scripts (assisted-journey physical flows: consent OTP, print, card-reader stub) and record evidence.
- M4-T4 Defect cycle: fix, re-run failed scenarios only, keep UAT report current.
- M4-T5 UAT report (pass/fail per scenario, open defects with severity, waivers) → **GATE-2 business sign-off**.

## M5 — Hardening & Launch Readiness
- M5-T1 Real integration adapters (behind flags) as credentials arrive: insurer API, ICP, MOHRE, screening, WhatsApp, SMS. Contract tests against sandbox.
- M5-T2 Security pass: authz test sweep (every WP-09 matrix cell has a test), OWASP baseline scan, secrets audit, rate limiting, session controls.
- M5-T3 Ops: runbooks (registration-failure queue, reconciliation breaks, tenant suspension), alerting, backup/restore drill with evidence.
- M5-T4 Performance test vs §5 targets; load test quote path.
- M5-T5 RELEASE-READINESS.md walk-through with evidence links → launch recommendation to product owner.

## Milestone Done-Criteria (summary)
M0: engine skeleton boots, RLS proven by test, placeholder guard works. M1: all three regimes STP end-to-end on mocks; GATE-1 approved. M2: five portals functional per WP-13 screen lists. M3: full lifecycle + money reports reconcile to three-way match. M4: ≥95% UAT scenarios pass, zero open critical/high defects, GATE-2 signed. M5: every RELEASE-READINESS item evidenced.
