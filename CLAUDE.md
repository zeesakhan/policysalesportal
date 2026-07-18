# CLAUDE.md — AI Developer Master Brief
**Project:** UAE Policy Sales Portal (individual medical, multi-tenant, three regulatory regimes)
**Role:** You are the AI developer responsible for building, testing and preparing this product for launch, under the direction of the product owner (Zeeshan).

---

## 1. Source-of-Truth Hierarchy (never violate)

1. `/docs/requirements/WP-00 … WP-13` — the approved business requirements suite. **These documents are law.** Rule IDs (REG-xxx, UW-xxx, QR-xxx, KYC-xxx, PAY-xxx, REF-xxx, TEN-xxx, END-xxx, MIS-xxx) are the canonical behaviour spec.
2. `/docs/build/ARCHITECTURE.md` — technical constraints and stack decisions.
3. `/docs/build/BUILD-PLAN.md` — the phased plan; work only on the current milestone.
4. This file — your working rules.

If code and a WP document disagree, the WP document wins. If two WP documents disagree, STOP and raise it in `PROGRESS.md` under "Blocked — needs product owner", with both citations. Never resolve a requirements conflict yourself.

## 2. Non-Negotiable Rules

- **Never invent a business rule.** If a scenario is not covered by a rule ID, implement nothing for it, log it as a gap in `PROGRESS.md`, and continue with covered scope.
- **Placeholders are gates, not suggestions.** Values marked `[INSURER]`, `[VERIFY]`, `[COUNSEL]` in the WPs are configuration points. Build them as configurable (config tables/files with named keys, e.g. `UW_502_AUTO_ACCEPT_LIST`), seed them with clearly-fake defaults prefixed `PLACEHOLDER_`, and list every one in `/docs/build/CONFIG-REGISTER.md`. The system must refuse to start in production mode while any `PLACEHOLDER_` value remains.
- **Traceability is mandatory.** Every implemented rule carries its rule ID: in code comments at the enforcement point, in the rules-engine config, in test names (`test_UW_202_over64_refers`), and in audit events. A rule without a traceable test does not count as implemented.
- **One engine, five skins** (WP-13 §1). There is exactly one application engine. Channel portals wrap it. If you find yourself duplicating journey logic per channel, stop and refactor.
- **Prohibited by design:** premium collection or wallet logic, card-data storage, cash handling, claims processing, a standalone agent portal, salary-verification integrations. If a task seems to need one of these, it's a misreading — re-read WP-02/WP-13 §9.
- **Health-data lock (TEN-002):** declaration answers are visible to exactly two roles. Enforce at the data-access layer with tests proving denial + audit logging. This is the single most important permission in the system.
- **Hosting/data residency:** all data in-UAE region (REG-007/051). No external SaaS that stores personal data outside UAE without an explicit product-owner decision.

## 3. How You Work (session protocol)

1. **Start of every session:** read `PROGRESS.md`, confirm current milestone and next task. Do not skip ahead.
2. **Task size:** every task in BUILD-PLAN is sized to complete in one session including its tests. If a task is running long, split it, record the split in PROGRESS.md, finish the first half cleanly.
3. **End of every session:** update `PROGRESS.md` (done / in-progress / blocked / decisions made / gaps found), commit with message `M<milestone>-T<task>: <summary> [rule IDs touched]`.
4. **Tests before "done":** a task is complete only when its unit tests pass, its rule-ID tests exist, and the UAT scenarios it enables (see UAT-PLAN mapping) are runnable.
5. **Mock-first integrations:** every external integration (insurer API, ICP, MOHRE, screening, WhatsApp, payment webhooks) is built behind an adapter interface with a mock implementation first (`/integrations/<name>/mock`). Real adapters are separate tasks gated on credentials. The full journey must run end-to-end on mocks.
6. **Never weaken a test to make it pass.** If a test contradicts a WP rule, fix the test with the rule citation; if it matches the WP and code fails, fix the code.

## 4. Human Gates (hard stops — do not proceed without explicit product-owner approval in PROGRESS.md)

- **GATE-1** — end of M1: engine demo on mocks; product owner approves journey behaviour before any portal skin is built.
- **GATE-2** — end of M4: UAT results reviewed; product owner + business sign the UAT report before hardening/launch work.

## 5. Definitions

"Done" for the product = every item in `/docs/build/RELEASE-READINESS.md` checked with evidence links. "Done" for a task = §3.4 above. "Blocked" = anything requiring a business decision, a credential, or a placeholder value — never guess through a block.
