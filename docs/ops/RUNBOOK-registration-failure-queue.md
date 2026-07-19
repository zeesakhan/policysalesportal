# Runbook — Registration-Failure Queue

**Rule ID:** PAY-023. **Priority:** highest in the platform — money has
already moved (payment confirmed, policy issued) when a ticket lands here.
**Owner:** Platform Ops (Journey E).

## What triggers a ticket
`orchestrateIssuance` → `attemptRegistration` retries the regime-platform
registration call 3 times automatically. If all 3 fail, an `ops_tickets` row
is created with `type = 'registration_failure'`, `due_at = now() + 1 day`
(hard SLA per PAY-023), and `detail` holds the policy number and last error
code from the insurer/TPA adapter.

Customer-visible state during this time: the three-state tracker shows
"processing — no action needed" (never a raw error) — see
`getTracker()` in `apps/api/src/engine/issuance.service.ts`.

## Detection
- **API:** `GET /ops/tickets` (platform_ops / insurer role) lists all open
  tickets.
- **Report:** `GET /reports/exceptions` (MIS §2 exceptions dashboard,
  AD-08) surfaces `issued_not_registered` orphans from the daily three-way
  match (PAY-030) as a second, independent detection path.
- **Alerting (production):** wire the exceptions-report orphan count and
  `ops_tickets` open-count-by-age into the monitoring stack (M5-T3 item —
  not yet built; alert at >0 tickets older than 30 minutes, page at >1
  business day per the hard SLA).

## Response
1. Open the ticket, read `detail.lastError` (the regime-platform error
   code returned by the insurer/TPA adapter).
2. Classify:
   - **Transient** (timeout, rate limit): retry via
     `POST /ops/tickets/:id/retry-registration` (calls
     `attemptRegistration` again, which itself retries up to 3 times).
   - **Data problem** (regime platform rejects a field — e.g. malformed
     EID, wrong regime code): fix the underlying application/person data,
     then retry.
   - **Regime-platform outage**: escalate to the insurer relationship
     owner per REF-012-style escalation; do not keep retrying blindly.
3. On success, `attemptRegistration` transitions the application
   `issued → registered` and auto-resolves the ticket
   (`status = 'resolved'`).
4. If unresolved by the 1-business-day SLA (`due_at`), escalate to the
   insurer relationship owner — this is explicit in PAY-023.

## Evidence for RELEASE-READINESS
- `apps/api/src/engine/issuance.service.spec.ts` — `test_PAY_023_registration_fail_x3_raises_ops_ticket_then_retry_clears`
- `apps/api/src/uat/scenarios/payment-issuance.uat.spec.ts` — U-61
