# WP-06 — KYC, AML & Sanctions Screening Workflow
**Version:** 1.0 (for business review) | **Date:** 12 July 2026
**Depends on:** WP-02 | **Feeds:** WP-04 (UW-106), WP-07, WP-12
**Rule ID prefix:** KYC-xxx

---

## 1. Risk Positioning

Individual medical insurance is a lower AML-risk product (no surrender value, no investment element, premium sizes small). The programme is therefore risk-based and lightweight at point of sale, with the heavy obligations sitting in screening, records and escalation. The licensed entity owns the AML programme; the portal implements its front-line controls.

## 2. Identity Verification (KYC)
- **KYC-001.** Primary identity = Emirates ID, validated in real time against the **ICP Validation Gateway** (genuine card, active status, data match on number/name/DOB/nationality). Capture methods: chip read via ICP EID SDK at card-reader-equipped desks (highest assurance), else OCR/manual entry — but the ICP validation result, not the capture method, is the authoritative control. ICP fail/expired/mismatch → identity REFER; OCR-only data is never sufficient for issuance. Photo-of-ID stored. Liveness not required for this product class at these premium values (risk-based).
- **KYC-001a.** Federal Basic Scheme category check: applicant's private-sector-employee / domestic-worker status validated via **MOHRE work-permit data** (WP-13 INT-G3) rather than self-declaration alone; validation failure → REFER (eligibility), not automatic decline (data lag cases exist).
- **KYC-002.** New arrivals without EID: passport + visa/entry permit accepted; EID captured by endorsement within 30 days (UW-102 alignment).
- **KYC-003.** Assisted journeys: the customer is the data subject and applicant of record; operator/broker identity is separately logged per transaction (who keyed the application). OTP to the customer's own mobile is the applicant-presence control (WP-03 JB-02/JB-06).
- **KYC-004.** Payer ≠ insured (e.g., employer or relative pays): capture payer name + relationship; payment happens on insurer rails (REG-002) so card-level controls are the insurer's; portal records the relationship declaration. Corporate payer for multiple unrelated individuals → escalation flag (possible unlicensed group intermediation).

## 3. Sanctions & Watchlist Screening
- **KYC-010.** Screening lists: UN Consolidated List + UAE Local Terrorist List, ingested via automated feed from the Executive Office (EOCN) subscription (WP-13 INT-G4) so list updates apply same-day; screening engine per licensed entity's vendor. Screen: applicant + each dependent life + payer name if different. The licensed entity must be registered on **goAML** before go-live (STR filing channel, KYC-031).
- **KYC-011.** Screening points: at application (pre-quote gate acceptable at S4), pre-issuance re-check if > 7 days elapsed, and ongoing batch re-screening of in-force book on list updates.
- **KYC-012.** Match handling: fuzzy potential match → **compliance REFER** (not underwriting queue); compliance officer disposition within 1 business day; confirmed match → DECLINE + freeze + STR consideration via goAML (REG-042); false positive → whitelist note to suppress repeat friction.
- **KYC-013.** Customer messaging on screening holds uses the neutral category "additional verification required" — no tipping-off content.

## 4. Enhanced Due Diligence Triggers
- **KYC-020.** EDD triggers: PEP indication; payer unrelated third party paying for ≥ 3 unrelated insureds; nationality/geography flags per the licensed entity's risk policy; repeated purchase-cancel-refund patterns (see WP-10 refund abuse rule).
- **KYC-021.** EDD content: source-of-funds question set + senior compliance approval before issuance.

## 5. Records & Reporting
- **KYC-030.** Retention: identity records, screening results, declarations, consents — 10 years (stricter of REG-007/REG-041), hosted in UAE (REG-051).
- **KYC-031.** STR/SAR: front-line staff and tenant operators have a "raise concern" action; concerns route to compliance officer; filing via goAML is the licensed entity's duty; tenants are trained never to tip off.
- **KYC-032.** Annual AML training attestation is a tenant-activation requirement for typing centres and brokers (WP-09 onboarding gate).
