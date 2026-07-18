# WP-00 — Master Index, Decision Log & Progress Tracker
**Project:** UAE Policy Sales Portal — Journey & Underwriting Rules Documentation
**Owner:** Zeeshan (InfoVerism)
**Version:** 0.2 | **Last updated:** 12 July 2026
**Purpose:** Single source of truth for documentation progress. If a working session is interrupted, paste this document into a new session and resume from the first work package marked "Not started" or "In progress".

---

## 1. How to Use This Document (Resume Protocol)

1. This tracker is updated at the end of every working session.
2. Each Work Package (WP) is self-contained and sized to complete in a single session.
3. To resume work: provide this document plus the last completed WP to the assistant, state which WP is next, and continue.
4. All scope decisions are recorded in the Decision Log (Section 4). Never re-litigate a logged decision without a new decision entry superseding it.

---

## 2. Documentation Suite Index

| WP | Title | Depends on | Status | Version |
|----|-------|-----------|--------|---------|
| WP-00 | Master Index, Decision Log & Tracker | — | **Living document** | 0.2 |
| WP-01 | Business Context & Scope | WP-00 | **Complete — pending review** | 1.0 |
| WP-02 | Regulatory & Compliance Rulebook | WP-01 | **Complete — pending review** | 1.0 |
| WP-03 | Customer Journey Maps (per channel) | WP-01 | **Complete — pending review** | 1.0 |
| WP-04 | Underwriting Rules Engine Specification | WP-02, WP-03 | **Complete — pending review** | 1.0 |
| WP-05 | Quotation & Rating Rules | WP-04 | **Complete — pending review** | 1.0 |
| WP-06 | KYC, AML & Sanctions Screening Workflow | WP-02 | **Complete — pending review** | 1.0 |
| WP-07 | Payment, Invoicing & Policy Issuance Rules | WP-04, WP-06 | **Complete — pending review** | 1.0 |
| WP-08 | Exceptions, Referrals & Manual Underwriting Workflow | WP-04 | **Complete — pending review** | 1.0 |
| WP-09 | Multi-Tenant Roles & Permissions Matrix | WP-03 | **Complete — pending review** | 1.0 |
| WP-10 | Endorsements, Cancellations & Refunds Rules | WP-07 | **Complete — pending review** | 1.0 |
| WP-11 | MIS, Reporting & Bordereaux | WP-07 | **Complete — pending review** | 1.0 |
| WP-12 | Business Acceptance Pack (sign-off checklist + UAT scenarios) | All | **Complete — pending review** | 1.0 |
| WP-13 | Portal Functional Specification (screens, inputs, portal segregation, integrations) | WP-03, WP-04, WP-05, WP-09 | **Complete — pending review** | 1.0 |

**Recommended production order:** 01 → 02 → 03 → 04 → 05 → 08 → 06 → 07 → 09 → 10 → 11 → 12.
Rationale: WP-04 (underwriting rules) is the heart of the business review; get it in front of the business department early, in draft, while operational WPs are still being produced.

---

## 3. Work Package Definitions (Scope Boundaries)

**WP-01 — Business Context & Scope.** Products in scope, distribution channels and tenant types, target customer segments, regulatory perimeter, explicit out-of-scope list, assumptions, and open business decisions. This is the anchoring document all others inherit from.

**WP-02 — Regulatory & Compliance Rulebook.** Emirate-by-emirate mandatory insurance obligations, e-policy issuance and regulator platform requirements (ISAHD/UMIS, DoH systems, MOHRE/ICP linkage), distribution licensing constraints (broker vs referral/affiliate under CBUAE), KYC/AML/sanctions obligations, VAT treatment of premiums and commissions, data protection (PDPL) obligations for health data.

**WP-03 — Customer Journey Maps.** One journey per channel: (a) direct customer / TikTok inbound, (b) typing centre operator on behalf of a walk-in worker, (c) broker portal user, (d) affiliate/referral code flow. Each map covers: entry → data capture → quote → underwriting decision → payment → issuance → post-sale servicing, with every system decision point and human handoff marked.

**WP-04 — Underwriting Rules Engine Specification.** Per product regime (Federal Basic Scheme, DHA EBP, DoH Basic Plan, enhanced plans): eligibility rules (age bands, visa status, emirate of residence/visa, Emirates ID validation, salary band where applicable), medical declaration / MAF trigger rules, dependent and sponsor rules, pre-existing and chronic condition handling, waiting periods, loadings and exclusions, and the three-way decision matrix: straight-through processing (STP) / refer to underwriter / decline. Every rule written in structured plain English with a unique rule ID (UW-xxx) so business can approve rule-by-rule and developers can implement rule-by-rule.

**WP-05 — Quotation & Rating Rules.** Rating dimensions (age, plan, network tier, co-pay options, maternity, region), premium table structure, taxes and fees, discount and promo logic, commission and affiliate payout calculation, quote validity and re-quote rules.

**WP-06 — KYC, AML & Sanctions Screening.** Identity verification flow (Emirates ID / passport / visa), sanctions and PEP screening points, thresholds for enhanced due diligence, record-keeping requirements, tenant-level responsibilities.

**WP-07 — Payment, Invoicing & Policy Issuance.** Accepted payment methods per channel, premium collection model (who holds the money — critical for licensing), tax invoice rules, policy schedule and e-card generation, regulator upload/registration steps, delivery to customer (WhatsApp/email/print at typing centre).

**WP-08 — Exceptions, Referrals & Manual Underwriting.** Queue design, SLA per referral type, underwriter decision recording, counter-offer flow (loading/exclusion acceptance by customer), audit trail requirements.

**WP-09 — Multi-Tenant Roles & Permissions.** Tenant types (portal admin, insurer/TPA user, broker, typing centre, affiliate), role matrix, data segregation rules, what each tenant may see of customer PII and health data.

**WP-10 — Endorsements, Cancellations & Refunds.** Mid-term changes, cancellation reasons and pro-rata/short-rate refund rules, regulator notification on cancellation, visa-linkage implications of cancelling a mandatory policy.

**WP-11 — MIS, Reporting & Bordereaux.** Sales and commission reports per tenant, insurer/TPA bordereaux content and frequency, regulatory reporting hooks, reconciliation reports.

**WP-12 — Business Acceptance Pack.** Consolidated sign-off checklist mapping every rule ID and journey step to an approval line; UAT scenario catalogue derived one-to-one from WP-04 rules; acceptance criteria; sign-off page for business department.

---

## 4. Decision Log

| # | Date | Decision | Rationale / Notes |
|---|------|----------|-------------------|
| D-01 | 12 Jul 2026 | v1 product scope = **individual medical insurance only**. Motor, life and other lines deferred. | Aligns with blue-collar target segment and mandatory-insurance demand driver. |
| D-02 | 12 Jul 2026 | Market scope = **all UAE**: Dubai (DHA/EBP), Abu Dhabi (DoH/Basic Plan), Northern Emirates + federal Basic Health Insurance Scheme (MOHRE/MoHAP/ICP). | Rules engine must support three regulatory regimes from day one; journey must route by emirate of visa issuance. |
| D-03 | 12 Jul 2026 | Documentation-first approach: no code until business department accepts WP-01 through WP-12 (or an agreed subset). | Explicit instruction from product owner. |
| D-04 | 12 Jul 2026 | Every underwriting rule gets a unique ID (UW-xxx) and is written in structured plain English for business sign-off and later implementation. | Enables rule-by-rule acceptance and traceable UAT. |
| D-05 | 12 Jul 2026 | **Premium collection model RESOLVED by regulation:** CBUAE Insurance Brokerage Regulation (effective 15 Feb 2025) prohibits brokers from collecting premiums for any line of business; premiums flow directly from policyholder to insurer. Portal design = direct-to-insurer payment rails only; portal never holds funds. | WP-02 REG-002, WP-07 PAY-001. |
| D-06 | 12 Jul 2026 | **Referral/introducer model is NOT viable:** the same Regulation defines "Insurance Brokerage" as soliciting, negotiating or selling insurance, deliberately closing the referral grey area. Viable structures: (a) own CBUAE broker licence, (b) white-label technology provider to a licensed broker, (c) insurer's own appointed e-sales channel. | WP-02 REG-001. Choice among (a)/(b)/(c) remains OPEN — see below. |
| **OPEN** | — | **Licensing structure choice** among (a) own broker licence / (b) platform-to-licensed-broker / (c) insurer e-sales channel, plus DHA/DoH intermediary permits. | **[COUNSEL]** — blocks launch, not documentation. WP-02 §8. |
| **OPEN** | — | **Insurer/TPA partner(s):** affects all [INSURER] annex placeholders in WP-04/05/07/10/11. | Generic rules complete; partner annexes on contracting. |
| **OPEN** | — | **Downstream payout table values** (broker %, typing centre amount, affiliate amount). | Business decision — WP-05 QR-021, sign-off item A14. |

---

## 5. Session Log

| Session | Date | Work done | Next action |
|---------|------|-----------|-------------|
| 1 | 12 Jul 2026 | Suite structure defined; scope decisions D-01–D-04 taken; WP-00 and WP-01 drafted; current regulatory state verified (federal mandate live since 1 Jan 2025; Federal Decree-Law 6/2025 in force since 16 Sep 2025). | Produce WP-02. |
| 2 | 12 Jul 2026 | CBUAE Insurance Brokerage Regulation analysed → decisions D-05/D-06 recorded. Full suite produced: WP-02 through WP-12 all at v1.0. All [COUNSEL], [VERIFY], [INSURER] placeholders catalogued; sign-off checklist and 40+ rule-traceable UAT scenarios in WP-12. | Zeeshan review → counsel session on licensing structure → business department review meeting → sign WP-12 Part A. |
| 3 | 12 Jul 2026 | WP-13 produced: screen-by-screen functional spec (SC/TC/BR/IN/AD screens with field-level inputs and rationale), quote-generation timing per product type, plan/rate/discount configuration screens, cross-portal user management, and integration verdict table (direct ICP/MOHRE integration excluded with rationale — discharged via insurer). | Add WP-13 items to WP-12 checklist at next revision; business review of full suite. |
| 4 | 12 Jul 2026 | **Correction (Zeeshan):** government integrations ARE required in v1. WP-13 §7.1 rewritten: ICP Validation Gateway (real-time EID validation at SC-03/SC-05), ICP EID SDK + card readers at typing centres, MOHRE work-permit validation for federal-scheme category, EOCN list feed + goAML. WP-06 KYC-001/001a/010 updated accordingly. New action: **start ICP cooperation-contract onboarding early — lead time gates launch.** Registration to DHA/DoH/federal platforms remains via insurer credentials unless licensing structure grants direct access. | Add ICP/MOHRE/goAML onboarding to launch-dependency list; WP-12 checklist revision to include WP-13 + government integrations. |

---

## 6. Glossary (grows with the suite)

- **EBP** — Essential Benefits Plan (Dubai, DHA-mandated minimum plan for lower-income employees).
- **Federal Basic Scheme** — Basic Health Insurance package introduced by MOHRE/MoHAP/ICP, effective 1 Jan 2025, nationwide for private-sector employees and domestic workers; entry price ~AED 320/year.
- **ISAHD / UMIS** — Dubai's health insurance compliance and unified medical insurance platforms (DHA).
- **MAF** — Medical Application Form (health declaration triggering manual underwriting).
- **STP** — Straight-through processing (policy issued with no human underwriting touch).
- **PDPL** — UAE Federal Personal Data Protection Law.
- **Bordereau** — Periodic statement of policies sold/premiums collected, sent to the insurer/TPA.
