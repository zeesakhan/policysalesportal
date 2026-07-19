# Defect Log — M4 UAT Cycle

Per UAT-PLAN.md §5: every defect cites the rule ID it violates; a defect with
no rule ID is either a spec gap (escalate to PROGRESS.md "Spec Gaps Found")
or not a defect. Severity: Critical (money/identity/health-data/wrong policy)
· High (journey blocked) · Medium (workaround exists) · Low (cosmetic).

## Open Defects
_None._ All 42 automated WP-12 Part B scenarios pass (see
`uat/matrix/TRACEABILITY.md` and `uat/UAT-REPORT.md`).

## Resolved During This Cycle

| # | Found in | Rule ID | Severity | Description | Fix |
|---|---|---|---|---|---|
| D1 | U-23 test authoring | UW-306 | Medium | Maternity-terms notice for married female EBP/enhanced buyers had no code path — the WP-04 rule was cited in a comment only, never implemented; the U-23 scenario would have been a false pass. | Implemented `maternityNotice` on the quote breakdown (`quote.service.ts`); operationalized as "female applicant on a Dubai/enhanced track" since SC-04/SC-05 capture no standalone marital-status field — logged as an open question for the product owner (see PROGRESS.md Spec Gaps G2). |
| D2 | U-75 test authoring | TEN-011 | High | Tenant suspension had no enforcement point — `startApplication` did not check tenant status, so "no new business" for a suspended tenant was unenforced. | Added the suspension gate to `startApplication` (`entry.service.ts`); in-flight applications remain unaffected per TEN-011. |
| D3 | Full-suite UAT run | PAY-001 (tooling) | Low | The PAN-pattern checker occasionally flagged random test UUIDs as PAN-like when their digit-only sub-segments happened to be Luhn-valid, causing intermittent CI failures on the U-63 (no card data) scenario. | `scripts/check-pan-patterns.mjs` now strips canonical UUID substrings before scanning; added a regression test with a hand-picked Luhn-valid-digits UUID. |

## Waivers
_None requested._
