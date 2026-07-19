# UAT Report — UAE Policy Sales Portal

**Prepared by:** AI developer, per CLAUDE.md / BUILD-PLAN.md M4.
**Scenario source:** WP-12 Part B (WP-12_Business_Acceptance_Pack.md) — the
complete and only scenario catalogue; no scenarios invented.
**Traceability matrix:** `uat/matrix/TRACEABILITY.md` (generated,
regenerate with `pnpm gen:traceability`).
**Date:** 2026-07-19.

## 1. Summary

| Metric | Result |
|---|---|
| Scenarios in WP-12 Part B | 42 (U-01…U-86 range; IDs are non-contiguous as published) |
| Scenarios automated | 42 / 42 (100%) |
| Scenarios passing | 42 / 42 (100%) |
| Open critical/high defects | 0 |
| Waivers | 0 |
| Manual scripts (physical-only) | 3 written, **0 executed** (require real hardware/carrier — see §4) |
| Unmapped scenarios in traceability matrix | 0 |

**Exit criteria (UAT-PLAN.md §4) status:**
- [x] 100% scenarios executed, ≥95% passed (100% passed)
- [x] Zero open critical/high defects
- [x] Every scenario has a rule-ID-cited automated test (see traceability matrix)
- [ ] Manual evidence pack complete — **outstanding**: the 3 manual scripts
      require a staffed typing-centre desk, real WhatsApp Business API
      credentials, and native-language reviewers, none of which exist in
      this build environment. This is a real gate, not a formality — flagged
      for the product owner in PROGRESS.md.
- [x] Security-relevant scenarios (U-63 no card data, U-71 declaration
      denial, U-72 tenant isolation) pass with evidence (see §3)

## 2. Per-Scenario Results

See `uat/matrix/TRACEABILITY.md` for the full generated table (scenario →
title → rule IDs → test file). All 42 rows: **PASS**. Regenerate anytime with
`pnpm gen:traceability`; re-run the underlying tests with
`pnpm vitest run apps/api/src/uat`.

Section breakdown:

| WP-12 §B Section | Scenarios | Result |
|---|---|---|
| Eligibility & routing | U-01…U-06 (6) | 6/6 pass |
| Federal Basic Scheme | U-10…U-13 (4) | 4/4 pass |
| Dubai EBP | U-20…U-23 (4) | 4/4 pass |
| Abu Dhabi | U-30…U-31 (2) | 2/2 pass |
| Enhanced plans | U-40…U-45 (6) | 6/6 pass |
| Screening & compliance | U-50…U-52 (3) | 3/3 pass |
| Payment, issuance, registration | U-60…U-63 (4) | 4/4 pass |
| Channels & permissions | U-70…U-75 (6) | 6/6 pass |
| Lifecycle & money | U-80…U-86 (7) | 7/7 pass |

## 3. Security-Relevant Scenario Evidence

- **U-63 (no card data):** `payment-issuance.uat.spec.ts` asserts the
  `payments` table schema has no PAN-shaped column, then runs a complete
  paid journey and scans every stored value with the same Luhn-based
  detector CI runs repo-wide (`scripts/check-pan-patterns.mjs`) — zero hits.
- **U-71 (declaration denial):** `channels-permissions.uat.spec.ts` proves
  an operator's own RLS context returns zero rows from `health_declarations`
  (denied at the data layer, not app logic), and that every declaration
  submission is captured in the append-only audit spine (TEN-004).
- **U-72 (tenant isolation):** `channels-permissions.uat.spec.ts` proves
  Broker A cannot read Broker B's application by ID under RLS, while Broker
  B can read its own — the hard isolation TEN-001 requires.

## 4. Manual Evidence — Outstanding

Three manual scripts are written and ready for execution but **not yet
executed**, honestly reported rather than marked complete:

1. `uat/manual/MANUAL-01_typing_centre_assisted_flow.md` — needs a staffed
   typing-centre desk with card reader and printer.
2. `uat/manual/MANUAL-02_arabic_rtl_visual_check.md` — needs an
   Arabic-fluent human reviewer on a real device.
3. `uat/manual/MANUAL-03_whatsapp_readability_5_languages.md` — needs the
   real WhatsApp Business API (M5-T1, gated on credentials) and native
   speakers of UR/HI/BN/AR.

These are genuine gates on real-world resources this build environment does
not have, not gaps in test design. **GATE-2 sign-off should record this
explicitly**: the automated 100% pass rate covers system *behaviour*; the
manual scripts cover physical/perceptual quality that only humans with the
right hardware and language skills can verify.

## 5. Defects Found and Fixed During This Cycle

See `uat/DEFECT-LOG.md`. Three defects were found while authoring scenarios
and fixed before this report was produced (per CLAUDE.md §3.6 — never weaken
a test to make it pass; fix the code):
- **D2 (High, TEN-011):** tenant suspension was not enforced — fixed by
  adding the gate to `startApplication`.
- **D1 (Medium, UW-306):** maternity notice was cited in a comment but never
  implemented — fixed, with the marital-status data-capture gap logged for
  product-owner input (PROGRESS.md gap G2).
- **D3 (Low, tooling):** PAN checker false-positived on random UUIDs — fixed
  at the root cause (UUID stripping before the PAN scan).

Zero defects remain open.

## 6. Entry Criteria Verification (UAT-PLAN.md §3)

- [x] M0–M3 complete (PROGRESS.md)
- [x] All unit/integration tests green (178 tests across 30 files: M0–M3 engine/data/rules tests plus 42 WP-12 UAT scenarios, all passing — `pnpm test`)
- [x] UAT env seeded — `seedDemoCatalogue` + `PERSONAS` (UAT-PLAN §2 personas
      P01–P25, minus P08/P10/P19 which are not exercised by the 42 published
      scenarios — not invented to fill a gap)
- [x] Mocks deterministic — every scenario programs its mock adapters to the
      exact mode under test (ICP pass/fail, screening clear/potential/confirmed,
      registration success/fail, payment confirmed/expired)
- [x] Traceability matrix generated with zero unmapped scenarios

## 7. Recommendation to Product Owner (GATE-2)

Per D-B2 (pre-approval), this report substitutes for a paused review — the
product owner should still read it, not just the pass/fail headline. My
recommendation: **the automated behaviour is ready for GATE-2** (100% of the
published scenario catalogue passes, zero open defects). The **manual
evidence pack is not ready** and should not be treated as satisfied by this
report — it requires real-world resources (hardware, carrier, native
speakers) to close before a genuine launch decision, tracked as a
RELEASE-READINESS item in M5.
