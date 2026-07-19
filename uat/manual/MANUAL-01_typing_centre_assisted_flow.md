# Manual UAT Script 01 — Typing Centre Assisted Physical Flow

**Covers:** U-70 (physical evidence half), TC-02a consent screen, TC-04 print pack.
**Rule IDs:** JB-02, JB-06, UW-108, PAY-024.
**Why manual:** requires a physical desk, a real customer phone receiving a
real SMS OTP, a physical card-reader/scanner, and a physical printer — none
of which exist in this build/CI environment. The equivalent logic (consent
attestation, declaration attestation, print-gate-on-registered) is proven
automatically in `apps/api/src/uat/scenarios/channels-permissions.uat.spec.ts`
(U-70) against the **mock** SMS adapter; this script proves the same flow
against **real** hardware and a **real** carrier.

**Status: NOT YET EXECUTED** — requires a staffed typing-centre desk with
hardware. Assign to a typing-centre pilot site before GATE-2 sign-off.

## Pre-requisites
- [ ] Typing-centre operator account provisioned (named individual, WP-09 TEN-013)
- [ ] PC/SC-compatible EID card reader connected (INT-G2)
- [ ] Test Emirates ID card (synthetic/sandbox card if ICP test environment provides one; otherwise use manual EID entry path)
- [ ] Real mobile phone able to receive SMS at the desk
- [ ] Physical printer connected to the desk terminal

## Steps & Evidence Checklist

1. Operator logs into the typing-centre portal (`/typing-centre`).
   - [ ] Screenshot: dashboard loads with operator's own name shown (no shared logins, TEN-013).
2. Operator starts "New Application"; consent screen (TC-02a) shows in the
   customer's selected language.
   - [ ] Screenshot: consent text rendered in the customer's language.
   - [ ] Photo/video: OTP SMS arriving on the customer's own phone within a
     reasonable delay.
3. Customer reads back the OTP to the operator (or enters it on a
   customer-facing screen); operator submits it.
   - [ ] Screenshot: consent confirmed, application created.
4. Operator scans the EID at the desk reader; chip-read data populates
   SC-03 fields directly (INT-G2 — chip read beats OCR).
   - [ ] Screenshot: EID fields auto-populated from the chip read.
5. Application proceeds through eligibility, quote, and (if triggered)
   declaration. Declaration OTP (JB-06) is sent to the **customer's own**
   phone; operator may translate the question aloud but must not answer.
   - [ ] Photo/video: declaration OTP SMS arriving on the customer's phone.
   - [ ] Screenshot: declaration submitted, operator screen shows status
     only ("complete"), never the answer content (TEN-002).
6. Payment: operator presents the insurer gateway on the desk terminal, or
   sends a payment link to the customer's own phone. Confirm **no cash is
   handled** at any point (WP-01 A-04, REG-002).
   - [ ] Screenshot/statement: payment completed on insurer rails.
7. Once the tracker shows "Active & registered (visa-ready)", operator
   opens Print & Delivery (TC-04) and prints the policy pack.
   - [ ] Photo: printed policy pack (schedule, e-card, receipt).
   - [ ] Screenshot: reprint (if any) is logged with timestamp + operator ID.

## Sign-off
| Field | Value |
|---|---|
| Typing centre / desk | |
| Operator name | |
| Date executed | |
| Result (Pass/Fail) | |
| Defects raised (rule ID + severity) | |
| Evidence bundle location | |
