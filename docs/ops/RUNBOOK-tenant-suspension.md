# Runbook — Tenant Suspension

**Rule ID:** TEN-011. **Owner:** Platform Ops / Compliance.

## When to suspend
Per WP-09 §4 TEN-011 conduct monitoring: a tenant's referral rate, decline
rate, cancellation rate, or declaration-mismatch findings cross a threshold,
or a direct compliance/legal instruction requires it (e.g. licence lapse,
AML concern).

Check current tenant conduct signals via
`GET /reports/conduct-monitor` (`conductMonitor()` in
`apps/api/src/engine/reports.service.ts`) before deciding.

## Effect (immediate, per TEN-011)
`POST /admin/tenants/:id/status { "status": "suspended" }`
(`AD-01` platform admin screen).

- **No new business:** enforced in code —
  `startApplication` (`apps/api/src/engine/entry.service.ts`) checks the
  tenant's status and throws `TEN-011` if suspended, before any
  application row is created.
- **In-flight completes:** existing applications are untouched by the
  status change — they continue through the engine normally. This is a
  deliberate design choice (no state-machine hook on suspension) so
  customers already mid-journey are not stranded.

## Steps
1. Confirm the conduct signal / instruction with Compliance.
2. Set tenant status to `suspended` via the admin portal or API.
3. Verify: attempt a `POST /applications` under that tenant's context and
   confirm it is rejected with `TEN-011`.
4. Notify the tenant's primary contact (outside the system — no
   in-portal messaging exists in v1).
5. If the conduct issue resolves, set status back to `active`.
6. If the tenant is permanently offboarded (TEN-012), see the
   `Tenant Manager` (AD-01) offboarding flow: access revoked, customer
   records remain with the platform, payout account settles after the
   clawback window (QR-022).

## Evidence for RELEASE-READINESS
- `apps/api/src/uat/scenarios/channels-permissions.uat.spec.ts` — U-75
- `apps/api/src/engine/entry.service.ts` — TEN-011 gate
