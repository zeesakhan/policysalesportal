# WP-05 — Quotation & Rating Rules
**Version:** 1.0 (for business review) | **Date:** 12 July 2026
**Depends on:** WP-04 | **Feeds:** WP-07, WP-11, WP-12
**Rule ID prefix:** QR-xxx

---

## 1. Rating Architecture

- **QR-001.** All rate tables are insurer-owned configuration, loaded per partner annex, versioned, with effective-date ranges. The portal never invents a price; it evaluates the insurer's table (REG-003/005 alignment).
- **QR-002.** Rating dimensions by product: Federal Basic — flat community rate per scheme price list (entry ~AED 320/yr) with variants the scheme/insurer defines **[VERIFY/INSURER]**. Dubai EBP — DHA-published premium range by category; insurer's filed price within range **[INSURER]**. AD Basic — DoH-filed rates **[INSURER]**. Enhanced — matrix of age band × plan tier × network × co-pay option × maternity option × emirate, plus UW-506 loadings.
- **QR-003.** Quote = base premium + loadings + policy fees **[INSURER]** + VAT 5% (REG-062). Every component itemised on the quote.
- **QR-004.** Discounts: only insurer-configured campaigns (REG-005). No tenant may apply a manual discount. Promo codes map to insurer campaign IDs with validity windows.
- **QR-005.** Quote validity 14 days or until rate-table version change (earlier of). Expired quote → re-quote with current table; if price increased, show old vs new transparently.
- **QR-006.** Multi-life quotes (dependents): per-life rating, single family summary; AD sponsored-children category priced per DoH basic terms.

## 2. Quote Content (REG-060 compliance)
- **QR-010.** Mandatory quote fields: insurer legal name; product/plan filed name; benefit summary table; key exclusions; network name/tier; annual limit; co-pays; premium breakdown (base/loading/fees/VAT/total); licensed entity name + CBUAE licence no.; quote ID + validity; language of issue.
- **QR-011.** Plan comparison view may show max 3 plans side by side with identical benefit rows (no cherry-picked rows per plan).
- **QR-012.** Blue-collar presentation rule: total price shown first and largest; monthly-equivalent display allowed only if instalments genuinely offered by the insurer **[INSURER]**.

## 3. Commission & Payout Logic
- **QR-020.** Insurer → licensed entity commission per partner agreement (indicative 5–10%); received within 10 business days of premium receipt (REG-004); recorded per policy for reconciliation (WP-11).
- **QR-021.** Downstream payout table (from the licensed entity's own commission): broker tenant X%, typing centre Y AED-or-% per issued policy, affiliate Z per conversion **[BUSINESS to set]**. Payouts accrue only on **issued + registered** policies (S9 complete), not on payment alone.
- **QR-022.** Clawback: if policy cancelled within period C **[INSURER]** and commission clawed back by insurer, downstream payouts claw back proportionally. Payout statements show accrued/paid/clawed.
- **QR-023.** Affiliate attribution: last-click, 30-day cookie/code window; self-referral (affiliate buying own policy via own code) allowed once, flagged for abuse monitoring.
- **QR-024.** No payout party may see another party's rates (tenant isolation, WP-09).

## 4. Re-rating Events
- **QR-030.** Rate table version change → in-flight paid applications honour quoted price; unpaid quotes re-rate on resume with QR-005 transparency.
- **QR-031.** DOB/regime corrections discovered before issuance → mandatory re-quote; after issuance → endorsement flow (WP-10).
