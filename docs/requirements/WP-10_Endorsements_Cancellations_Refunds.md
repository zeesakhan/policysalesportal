# WP-10 — Endorsements, Cancellations & Refunds Rules
**Version:** 1.0 (for business review) | **Date:** 12 July 2026
**Depends on:** WP-07 | **Feeds:** WP-11, WP-12
**Rule ID prefix:** END-xxx

---

## 1. Endorsements (mid-term changes)
- **END-001.** All endorsements are issued by the insurer (REG-003); the portal captures the request, runs applicable rules, and routes.
- **END-002.** Endorsement catalogue v1: (a) EID number addition post-issuance (KYC-002); (b) name/passport correction; (c) newborn addition — Dubai hard SLA within 30 days of birth (REG-024), engine warns at day 20; (d) dependent addition/removal; (e) mobile/contact change; (f) plan upgrade at renewal only (no mid-term upgrade in v1 — anti-selection control); (g) emirate/regime change following visa transfer → treated as cancel + new policy in correct regime, with pro-rata handled per END-011.
- **END-003.** Additional premium endorsements (newborn, dependent addition): rated per WP-05 pro-rata for remaining term; payment via insurer rails (PAY-001); effective only on payment + registration update.
- **END-004.** Corrections that would have changed the UW outcome (DOB error revealing age > band): case → REFER; insurer decides continue/re-rate/void.

## 2. Cancellations
- **END-010.** Cancellation reasons captured (leaving UAE, employer now provides cover, switched insurer, visa cancelled, dissatisfaction, other). Reason data feeds product analytics (WP-11).
- **END-011.** Refund basis per insurer's filed product terms **[INSURER]**: typical pattern — full refund pre-registration; short-rate or pro-rata post-activation with minimum earned premium; no refund after a claim. The engine implements the insurer's table; portal displays computed refund before the customer confirms.
- **END-012.** Mandatory-cover warning: cancelling the policy that supports an active residence visa can invalidate visa status. Explicit warning + acknowledgement before processing; where the regime platform requires replacement-policy proof before deregistration **[VERIFY per regime]**, the flow demands the replacement policy number.
- **END-013.** Refund money moves insurer → customer (original payment method); portal tracks status; SLA per insurer terms **[INSURER]**, customer notified at request/approval/paid.
- **END-014.** Commission clawback cascades on cancellation per QR-022.
- **END-015.** Abuse control: ≥ 2 purchase-cancel-refund cycles by same EID in 12 months → EDD flag (KYC-020) + block on further portal purchases pending compliance review.

## 3. Renewals
- **END-020.** Renewal notices at 60/30/7 days before expiry (S11); one-tap renewal re-runs eligibility (age band may have changed → UW rules apply at renewal) and current rate table.
- **END-021.** Lapse: policy expiry without renewal → status "lapsed" reported to insurer; regime deregistration is the insurer's action; customer warned of visa impact (END-012 language).
