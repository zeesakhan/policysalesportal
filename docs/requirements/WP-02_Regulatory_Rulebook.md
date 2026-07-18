# WP-02 — Regulatory & Compliance Rulebook
**Version:** 1.0 (for business review) | **Date:** 12 July 2026
**Depends on:** WP-01 | **Feeds:** WP-04, WP-05, WP-06, WP-07
**Rule ID prefix:** REG-xxx

---

## 1. Purpose

This rulebook converts the UAE regulatory landscape into numbered, testable obligations that the portal's journeys and rules engine must satisfy. Each rule carries an ID for business sign-off and UAT traceability (WP-12). Legal counsel must validate rules marked **[COUNSEL]** before launch.

## 2. Distribution Licensing — The Governing Constraint

The CBUAE Insurance Brokerage Regulation (issued 25 July 2024, effective 15 February 2025, under Decretal Federal Law No. 48 of 2023 and now the consolidated Federal Decree-Law No. 6 of 2025) fundamentally shapes the portal's legal model:

- **REG-001.** "Insurance Brokerage" is defined as soliciting, negotiating, or selling insurance contracts. The portal *sells* policies; therefore the portal's operating entity performs insurance brokerage and cannot operate as an unlicensed "referral" or "introducer" platform. The pre-2025 referral/affiliate grey area has been deliberately closed by the regulator. **[COUNSEL]** The viable models are: (a) obtain a CBUAE insurance broker licence; (b) operate the platform as a technology service provider *to* a licensed broker (white-label); or (c) operate as the appointed distribution technology of the insurer itself (insurer's own e-sales channel, subject to the insurer's CBUAE e-sales approvals). Decision D-05 in WP-00 records the chosen model.
- **REG-002.** Premium collection is the insurer's responsibility. Brokers are prohibited from collecting premiums for any line of business. **Consequence for the portal:** the payment step in every journey must route funds directly to the insurer (insurer's payment gateway or insurer-owned merchant account). The portal never holds premium money. This closes the "premium collection model" open decision: **direct-to-insurer is the only compliant design.**
- **REG-003.** Only the insurance company may issue policies, amendments and endorsements. The portal *requests* issuance via insurer integration/API; the policy document is the insurer's document. Portal-generated documents are quotes, applications and receipts only.
- **REG-004.** Commission is paid by the insurer to the licensed broker within 10 business days of premium receipt (proportionally for instalments). Downstream payouts (typing centres, affiliates) are paid by the portal/broker entity from its own commission and are a private commercial matter — but see REG-005.
- **REG-005.** Brokers may not discount from their own commission; customer discounts must come from the insurer under its underwriting guidelines. WP-05 discount logic must therefore only implement insurer-configured discounts.
- **REG-006.** Sub-distribution actors (typing centres, street affiliates) must not themselves perform "soliciting, negotiating or selling" as independent unlicensed actors. **[COUNSEL]** Structure them as: (a) employees/appointed representatives of the licensed entity, or (b) pure marketing affiliates whose role ends at delivering a link/code (no advice, no quote presentation, no data capture). The assisted typing-centre journey (WP-03 Journey B) requires model (a) or explicit regulatory comfort.
- **REG-007.** Broker data must be stored within the UAE with backup retained for a minimum of 10 years; material activities may not be outsourced outside the UAE, and material outsourcing requires CBUAE no-objection. **Consequence:** hosting region = UAE; this is an architecture constraint to record in the technical documentation later.

## 3. Health Insurance Product Regulation by Regime

### 3.1 Federal Basic Health Insurance Scheme (Northern Emirates focus)
- **REG-010.** Mandatory coverage applies to private-sector employees and domestic workers in all emirates since 1 January 2025, enforced at residence-permit issuance/renewal via MOHRE/ICP. Existing employees are captured at first permit renewal.
- **REG-011.** The scheme product may be sold only by insurers approved as scheme suppliers. Partner insurer must be verified as an approved supplier before the product is listed.
- **REG-012.** Standard eligibility ages 1–64; applicants over 64 require a medical disclosure form and recent medical reports → mandatory manual underwriting referral (feeds UW rules in WP-04).
- **REG-013.** Policy activation must be reflected to the federal systems such that ICP/GDRFA visa processing recognises the coverage. Issuance is complete only after successful registration; the journey must confirm registration status to the customer.

### 3.2 Dubai — DHA / EBP
- **REG-020.** Dubai Law No. 11 of 2013 governs; every Dubai-visa resident must hold a policy from a DHA-permitted insurer meeting at least EBP benefits; minimum annual limit AED 150,000.
- **REG-021.** EBP may only be issued by DHA participating insurers. Partner insurer's participating status must be verified and recorded.
- **REG-022.** Policy data must be registered on DHA systems (ISAHD/UMIS) for visa recognition; e-claims run via eClaimLink under DHA Directive PD-05-2025 (insurer/TPA responsibility, but portal must capture member data to the standard the insurer needs for upload).
- **REG-023.** Employers may not deduct EBP premium from employee salary; where the buyer indicates the employer is paying via reimbursement deduction, the portal must not facilitate salary-deduction arrangements. Informational notice required in journey.
- **REG-024.** Newborns must be insured within 30 days of birth (drives an endorsement SLA in WP-10).
- **REG-025.** Intermediaries distributing health insurance in Dubai require the applicable DHA permit in addition to CBUAE licensing. **[COUNSEL]** Verify current DHA intermediary permit requirements for the chosen legal model.

### 3.3 Abu Dhabi — DoH Basic Plan
- **REG-030.** Abu Dhabi framework (Law No. 23 of 2005 and DoH policy) requires employer/sponsor coverage of the employee **plus spouse and up to three children under 18**. The journey for an Abu Dhabi-visa employee purchasing individually must detect and explain sponsor obligations; the dependent-capture flow differs from Dubai.
- **REG-031.** Basic Plan issuance restricted to DoH-authorised insurers; verify partner status.
- **REG-032.** Policy registration with DoH systems required for visa recognition; same completion principle as REG-013.

## 4. AML/CFT & Sanctions (summary — full workflow in WP-06)
- **REG-040.** UAE AML framework (Federal Decree-Law No. 20 of 2018 as amended; Cabinet Decision No. 10 of 2019) applies to insurance operations. Health/general lines are lower risk than life/investment, but sanctions screening of policyholders against UAE Local Terrorist List and UN Consolidated List is mandatory before issuance, with ongoing screening during the policy term.
- **REG-041.** Records of identification and transactions retained minimum 5 years (10 years for broker records per REG-007 — apply the stricter).
- **REG-042.** Suspicious transaction reporting via goAML applies to the licensed entity; front-line escalation path must exist in the portal's back office.

## 5. Data Protection
- **REG-050.** UAE PDPL (Federal Decree-Law No. 45 of 2021): lawful basis, purpose limitation, data subject rights, breach notification. Health declarations are sensitive data — explicit consent capture required at MAF step.
- **REG-051.** Federal Law No. 2 of 2019 (health data ICT): health data originating in the UAE must remain hosted in the UAE unless an exception applies. Combined with REG-007 → **all portal data hosted in-country.**
- **REG-052.** Tenant data segregation: no channel tenant may access another tenant's customers; health declaration content visible only to the licensed entity's authorised underwriting-liaison role and the insurer (WP-09 enforces).

## 6. Consumer Protection & Conduct
- **REG-060.** Quotes must state: insurer name, plan name, benefits summary, exclusions, network tier, premium incl. VAT and all fees, and the licensed entity's name and licence number.
- **REG-061.** Arabic must be available for policy-facing documents; customer-facing journey minimum languages per WP-01 §4.
- **REG-062.** VAT at 5% applies to premiums and to commissions; tax invoices must meet FTA requirements (feeds WP-07).
- **REG-063.** Cooling-off/cancellation terms per insurer product terms must be disclosed pre-payment (feeds WP-10).
- **REG-064.** Marketing content (including TikTok) must not be misleading; product claims must match filed product terms; affiliates may share only approved creative (feeds WP-09 affiliate constraints).

## 7. Rule-to-WP Traceability

| Rules | Consumed by |
|---|---|
| REG-001–007 | WP-05, WP-07, WP-09, legal model decision |
| REG-010–032 | WP-03 routing, WP-04 eligibility, WP-07 issuance |
| REG-040–042 | WP-06 |
| REG-050–052 | WP-06, WP-09 |
| REG-060–064 | WP-03, WP-05, WP-07, WP-10 |

## 8. Open Items for Counsel
1. Confirm chosen licensing model (REG-001) and DHA/DoH intermediary permits (REG-025).
2. Confirm typing-centre sub-distribution structure (REG-006).
3. Confirm affiliate scope limits (marketing-only) satisfy the brokerage definition carve-out (REG-006).
