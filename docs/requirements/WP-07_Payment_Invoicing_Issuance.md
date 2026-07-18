# WP-07 — Payment, Invoicing & Policy Issuance Rules
**Version:** 1.0 (for business review) | **Date:** 12 July 2026
**Depends on:** WP-04, WP-06 | **Feeds:** WP-10, WP-11, WP-12
**Rule ID prefix:** PAY-xxx

---

## 1. Payment (direct-to-insurer, REG-002)
- **PAY-001.** All premium payments execute on the insurer's payment rails (hosted gateway page or insurer-issued payment link). The portal passes an application reference and receives a payment-status webhook/poll. The portal never stores card data (no PCI scope) and never receives premium funds.
- **PAY-002.** Accepted methods per channel: Direct — card, Apple/Google Pay, bank app link as insurer supports. Typing centre — insurer gateway on desk terminal or payment link to the customer's phone; **cash prohibited** (WP-01 A-04). Broker — payment link to insured/payer.
- **PAY-003.** Payment window: 48 hours from quote acceptance/UW clearance; expiry → application returns to quoted state (QR-005 validity still governs).
- **PAY-004.** Instalments only if insurer product offers them **[INSURER]**; instalment default handling is the insurer's; portal displays schedule and status only.
- **PAY-005.** Failed/abandoned payment: max 3 retries; single follow-up message (WP-03 J-R2).
- **PAY-006.** Refund money movement is insurer → customer (original method); portal orchestrates the request only (WP-10).

## 2. Tax Invoice & Receipts (REG-062)
- **PAY-010.** Tax invoice for premium is issued by the insurer (supplier of the insurance service). The portal displays/forwards the insurer's tax invoice; if the insurer delegates invoice rendering **[INSURER]**, the invoice still shows the insurer as supplier with the insurer's TRN.
- **PAY-011.** The licensed entity issues its own tax invoices to the insurer for commission (WP-11 reconciliation), and to downstream partners where applicable — back-office concern, never customer-facing.
- **PAY-012.** Customer receipt content: amount, VAT, payment reference, application ID, insurer name, timestamp — delivered with policy pack (S10).

## 3. Issuance & Regulator Registration
- **PAY-020.** Trigger: payment-confirmed webhook → issuance request to insurer (REG-003: insurer issues).
- **PAY-021.** Issuance SLA: policy number within 15 minutes for STP cases **[INSURER]**; breach → ops alert.
- **PAY-022.** Registration: insurer/TPA registers policy to the regime platform — DHA (ISAHD/UMIS), DoH, or federal scheme systems (MOHRE/ICP recognition). Portal must receive registration confirmation and only then mark the journey complete (REG-013/022/032). Customer sees three states: *Paid → Policy issued → Active & registered (visa-ready)*. The "visa-ready" state is the customer's real goal; surfacing it is a product differentiator.
- **PAY-023.** Registration failure: auto-retry ×3 over 2 hours → ops ticket (Journey E queue) → customer notified "processing, no action needed" → hard SLA 1 business day; unresolved → escalation to insurer relationship owner. Money has moved, so this queue has the highest ops priority in the platform.
- **PAY-024.** Policy pack delivery (S10): policy schedule (insurer document), e-card, receipt, benefit summary in customer language + Arabic where provided; WhatsApp + email; print at typing centre.
- **PAY-025.** Start date: per UW-107; where visa processing awaits insurance, same-day activation on registration is the default customer promise for STP cases.

## 4. Reconciliation Hooks (detail in WP-11)
- **PAY-030.** Daily three-way match: portal applications ↔ insurer payment confirmations ↔ issued/registered policies. Any orphan state (paid-not-issued, issued-not-registered) appears on the exceptions report until cleared.
