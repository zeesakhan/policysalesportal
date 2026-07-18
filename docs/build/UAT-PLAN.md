# UAT-PLAN.md — User Acceptance Testing Plan
**Source of scenarios:** WP-12 Part B (U-01…U-86) is the complete and only scenario catalogue. Do not invent scenarios; if coverage gaps appear, log them for product-owner addition to WP-12.

## 1. Approach
- **Automate everything automatable.** Each U-xx becomes an end-to-end test driving the real engine through the API/UI with mocks in deterministic mode. Naming: `uat/U-42_enhanced_decline_alternative.spec`.
- **Manual scripts only where humans are the point:** assisted typing-centre flow (physical consent, print), Arabic/RTL visual checks, WhatsApp message readability in all 5 languages. Manual scripts live in `/uat/manual/` with step-by-step instructions and an evidence checklist (screenshots/recordings per step).
- **Traceability matrix is a build artifact:** generated table scenario → rule IDs → test file → last run status. WP-12's sign-off depends on it.

## 2. Test Data Pack (synthetic only — never real EIDs)
Seeded personas covering every branch:
- P01 Federal worker age 40, clean (U-10 STP) · P02 Federal age 66 (U-11 refer) · P03 Federal, declared diabetes (U-12) · P04 freelancer (U-13 route)
- P05 Dubai salary 3,500 (U-20) · P06 Dubai salary 9,000 → enhanced (U-21) · P07 married female EBP (U-23) · P08 newborn day-25 endorsement (U-22)
- P09 AD employee w/ spouse+3 kids (U-30) · P10 AD dependent aged 19 (U-31 reject)
- P11 enhanced clean 35/BMI 24 (U-40) · P12 controlled hypertension (U-41 auto-load) · P13 cancer history (U-42) · P14 BMI 38 (U-45) · P15 counter-offer acceptor (U-43) / P16 lapser (U-44)
- P17 fuzzy watchlist name (U-50) · P18 confirmed match (U-51) · P19 one payer, 3 unrelated insureds (U-52)
- P20 visit visa (U-02) · P21 bad EID checksum (U-03) · P22 no-EID new arrival (U-04) · P23 duplicate buyer (U-05) · P24 channel-shopper post-decline (U-74) · P25 cancel-refund abuser (U-83)
Mock modes: ICP pass/fail/expired; MOHRE match/no-record; registration success/fail×3; payment success/timeout.

## 3. Entry Criteria (start UAT only when all true)
M0–M3 complete; all unit/integration tests green; UAT env seeded; mocks deterministic; traceability matrix generated with zero unmapped scenarios.

## 4. Exit Criteria (GATE-2)
- 100% scenarios executed; ≥95% passed; **zero open critical/high defects**; every failed scenario has a product-owner-approved waiver or a fix + re-run.
- Manual evidence pack complete (all 5 languages sighted; assisted flow evidence).
- Security-relevant scenarios (U-63 no card data, U-71 declaration denial, U-72 tenant isolation) pass with audit-log evidence attached.
- UAT report produced: summary, per-scenario table, defect log, waivers, evidence links — formatted for business sign-off against WP-12 Part C.

## 5. Defect Workflow
Severity: Critical (money/identity/health-data/wrong policy) · High (journey blocked) · Medium (workaround exists) · Low (cosmetic). Critical/High: fix before proceeding, re-run the failed scenario plus its rule-ID siblings. Every defect cites the violated rule ID — a defect with no rule ID means either a spec gap (escalate) or not a defect.
