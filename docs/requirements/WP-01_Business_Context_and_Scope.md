# WP-01 — Business Context & Scope
**Project:** UAE Policy Sales Portal — Journey & Underwriting Rules Documentation
**Version:** 1.0 (for business review) | **Date:** 12 July 2026
**Status:** Complete — pending business department review
**Depends on:** WP-00 | **Feeds:** all subsequent work packages

---

## 1. Purpose of This Document

This document fixes the business context within which every journey step and underwriting rule in the rest of the suite is written. It answers: what we sell, to whom, through whom, under which regulators, and what is deliberately excluded from version 1. Once the business department accepts this document, its scope statements become binding on WP-02 through WP-12; any change requires a Decision Log entry in WP-00.

## 2. Business Model Summary

The portal is a multi-tenant digital distribution platform for individual medical insurance in the UAE. The portal does not carry insurance risk. Risk sits with partner insurer(s); claims administration may sit with a partner TPA. The portal's revenue is commission (indicatively 5–10% of premium) on policies sold through it, shared downstream with channel partners (brokers, typing centres, affiliates) according to the commission rules defined in WP-05.

The demand driver is regulatory: since 1 January 2025, health insurance is mandatory for private-sector employees and domestic workers in all seven emirates, enforced at residence-visa issuance and renewal through MOHRE/ICP systems. This created, for the first time, a nationwide population of buyers — concentrated in the Northern Emirates — who must purchase a compliant policy and who previously had none. The portal is built to serve exactly this buyer: price-sensitive, often first-time insurance purchasers, frequently transacting through an intermediary (typing centre, community seller) rather than directly online.

## 3. Product Scope (v1)

Individual medical insurance only. Three regulatory product regimes must be supported, because the compliant minimum product differs by the emirate that issues the customer's residence visa:

**3.1 Federal Basic Health Insurance Scheme (Northern Emirates + nationwide option).**
Introduced by MOHRE in coordination with MoHAP and ICP, effective 1 January 2025. Entry-level product priced from approximately AED 320/year, designed for private-sector employees and domestic workers. Standard eligibility covers ages 1–64; applicants over 64 require a medical disclosure and recent medical reports (a manual-underwriting trigger the rules engine must model). Network-restricted; non-network treatment covered in emergencies only. This is expected to be the volume product for the portal's Phase 1 (Northern Emirates blue-collar segment).

**3.2 Dubai — Essential Benefits Plan (EBP) under DHA.**
Governed by Dubai Law No. 11 of 2013 and DHA implementing resolutions. Minimum annual benefit limit AED 150,000. EBP premiums start around AED 635/year and only DHA-approved (participating) insurers may issue EBP. Employers may not deduct the premium from employee salaries. Policy issuance and compliance run through DHA platforms (ISAHD/UMIS); claims run electronically through eClaimLink under DHA Directive PD-05-2025. Newborns must be added to a policy within 30 days of birth.

**3.3 Abu Dhabi — Basic Plan under DoH.**
Governed by the Abu Dhabi health insurance framework (Law No. 23 of 2005 and DoH policy). Distinctive obligation: the employer/sponsor must also cover the employee's spouse and up to three children under 18 — the most expansive dependent obligation in the UAE, which materially changes the dependent-capture and eligibility logic for Abu Dhabi-visa customers.

**3.4 Enhanced individual plans (all emirates).**
Above-minimum plans (wider networks, dental/optical, maternity options) offered by the partner insurer(s) as upsell to the compliant minimum. Underwriting for enhanced plans is stricter (health declarations, loadings, exclusions) and is specified separately in WP-04.

**Routing principle (binding on WP-03 and WP-04):** the customer's *emirate of visa issuance* — not emirate of physical residence — determines the applicable regime and therefore the product set, eligibility rules and issuance platform. This is the first branching decision in every journey.

## 4. Target Customer Segments

**Phase 1:** Blue-collar and low-income private-sector workers and domestic workers, concentrated in the Northern Emirates (Sharjah, Ajman, Umm Al Quwain, Ras Al Khaimah, Fujairah), typically buying the federal Basic Scheme or emirate minimum plan; often transacting via intermediaries; often limited English/Arabic literacy — journeys must assume assisted purchase and multilingual output (minimum: English, Urdu/Hindi, Bengali; Arabic for documents).

**Phase 2:** Dubai, Abu Dhabi and Al Ain individual buyers — self-sponsored residents, dependents' sponsors, freelancers, small-business owners buying for themselves.

**Phase 3 (out of scope for this suite):** SME group schemes.

## 5. Distribution Channels & Tenant Types

| Channel | Who operates the portal session | Notes for journey design |
|---|---|---|
| Direct / TikTok inbound | Customer on own device | Fully self-service journey, mobile-first, multilingual |
| Typing centre | Typing centre operator on behalf of a walk-in worker | Assisted journey; operator captures documents; print/WhatsApp delivery of policy |
| Broker | Licensed broker staff | Broker brings own client; broker-grade quote comparison and commission visibility |
| Affiliate / street seller | Customer via referral code/link | Attribution and payout only; affiliate never handles customer data or money |
| Insurer/TPA | Partner staff | Oversight: referral queue, bordereaux, product/rate management |

These five tenant types are the basis of the permissions matrix in WP-09.

## 6. Regulatory Perimeter

The portal operates inside four regulatory frames, all of which generate rules in WP-02:

1. **CBUAE — insurance conduct and licensing.** Federal Decree-Law No. 6 of 2025 (in force 16 September 2025) consolidates regulation of insurers, brokers, TPAs and other intermediaries under the Central Bank. The portal's own legal role (broker licence vs referral arrangement vs agency of the insurer) is an **open decision (WP-00 Decision Log)** and is the single largest regulatory dependency of the project: it determines who may quote, who may collect premium, and how commissions may flow.
2. **Health regulators — product and issuance.** DHA (Dubai: ISAHD/UMIS, eClaimLink, EBP rules), DoH (Abu Dhabi), MoHAP/EHS with MOHRE and ICP (federal scheme, Northern Emirates). Policy data must reach the relevant regulator platform for the visa system to recognise coverage — issuance is not complete until this registration succeeds, which is a hard journey step, not an afterthought.
3. **AML/CFT and sanctions.** Insurance distribution is subject to UAE AML law; screening obligations and record-keeping are specified in WP-06.
4. **Data protection.** UAE PDPL plus health-data handling expectations (and emirate health-data rules where applicable). Health declarations are sensitive data; tenant access to them is restricted by design (WP-09).

## 7. Out of Scope (v1)

- Motor, life, travel and any non-medical line.
- SME/group medical schemes.
- Claims processing (portal hands off to insurer/TPA; portal only surfaces claim status if the partner exposes it).
- Emirati-national schemes (Thiqa, Enaya, Saada) — the portal serves expatriate residents.
- Direct integration with employer payroll systems.

## 8. Key Assumptions (to be validated in business review)

- A-01: At least one partner insurer authorised for the federal Basic Scheme and one DHA-participating insurer for EBP will be contracted before launch.
- A-02: The portal's legal distribution model will be confirmed by counsel before WP-02 is finalised; documentation proceeds in parallel using rule placeholders where the model matters.
- A-03: The typing-centre channel operates under the portal's legal umbrella (sub-distribution), not as independent intermediaries.
- A-04: Premium payment at typing centres will be electronic (card/payment link); cash handling is excluded unless the business explicitly decides otherwise (Decision Log entry required).
- A-05: Underwriting authority for referrals sits with the partner insurer; the portal routes and tracks referrals but does not make risk decisions.

## 9. Open Decisions Required From the Business Department

1. Distribution licensing model (broker / referral / agency) — blocks final WP-02.
2. Insurer/TPA partner selection — blocks partner-specific annexes in WP-04/WP-05.
3. Premium collection model — blocks WP-07.
4. Confirmation of Phase 1 language set for customer-facing output.
5. Confirmation that enhanced plans are in v1 or deferred (affects WP-04 size significantly).

## 10. Acceptance

Business department acceptance of this document means agreement with: product scope (§3), segments (§4), channels (§5), regulatory perimeter (§6), exclusions (§7) and assumptions (§8), and commitment to resolve §9 decisions. Sign-off is recorded in WP-12.
