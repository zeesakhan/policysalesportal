# UAT Traceability Matrix (generated)
Source of scenarios: WP-12 Part B. Generated from `apps/api/src/uat/scenarios/*.uat.spec.ts` — do not edit by hand;
run `pnpm gen:traceability`.

Total scenarios automated: **42**. Unmapped (no rule-ID citation): **0**.

| Scenario | Title | Rule IDs | Test file |
|---|---|---|---|
| U-01 | Sharjah-resident with Dubai visa buys → routed to Dubai products | UW-103 | `apps/api/src/uat/scenarios/eligibility-routing.uat.spec.ts` |
| U-02 | Visit-visa applicant → declined, category "visa status" | UW-101, J-R4 | `apps/api/src/uat/scenarios/eligibility-routing.uat.spec.ts` |
| U-03 | Invalid EID checksum → blocked | UW-102 | `apps/api/src/uat/scenarios/eligibility-routing.uat.spec.ts` |
| U-04 | New arrival, passport+entry permit, no EID → proceeds; EID endorsement task created | UW-102, KYC-002, END-002a | `apps/api/src/uat/scenarios/eligibility-routing.uat.spec.ts` |
| U-05 | Duplicate purchase same EID same regime → blocked, routed to endorsement/replacement | UW-105 | `apps/api/src/uat/scenarios/eligibility-routing.uat.spec.ts` |
| U-06 | Backdated start date attempt → hard block | UW-107 | `apps/api/src/uat/scenarios/eligibility-routing.uat.spec.ts` |
| U-10 | Age 40 domestic worker, clean → STP, no health declaration | UW-201, UW-204, UW-206, UW-208 | `apps/api/src/uat/scenarios/federal.uat.spec.ts` |
| U-11 | Age 66 → REFER with medical-report requirement, 3-day SLA | UW-202, REF-010 | `apps/api/src/uat/scenarios/federal.uat.spec.ts` |
| U-12 | Declared diabetes on federal scheme → still STP-eligible; condition recorded | UW-205 | `apps/api/src/uat/scenarios/federal.uat.spec.ts` |
| U-13 | Freelancer selects federal scheme → routed to alternative product | UW-204 | `apps/api/src/uat/scenarios/federal.uat.spec.ts` |
| U-20 | Salary AED 3,500 employee → EBP track, community-rated, STP | UW-301, UW-304, UW-308 | `apps/api/src/uat/scenarios/dubai-ebp.uat.spec.ts` |
| U-21 | Salary AED 9,000 → enhanced track | UW-301 | `apps/api/src/uat/scenarios/dubai-ebp.uat.spec.ts` |
| U-22 | Newborn addition day 25 → endorsement processed; day-20 warning fired | END-002c, REG-024 | `apps/api/src/uat/scenarios/dubai-ebp.uat.spec.ts` |
| U-23 | Married female EBP buyer → maternity terms + waiting notice displayed | UW-306 | `apps/api/src/uat/scenarios/dubai-ebp.uat.spec.ts` |
| U-30 | AD-visa employee individual purchase → sponsor-obligation notice + acknowledgement captured | UW-402 | `apps/api/src/uat/scenarios/abu-dhabi.uat.spec.ts` |
| U-31 | Dependent child aged 19 in sponsored-children category → validation rejects category | UW-404 | `apps/api/src/uat/scenarios/abu-dhabi.uat.spec.ts` |
| U-40 | All declarations "No", age 35, BMI 24 → STP | UW-501, UW-503, UW-504, UW-510 | `apps/api/src/uat/scenarios/enhanced.uat.spec.ts` |
| U-41 | Controlled hypertension on auto-accept list → auto-load applied, premium re-quoted, itemised | UW-502, UW-506, QR-003 | `apps/api/src/uat/scenarios/enhanced.uat.spec.ts` |
| U-42 | Declared cancer history → REFER; insurer declines; customer offered federal Basic alternative | UW-502, UW-508, REF-023 | `apps/api/src/uat/scenarios/enhanced.uat.spec.ts` |
| U-43 | Counter-offer with exclusion → customer accepts via OTP; acceptance stored; payment proceeds | UW-507, REF-021 | `apps/api/src/uat/scenarios/enhanced.uat.spec.ts` |
| U-44 | Counter-offer ignored 8 days → lapsed | REF-022 | `apps/api/src/uat/scenarios/enhanced.uat.spec.ts` |
| U-45 | BMI 38 → REFER | UW-504 | `apps/api/src/uat/scenarios/enhanced.uat.spec.ts` |
| U-50 | Fuzzy watchlist match → compliance queue, neutral customer message, cleared in 1 day | KYC-012, KYC-013, REF-001 | `apps/api/src/uat/scenarios/screening-compliance.uat.spec.ts` |
| U-51 | Confirmed match → decline + freeze; no tipping-off content | KYC-012 | `apps/api/src/uat/scenarios/screening-compliance.uat.spec.ts` |
| U-52 | One payer paying for 3 unrelated insureds → EDD triggered | KYC-020, KYC-004 | `apps/api/src/uat/scenarios/screening-compliance.uat.spec.ts` |
| U-60 | STP end-to-end: pay on insurer gateway → issued ≤15min → registered → Active&registered → WhatsApp pack delivered | PAY-001, PAY-021, PAY-022, PAY-024 | `apps/api/src/uat/scenarios/payment-issuance.uat.spec.ts` |
| U-61 | Registration fails → 3 retries → ops ticket → customer "processing" notice → resolved in SLA | PAY-023 | `apps/api/src/uat/scenarios/payment-issuance.uat.spec.ts` |
| U-62 | Payment window lapses at 49 hours → application back to quoted | PAY-003 | `apps/api/src/uat/scenarios/payment-issuance.uat.spec.ts` |
| U-63 | Verify portal database contains no card data after a completed payment | PAY-001 | `apps/api/src/uat/scenarios/payment-issuance.uat.spec.ts` |
| U-70 | Typing centre full assisted sale with consent OTP + declaration OTP artifacts stored | JB-02, JB-06, UW-108 | `apps/api/src/uat/scenarios/channels-permissions.uat.spec.ts` |
| U-71 | Operator attempts to view a declaration answer → denied and audit-logged | TEN-002, TEN-004 | `apps/api/src/uat/scenarios/channels-permissions.uat.spec.ts` |
| U-72 | Broker A attempts access to Broker B client → denied at data layer | TEN-001 | `apps/api/src/uat/scenarios/channels-permissions.uat.spec.ts` |
| U-73 | Affiliate link purchase → attribution recorded; affiliate sees conversion, no PII | QR-023, TEN-003 | `apps/api/src/uat/scenarios/channels-permissions.uat.spec.ts` |
| U-74 | Declined applicant retries via typing centre within 30 days → cooling rule applies | J-R3, REF-023 | `apps/api/src/uat/scenarios/channels-permissions.uat.spec.ts` |
| U-75 | Suspended tenant → no new business; in-flight completes | TEN-011 | `apps/api/src/uat/scenarios/channels-permissions.uat.spec.ts` |
| U-80 | Cancellation pre-registration → full refund computed and displayed pre-confirmation | END-011 | `apps/api/src/uat/scenarios/lifecycle-money.uat.spec.ts` |
| U-81 | Cancellation of visa-linked policy → warning + acknowledgement captured | END-012 | `apps/api/src/uat/scenarios/lifecycle-money.uat.spec.ts` |
| U-82 | Cancellation triggers commission + payout clawback | QR-022, END-014 | `apps/api/src/uat/scenarios/lifecycle-money.uat.spec.ts` |
| U-83 | Second cancel-refund cycle in year → EDD flag + purchase block | END-015, KYC-020 | `apps/api/src/uat/scenarios/lifecycle-money.uat.spec.ts` |
| U-84 | Renewal at age crossing 65 on federal scheme → renewal runs UW → REFER | END-020, UW-202 | `apps/api/src/uat/scenarios/lifecycle-money.uat.spec.ts` |
| U-85 | Daily three-way match detects a seeded paid-not-issued orphan | PAY-030, MIS-002 | `apps/api/src/uat/scenarios/lifecycle-money.uat.spec.ts` |
| U-86 | Bordereau for a test month ties exactly to policies issued | MIS bordereau, MIS-002 | `apps/api/src/uat/scenarios/lifecycle-money.uat.spec.ts` |
