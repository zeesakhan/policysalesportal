# Runbook — Incident Communications

**Owner:** Platform Ops. **Scope:** customer-facing and tenant-facing
communication during an incident (registration outage, payment-provider
outage, security incident).

## Principles (from the WP suite, binding)
- **J-R4**: customer-facing failure messages use reason *categories* only —
  never raw rule IDs, error codes, or screening detail. This applies to
  incident comms too: "we're experiencing a delay, no action needed" is
  correct; "insurer API returned 503 on registration endpoint" is not.
- **KYC-013**: screening-related holds use neutral "additional verification
  required" wording — never anything resembling a tipping-off statement,
  even under incident pressure.
- The three-state tracker (SC-10) already carries the "processing — no
  action needed" state for registration delays (PAY-023) — for a
  registration-outage incident, no *additional* customer message is
  usually needed beyond what the tracker already shows.

## Severity triage
- **Critical**: money has moved and cannot be tracked (payment webhook
  outage, three-way match showing a growing backlog), or a confirmed
  security/data-breach event.
- **High**: a whole channel is blocked (e.g. insurer payment gateway down
  — no applications in that regime can reach `paid`).
- **Medium**: degraded but working (elevated registration-retry rate,
  slow quote generation).

## Steps
1. Declare the incident, assign an owner, open a tracking channel.
2. Check `GET /reports/exceptions` and `GET /ops/tickets` for the current
   blast radius (which applications/policies are affected).
3. If customer-facing: use only J-R4-compliant category language,
   surfaced through the existing tracker/status screens, not ad-hoc
   messaging that might leak internal detail.
4. If tenant-facing (e.g. a channel-wide outage): notify tenant admins
   (typing centres, brokers) via the channel used for onboarding
   communications (outside the portal in v1 — no in-app broadcast exists
   yet, a gap to raise for M5/launch planning if incident volume
   warrants building one).
5. On resolution: re-run the three-way match, confirm zero new orphans,
   close all ops tickets raised during the window, write a post-incident
   note (root cause, what fixed it, what monitoring gap — if any —
   allowed it to go undetected).

## Evidence for RELEASE-READINESS
This runbook is a walkthrough item — process, not code — evidenced by this
document existing and being reviewed once with the ops team before launch
(RELEASE-READINESS.md "Operations" section).
