# WP-04 — Underwriting Rules Engine Specification
**Version:** 1.0 (for business review) | **Date:** 12 July 2026
**Depends on:** WP-02, WP-03 | **Feeds:** WP-05, WP-08, WP-12
**Rule ID prefix:** UW-xxx

---

## 1. Design Principles

1. **Rules, not code.** Every rule is written in structured plain English with a unique ID. Business approves rule-by-rule; developers implement rule-by-rule; UAT tests rule-by-rule (WP-12 maps 1:1).
2. **Three-way outcome.** Every application resolves to exactly one of: **STP** (issue without human touch), **REFER** (manual underwriting, WP-08), **DECLINE** (with reason category).
3. **Insurer authority.** The portal's engine performs *pre-underwriting triage* under the partner insurer's delegated guidelines. Referral decisions are made by the insurer's underwriter; the portal routes, tracks and records (WP-01 A-05).
4. **Regime-first.** Rules are grouped: General (all applications), then per regime (Federal Basic / Dubai EBP / Abu Dhabi Basic / Enhanced plans).
5. **Verification placeholders.** Values marked **[INSURER]** are set by the partner insurer's underwriting guidelines and filled into a partner annex on contracting. Values marked **[VERIFY]** must be validated against current regulator publications at implementation.

## 2. General Eligibility Rules (all regimes) — UW-1xx

| ID | Rule | Fail action |
|---|---|---|
| UW-101 | Applicant must hold, or have in process, a UAE residence visa. Visit/tourist visa → not eligible for mandatory-scheme products. | DECLINE (category: visa status) |
| UW-102 | Emirates ID number must pass format/checksum validation; name must match ID within fuzzy-match threshold. New arrivals without EID yet: passport + visa/entry permit accepted, EID number to be endorsed within 30 days of issuance. | REFER if mismatch; DECLINE if invalid |
| UW-103 | Emirate of visa issuance captured and equal to the product regime being purchased (WP-01 routing principle). | Hard block: re-route to correct regime |
| UW-104 | DOB from EID/passport; age computed at proposed policy start date. | — |
| UW-105 | One active in-force policy per person per regime through the portal; duplicate detection on EID number. Buying an upgrade → route to endorsement/replacement flow (WP-10), not new sale. | Block with routing |
| UW-106 | Sanctions/watchlist screening must return clear (WP-06). Potential match → REFER (compliance queue, not underwriting queue). Confirmed match → DECLINE. | Per WP-06 |
| UW-107 | Policy start date: earliest = day after payment + successful registration; latest = 30 days forward. Backdating prohibited. | Hard block |
| UW-108 | Applicant (or consenting customer in assisted journeys) must complete OTP attestation of the application and any declaration (WP-03 JB-06). | Block until attested |

## 3. Federal Basic Health Insurance Scheme — UW-2xx

| ID | Rule | Outcome |
|---|---|---|
| UW-201 | Age 1–64 at start date → age-eligible for standard scheme terms. | Continue |
| UW-202 | Age > 64 → medical disclosure form + recent medical reports (≤ 3 months old) mandatory → always REFER. | REFER |
| UW-203 | Age < 1 → newborn flow: eligible from birth registration; parent's policy/endorsement pathway preferred; standalone infant policy allowed where scheme permits **[VERIFY]**. | Continue/REFER |
| UW-204 | Category must be private-sector employee or domestic worker (scheme population). Self-sponsored/freelancer → offer regime-appropriate alternative product **[INSURER]**. | Route |
| UW-205 | Chronic/pre-existing conditions: scheme provides coverage without waiting period for chronic illness per scheme design **[VERIFY current scheme terms]** → declared chronic conditions do NOT trigger decline; capture for insurer records only. | STP permitted |
| UW-206 | No health declaration required for ages 1–64 standard scheme sale (scheme design point **[VERIFY]** — if partner insurer requires short-form declaration, insert as UW-206a per annex). | STP |
| UW-207 | Occupation capture: standard occupations STP; occupations on insurer's restricted list **[INSURER]** → REFER. | STP/REFER |
| UW-208 | STP conditions (all true): UW-101–108 pass, UW-201, UW-204, UW-207 standard. | **STP** |

## 4. Dubai — EBP — UW-3xx

| ID | Rule | Outcome |
|---|---|---|
| UW-301 | EBP population: employees within the DHA lower-salary band (salary ≤ AED 4,000/month) **[VERIFY current DHA banding]** and eligible dependent categories per DHA rules. Above band → enhanced plan track (UW-5xx). | Route |
| UW-302 | Salary band captured by attestation (self/employer letter); false attestation consequences disclosed. | — |
| UW-303 | Insurer must be DHA-participating for EBP (REG-021) — product availability flag, not per-application rule. | Config |
| UW-304 | EBP is community-rated within DHA-published premium ranges; no individual medical rating on the base EBP → health declaration NOT required for EBP base **[VERIFY partner practice]**. | STP |
| UW-305 | Pre-existing conditions on EBP: covered subject to DHA EBP terms (historically excluded first 6 months for new-to-UAE entrants, covered thereafter) **[VERIFY current terms]** → declared conditions never decline; waiting-period notice displayed. | STP + notice |
| UW-306 | Maternity: EBP includes maternity benefits per DHA schedule; married female applicants shown maternity terms and waiting period notice **[VERIFY]**. | STP + notice |
| UW-307 | Dependents: sponsor (often the employee) responsible for dependents in Dubai; each dependent is a separate insured life run through UW-1xx; newborn must be added within 30 days of birth (REG-024). | Per life |
| UW-308 | STP conditions: UW-1xx pass + UW-301 in-band + UW-304. | **STP** |

## 5. Abu Dhabi — Basic Plan — UW-4xx

| ID | Rule | Outcome |
|---|---|---|
| UW-401 | Basic Plan population per DoH criteria (non-managerial band, salary threshold **[VERIFY current DoH threshold]**). Above → enhanced track. | Route |
| UW-402 | Sponsor-obligation check: an AD-visa employee's employer must also cover spouse + up to 3 children under 18 (REG-030). If applicant is buying individually while employed, display sponsor-obligation notice and capture acknowledgement; individual purchase allowed for categories outside employer obligation **[COUNSEL/VERIFY]**. | Notice/route |
| UW-403 | Basic Plan community-rated per DoH; no medical rating on base plan **[VERIFY]**. | STP |
| UW-404 | Dependents each screened as separate lives (UW-1xx); child age < 18 validation for the sponsored-children category. | Per life |
| UW-405 | STP conditions: UW-1xx + UW-401 in-band + UW-403. | **STP** |

## 6. Enhanced Individual Plans (all emirates) — UW-5xx

Enhanced plans are medically underwritten. Short-form declaration always required; positive answers escalate to full MAF.

**Short-form declaration (D1–D8):** hospitalisation/surgery last 5 years; ongoing medication; diabetes/hypertension/cardiac/cancer/kidney/liver history; planned treatment; pregnancy (self); BMI outside 17–35; previous insurance declined/loaded; disability/congenital condition.

| ID | Rule | Outcome |
|---|---|---|
| UW-501 | All D1–D8 = No → clean case. | Continue |
| UW-502 | Any D1–D8 = Yes → full MAF; case → REFER unless condition is on the insurer's auto-accept list **[INSURER]** (e.g., controlled hypertension single-medication → auto-load X% **[INSURER]**). | REFER / auto-load |
| UW-503 | Age bands: 0–17 require adult proposer; 18–60 standard; 61–65 REFER **[INSURER]**; > 65 REFER always. | Per band |
| UW-504 | BMI 17–35 standard; outside → REFER. | REFER |
| UW-505 | Pregnancy declared → maternity waiting-period rules **[INSURER]**; current pregnancy typically excluded from new individual policy → notice + optional REFER. | Notice/REFER |
| UW-506 | Loadings: engine applies insurer-configured loading table (condition → % or flat); cumulative loading > cap **[INSURER, e.g., 100%]** → REFER. | Auto/REFER |
| UW-507 | Exclusion endorsements: insurer-configured condition-specific exclusions offered as counter-offer via WP-08 flow; customer must positively accept before payment. | Counter-offer |
| UW-508 | Declared condition on insurer decline list **[INSURER]** → DECLINE (category: medical). | DECLINE |
| UW-509 | Non-disclosure control: post-issuance claim-stage findings are insurer's remit; portal stores declaration + OTP attestation as evidence record (retention per REG-041/007). | Evidence |
| UW-510 | STP conditions: UW-1xx + UW-501 + UW-503 standard band + UW-504 in range. | **STP** |

## 7. Decision Matrix Summary

| Trigger | Outcome |
|---|---|
| All applicable STP conditions met | **STP** — proceed to payment |
| Age > 64 (Federal) / > 65 (Enhanced) / 61–65 enhanced band | **REFER** |
| Any positive declaration not auto-acceptable | **REFER** |
| Restricted occupation | **REFER** |
| Potential sanctions match | **REFER (compliance)** |
| Identity mismatch (fuzzy) | **REFER** |
| Invalid EID / visit visa for mandatory product / confirmed sanctions match / decline-list condition | **DECLINE** |
| Wrong regime / duplicate policy / backdating | **Hard block with routing** |

## 8. Referral SLAs (detail in WP-08)
Standard referral: insurer decision within 1 business day. Medical-report cases: 3 business days. Compliance referrals: 1 business day. Customer notified at creation and decision via WhatsApp.

## 9. Business Acceptance Notes
- Every **[INSURER]** placeholder becomes a numbered annex per partner (Annex UW-A for Partner 1, etc.).
- Every **[VERIFY]** must be checked against current DHA/DoH/MOHRE publications during implementation — regulator parameters (salary bands, waiting periods) change without notice.
- The business department signs Section 7's matrix as the canonical triage policy.
