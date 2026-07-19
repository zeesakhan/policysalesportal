# Runbook — Reconciliation Break (Three-Way Match Orphan)

**Rule ID:** PAY-030, MIS-002. **Owner:** Platform Ops / Finance.

## What this catches
The daily three-way match (`threeWayMatch()` in
`apps/api/src/engine/issuance.service.ts`) reconciles: portal applications
↔ insurer payment confirmations ↔ issued/registered policies. Three orphan
types:
- `paid_not_issued` — application reached `paid` but no policy row exists.
- `issued_not_registered` — policy issued but not yet registered (this is
  also the registration-failure queue's own signal — see that runbook).
- `confirmed_not_paid` — a payment webhook fired `confirmed` but the
  application state never advanced to `paid` (a lost/dropped state
  transition, e.g. a crash between webhook receipt and the DB write).

## Detection
- `GET /reports/exceptions` (AD-08 exceptions dashboard) — run daily; in
  production this should be a scheduled job, not an on-demand call (M5-T3
  build item: wire a daily cron invoking `threeWayMatch` and
  `exceptionsReport`, alerting on any non-empty result).

## Response by orphan type
1. **paid_not_issued**: check whether `orchestrateIssuance` was ever
   called for the application (audit log: `payment.link_created` /
   webhook confirmation events exist, but no `policy.issued` event). If
   the call never fired, invoke issuance manually
   (`POST /applications/:id/issue`) after confirming the payment is
   genuinely confirmed at the insurer. If it fired and failed with an
   error not caught by the registration-failure path, investigate the
   stack trace / logs from that call.
2. **issued_not_registered**: hand off to the
   `RUNBOOK-registration-failure-queue.md` process — this orphan and that
   queue describe the same underlying state.
3. **confirmed_not_paid**: replay the webhook
   (`POST /webhooks/payment` with the same `providerRef`) — webhook
   handling is idempotent and re-orderable by design
   (`handlePaymentWebhook`), so a safe replay either fixes the state or
   confirms it was already correct.

## Evidence for RELEASE-READINESS
- `apps/api/src/engine/issuance.service.spec.ts` — `test_PAY_030_confirmed_not_paid_orphan_detected`
- `apps/api/src/uat/scenarios/lifecycle-money.uat.spec.ts` — U-85
