# CONFIG-REGISTER.md — Rule Configuration Register
**Generated:** 2026-07-18T20:02:32.837Z — do not edit by hand; run `pnpm gen:config-register`.

Placeholders remaining: **3** (production refuses to start unless this is 0 — CLAUDE.md §2).

| Key | Rule IDs | Source | Status | Value | Description |
|---|---|---|---|---|---|
| `J_R3_DECLINE_COOLING_DAYS` | REF-023 | [SPEC] | set | `30` | Decline cooling period keyed to EID before re-application |
| `PAY_003_PAYMENT_WINDOW_HOURS` | PAY-003 | [SPEC] | set | `48` | Payment window after UW accept before the application lapses |
| `QR_001_RATE_TABLE_CURRENT_VERSION` | QR-001, QR-030 | [INSURER] | **PLACEHOLDER** | — | Current versioned rate-table pointer; quotes snapshot this version |
| `REF_010_SLA_COMPLIANCE_DAYS` | REF-010 | [SPEC] | set | `1` | Compliance queue SLA (business days) |
| `REF_010_SLA_EDD_DAYS` | REF-010 | [SPEC] | set | `2` | Enhanced due diligence SLA (business days) |
| `REF_010_SLA_MEDICAL_REPORT_DAYS` | REF-010 | [SPEC] | set | `3` | Medical-report referral SLA (business days) |
| `REF_010_SLA_STANDARD_UW_DAYS` | REF-010 | [SPEC] | set | `1` | Standard underwriting referral SLA (business days) |
| `REF_022_COUNTER_OFFER_VALIDITY_DAYS` | REF-022 | [SPEC] | set | `7` | Counter-offer validity; expiry closes the case as lapsed |
| `REF_030_REFERRAL_RATE_TARGET_PCT` | REF-030 | [SPEC] | set | `10` | Referral-rate KPI target for Basic/EBP volume products |
| `UW_301_SALARY_BAND_THRESHOLD_AED` | UW-301, UW-401 | [VERIFY] | **PLACEHOLDER** | — | Salary band threshold routing basic vs enhanced eligibility — re-verify against current DHA/DoH publications |
| `UW_502_AUTO_ACCEPT_LIST` | UW-502 | [INSURER] | **PLACEHOLDER** | — | Conditions auto-acceptable with loading (declared conditions path) — from signed insurer annex |
