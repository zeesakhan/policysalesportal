# WP-08 — Exceptions, Referrals & Manual Underwriting Workflow
**Version:** 1.0 (for business review) | **Date:** 12 July 2026
**Depends on:** WP-04 | **Feeds:** WP-09, WP-12
**Rule ID prefix:** REF-xxx

---

## 1. Queue Design
- **REF-001.** Two queues, strictly separated: **Underwriting queue** (medical/occupation/age referrals — insurer underwriter works it) and **Compliance queue** (screening/identity/EDD — licensed entity's compliance officer works it). A case can sit in both; both must clear before issuance.
- **REF-002.** Case record: application snapshot, triggering rule IDs (UW-xxx/KYC-xxx), documents, channel/tenant, timestamps of every state change. Trigger rule IDs are the audit spine.
- **REF-003.** Case states: Created → In review → Info requested → Decision (Accept / Accept-with-terms / Decline) → Closed. "Info requested" pauses SLA clock.

## 2. SLAs & Notifications
- **REF-010.** Standard UW referral: 1 business day. Medical-report cases (UW-202/UW-502 with reports): 3 business days. Compliance: 1 business day. EDD: 2 business days.
- **REF-011.** Customer notifications at creation ("under review, expect answer by X"), on info request, and on decision — WhatsApp primary. Assisted channels: operator/broker notified in tenant workspace simultaneously.
- **REF-012.** SLA breach → auto-escalation to insurer relationship owner + daily breach report (WP-11).

## 3. Decisions & Counter-offers
- **REF-020.** Accept → application resumes at payment (PAY-003 48-hour window restarts).
- **REF-021.** Accept-with-terms (loading and/or exclusion, UW-506/507): counter-offer presented with plain-language explanation and revised premium; customer must positively accept (OTP attestation); acceptance recorded as part of contract evidence; then payment.
- **REF-022.** Counter-offer validity 7 days; expiry → case closes as "lapsed counter-offer" (re-application allowed).
- **REF-023.** Decline → reason category to customer (medical / eligibility / verification); full reasoning retained internally; decline record keyed to EID with 30-day cooling rule (WP-03 J-R3). A declined customer is offered any regime-compliant alternative that does not require the failed criterion (e.g., federal Basic Scheme where medical rating caused the enhanced-plan decline).
- **REF-024.** Underwriter identity, decision, and rationale are recorded per case; the portal never alters an insurer decision.

## 4. Volume & Staffing Signals
- **REF-030.** Referral-rate KPI: target < 10% of applications for the Basic/EBP volume products (their designs are STP-heavy); enhanced plans naturally higher. Referral rate per channel monitored — an outlier typing centre may indicate coaching or misuse (feeds WP-09 tenant conduct monitoring).
