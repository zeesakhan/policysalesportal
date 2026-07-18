# WP-03 — Customer Journey Maps (Per Channel)
**Version:** 1.0 (for business review) | **Date:** 12 July 2026
**Depends on:** WP-01, WP-02 | **Feeds:** WP-04, WP-07, WP-09, WP-12
**Step ID prefix:** J[channel]-xx

---

## 1. Common Journey Backbone

All channels share one backbone; channels differ in who drives the screen and how documents/payment are handled. The backbone stages:

**S1 Entry → S2 Regime Routing → S3 Data Capture → S4 Eligibility & Screening → S5 Quote → S6 Health Declaration (if triggered) → S7 Underwriting Decision → S8 Payment (direct to insurer) → S9 Issuance & Regulator Registration → S10 Delivery → S11 Post-sale Servicing**

### Backbone step definitions

- **S1 Entry.** Source captured (channel, tenant ID, affiliate code). Language selection. Consent to privacy notice (REG-050).
- **S2 Regime Routing.** Capture *emirate of visa issuance* (from visa page / Emirates ID application). This is the master branch: → Federal Basic Scheme, → Dubai EBP/enhanced, → Abu Dhabi Basic/enhanced. Mismatch handling: buyer in Sharjah with a Dubai visa is routed to Dubai products. (WP-01 §3 routing principle.)
- **S3 Data Capture.** Emirates ID (scan/OCR or number + name), passport, visa details, DOB, gender, nationality, mobile, email (optional for blue-collar segment — mobile/WhatsApp is primary), sponsor type (employer/self/family), salary band where the regime requires it, dependents (regime-dependent, see WP-04).
- **S4 Eligibility & Screening.** Rules engine runs eligibility (WP-04 UW-1xx) + sanctions screening (WP-06). Fail → decline message with reason category (never raw screening detail).
- **S5 Quote.** Rating per WP-05. Quote displays REG-060 mandatory content. Quote validity: 14 days or until rate table change, whichever first.
- **S6 Health Declaration.** Only if triggered (WP-04 UW-2xx): short-form declaration; positive answers may expand to full MAF. Explicit sensitive-data consent (REG-050).
- **S7 Underwriting Decision.** STP → proceed. Refer → case created in referral queue (WP-08); customer informed of SLA. Decline → reason category + alternatives if any.
- **S8 Payment.** Direct-to-insurer payment (REG-002): insurer gateway page or insurer payment link. Portal records payment reference only; never card data, never funds.
- **S9 Issuance & Registration.** Insurer issues policy (REG-003); insurer/TPA registers to DHA/DoH/federal systems; portal polls/receives webhook for registration confirmation. **Journey is not complete until registration confirmed (REG-013/022/032).** Failure path: auto-retry, then ops ticket, customer notified of pending status.
- **S10 Delivery.** Policy schedule + e-card via WhatsApp and email; print at typing centre. Arabic + selected language where insurer provides.
- **S11 Post-sale.** View policy, download documents, request endorsement/cancellation (WP-10), renewal reminders (60/30/7 days before visa-linked expiry).

## 2. Journey A — Direct Customer (TikTok / web / mobile)

| Step | Actor | Notes |
|---|---|---|
| JA-01 | Customer | Lands from TikTok/link; affiliate code auto-attached if present; language select |
| JA-02 | Customer | Guided regime routing — "Which emirate is your visa from?" with visual help (visa page image) |
| JA-03 | Customer | EID scan via phone camera; OCR prefill; manual fallback |
| JA-04 | System | Eligibility + screening; instant result |
| JA-05 | Customer | Quote screen; plan compare (minimum vs enhanced) in plain language |
| JA-06 | Customer | Health declaration if triggered; can save & resume via OTP link |
| JA-07 | System | STP or refer (push/WhatsApp notification of referral outcome) |
| JA-08 | Customer | Pay on insurer gateway |
| JA-09–10 | System | Issue, register, deliver via WhatsApp/email |

Design constraints: mobile-first; max 5 minutes to quote; reading level ~grade 5; numerals and icons over text; Urdu/Hindi/Bengali voice-note help option (Phase 1 language set per WP-01 §4).

## 3. Journey B — Typing Centre (assisted)

| Step | Actor | Notes |
|---|---|---|
| JB-01 | Operator | Logs into tenant workspace; starts "New Application"; customer physically present |
| JB-02 | Operator | Captures customer consent — on-screen consent in customer's language + OTP to customer's phone confirming they authorise the operator to act (**consent artifact stored**) |
| JB-03 | Operator | Scans EID/passport/visa at desk scanner; regime routing automatic from visa |
| JB-04 | System | Eligibility + screening |
| JB-05 | Operator + Customer | Quote shown on customer-facing screen orientation; operator explains; REG-060 content mandatory |
| JB-06 | Customer | Health declaration answered by the customer, attested by OTP — the operator may translate but the declaration is the customer's own (misrepresentation risk control) |
| JB-07 | System | UW decision |
| JB-08 | Customer | Payment on insurer gateway on the desk terminal or payment link to customer's own phone — operator never takes cash (WP-01 A-04, REG-002) |
| JB-09–10 | System/Operator | Issue, register; operator prints policy + e-card card; WhatsApp copy sent |

Key controls: operator identity per transaction; consent artifact; declaration OTP attestation; no cash; operator commission visible only in tenant back office (never on customer screen).

## 4. Journey C — Broker Portal

| Step | Actor | Notes |
|---|---|---|
| JC-01 | Broker user | Tenant login; client file create/reuse (broker's own book) |
| JC-02 | Broker | Bulk or single entry; document upload; regime routing per insured |
| JC-03 | System | Eligibility + screening per life |
| JC-04 | Broker | Quote with commission-inclusive view; can generate client-facing quote PDF (commission hidden) |
| JC-05 | Customer | Declaration completed via link sent to the insured (same attestation rule as JB-06) |
| JC-06 | System | UW decision; broker sees referral queue status for their cases |
| JC-07 | Customer | Payment link direct to insurer |
| JC-08–10 | System | Issue, register, deliver; broker gets copy in client file |

## 5. Journey D — Affiliate / Street Seller

Strictly attribution-only (REG-006): affiliate shares an approved link/QR; the customer then runs Journey A end-to-end themselves. The affiliate never sees customer data, never captures documents, never presents quotes, never touches payment. Affiliate tenant view: clicks, conversions, payable commission only.

## 6. Journey E — Insurer/TPA Oversight (internal)

Referral queue handling (WP-08), product/rate table management (WP-05), bordereaux (WP-11), registration-failure ops queue (S9 failures).

## 7. Cross-Journey Rules

- **J-R1.** Every journey step writes an audit event (who, when, tenant, before/after) — feeds WP-12 UAT.
- **J-R2.** Abandonment: quote saved 14 days; resume link via WhatsApp; one reminder max (no spam to this segment).
- **J-R3.** A declined applicant may not be re-run through another channel to shop for STP; EID-keyed decline cooling record 30 days, referral to manual UW allowed (WP-08).
- **J-R4.** All customer-facing failure messages use reason *categories*; raw rule IDs and screening results never shown.
