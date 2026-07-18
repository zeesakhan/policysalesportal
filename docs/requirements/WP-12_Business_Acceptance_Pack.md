# WP-12 — Business Acceptance Pack
**Version:** 1.0 (for business review) | **Date:** 12 July 2026
**Depends on:** WP-01 through WP-11
**Purpose:** the single pack the business department signs. Acceptance of this pack = acceptance of the documented journeys and rules as the build specification.

---

## Part A — Sign-off Checklist

| # | Item | Source | Business owner initials | Date |
|---|---|---|---|---|
| A1 | Product scope: individual medical, three regimes | WP-01 §3 | | |
| A2 | Routing principle: emirate of visa issuance | WP-01 §3 | | |
| A3 | Segments & Phase 1 languages | WP-01 §4 | | |
| A4 | Channels & tenant types | WP-01 §5 | | |
| A5 | Out-of-scope list | WP-01 §7 | | |
| A6 | Distribution licensing model decision (D-05) | WP-00 / WP-02 REG-001 | | |
| A7 | Direct-to-insurer payment (no portal premium handling) | WP-02 REG-002 / WP-07 | | |
| A8 | Typing-centre sub-distribution structure | WP-02 REG-006 | | |
| A9 | Affiliate marketing-only scope | WP-02 REG-006 / WP-03 D | | |
| A10 | Journey maps A–E | WP-03 | | |
| A11 | Underwriting decision matrix (STP/REFER/DECLINE) | WP-04 §7 | | |
| A12 | Each UW rule group: UW-1xx / 2xx / 3xx / 4xx / 5xx | WP-04 | | |
| A13 | Rating architecture & quote content | WP-05 | | |
| A14 | Downstream payout table values | WP-05 QR-021 | | |
| A15 | KYC/AML workflow | WP-06 | | |
| A16 | Issuance completion = registration confirmed | WP-07 PAY-022 | | |
| A17 | Referral SLAs | WP-08 REF-010 | | |
| A18 | Permission matrix incl. TEN-002 health-data rule | WP-09 | | |
| A19 | Endorsement catalogue & cancellation/refund rules | WP-10 | | |
| A20 | Report catalogue & bordereau content | WP-11 | | |
| A21 | Metrics dictionary | WP-11 MIS-020 | | |
| A22 | All [INSURER] annex placeholders identified | WP-04/05/07/10 | | |
| A23 | All [COUNSEL]/[VERIFY] items assigned an owner and date | WP-02/04 | | |

## Part B — UAT Scenario Catalogue (rule-traceable)

Each scenario cites the rules it proves. Pass = system behaves exactly as the cited rules state.

**Eligibility & routing**
- U-01 Sharjah-resident with Dubai visa buys → routed to Dubai products (UW-103, WP-01 routing).
- U-02 Visit-visa applicant → declined, category "visa status" (UW-101, J-R4).
- U-03 Invalid EID checksum → blocked (UW-102).
- U-04 New arrival, passport+entry permit, no EID → proceeds; EID endorsement task created (UW-102/KYC-002/END-002a).
- U-05 Duplicate purchase same EID same regime → blocked, routed to endorsement/replacement (UW-105).
- U-06 Backdated start date attempt → hard block (UW-107).

**Federal Basic Scheme**
- U-10 Age 40 domestic worker, clean → STP, no health declaration (UW-201/204/206/208).
- U-11 Age 66 → REFER with medical-report requirement, 3-day SLA (UW-202, REF-010).
- U-12 Declared diabetes on federal scheme → still STP-eligible; condition recorded (UW-205).
- U-13 Freelancer selects federal scheme → routed to alternative product (UW-204).

**Dubai EBP**
- U-20 Salary AED 3,500 employee → EBP track, community-rated, STP (UW-301/304/308).
- U-21 Salary AED 9,000 → enhanced track (UW-301 → UW-5xx).
- U-22 Newborn addition day 25 → endorsement processed; day-20 warning fired (END-002c, REG-024).
- U-23 Married female EBP buyer → maternity terms + waiting notice displayed (UW-306).

**Abu Dhabi**
- U-30 AD-visa employee individual purchase → sponsor-obligation notice + acknowledgement captured (UW-402).
- U-31 Dependent child aged 19 in sponsored-children category → validation rejects category (UW-404).

**Enhanced plans**
- U-40 All declarations "No", age 35, BMI 24 → STP (UW-501/503/504/510).
- U-41 Controlled hypertension on auto-accept list → auto-load applied, premium re-quoted, itemised (UW-502/506, QR-003).
- U-42 Declared cancer history → REFER; insurer declines; customer offered federal Basic alternative (UW-502/508, REF-023).
- U-43 Counter-offer with exclusion → customer accepts via OTP; acceptance stored; payment proceeds (UW-507, REF-021).
- U-44 Counter-offer ignored 8 days → lapsed (REF-022).
- U-45 BMI 38 → REFER (UW-504).

**Screening & compliance**
- U-50 Fuzzy watchlist match → compliance queue, neutral customer message, cleared in 1 day (KYC-012/013, REF-001).
- U-51 Confirmed match → decline + freeze; no tipping-off content (KYC-012).
- U-52 One payer paying for 3 unrelated insureds → EDD triggered (KYC-020, KYC-004).

**Payment, issuance, registration**
- U-60 STP end-to-end: pay on insurer gateway → issued ≤ 15 min → registered → "Active & registered" state → WhatsApp pack delivered (PAY-001/021/022/024).
- U-61 Registration fails → 3 retries → ops ticket → customer "processing" notice → resolved in SLA (PAY-023).
- U-62 Payment window lapses at 49 hours → application back to quoted (PAY-003).
- U-63 Verify portal database contains no card data after U-60 (PAY-001).

**Channels & permissions**
- U-70 Typing centre full assisted sale with consent OTP + declaration OTP artifacts stored (JB-02/06, UW-108).
- U-71 Operator attempts to view a declaration answer → denied and audit-logged (TEN-002/004).
- U-72 Broker A attempts access to Broker B client → denied at data layer (TEN-001).
- U-73 Affiliate link purchase → attribution recorded; affiliate sees conversion, no PII (QR-023, TEN-003).
- U-74 Declined applicant retries via typing centre within 30 days → cooling rule applies (J-R3, REF-023).
- U-75 Suspended tenant → no new business; in-flight completes (TEN-011).

**Lifecycle & money**
- U-80 Cancellation pre-registration → full refund computed and displayed pre-confirmation (END-011).
- U-81 Cancellation of visa-linked policy → warning + acknowledgement captured (END-012).
- U-82 Cancellation triggers commission + payout clawback (QR-022, END-014).
- U-83 Second cancel-refund cycle in year → EDD flag + purchase block (END-015).
- U-84 Renewal at age crossing 65 on federal scheme → renewal runs UW → REFER (END-020, UW-202).
- U-85 Daily three-way match detects a seeded paid-not-issued orphan → exceptions report shows it (PAY-030, MIS-002).
- U-86 Bordereau for a test month ties exactly to policies issued (MIS bordereau, MIS-002).

## Part C — Acceptance Statement

We, the undersigned, accept the documentation suite WP-01 through WP-11 (versions as listed in WP-00) as the agreed business specification for the UAE Policy Sales Portal, subject to closure of the [COUNSEL], [VERIFY] and [INSURER] items per the owners and dates recorded against checklist item A23. Development may commence against accepted items; changes after signature follow the WP-00 Decision Log change process.

| Role | Name | Signature | Date |
|---|---|---|---|
| Business owner | | | |
| Underwriting representative (insurer) | | | |
| Compliance | | | |
| Product/Technology | | | |
