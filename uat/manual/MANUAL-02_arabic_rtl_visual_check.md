# Manual UAT Script 02 — Arabic / RTL Visual Check

**Covers:** REG-061 (Arabic policy-facing documents), WP-01 §4 (Phase-1
languages), i18n framework RTL support.
**Rule IDs:** REG-061, ARCHITECTURE §2 (AR = RTL).
**Why manual:** `packages/shared/src/i18n` proves *structurally* that the AR
catalogue has full key parity with EN and that `isRtl('ar')` returns true
(`packages/shared/src/i18n/i18n.spec.ts`), and the customer portal renders
`dir="rtl"` on the `<html>`/`<main>` element when `lang=ar`
(`apps/web/app/(customer)/page.tsx`). What automated tests cannot verify is
whether the **visual layout** actually reads correctly right-to-left on a
real screen — mirrored form fields, correctly reversed reading order for
numerals mixed with Arabic text, no clipped/overlapping text, correct font
rendering.

**Status: NOT YET EXECUTED** — requires a human fluent in Arabic to review
rendered screens on a real device (or accurate browser emulation).

## Pre-requisites
- [ ] Dev/UAT environment running (`pnpm dev` or deployed UAT env)
- [ ] Reviewer fluent in Arabic, familiar with standard RTL UI conventions
- [ ] Screen or device representative of the blue-collar target segment (a
      mid-range Android phone, not just a desktop browser)

## Steps & Evidence Checklist
For each screen below, load with `?lang=ar` and confirm:
- [ ] Overall text flows right-to-left; the language switcher, back
      button, and navigation icons are mirrored appropriately.
- [ ] Numerals (premium amounts, dates, phone numbers) remain legible and
      correctly ordered within the RTL flow.
- [ ] No text is clipped, overlapped, or rendered outside its container.
- [ ] Form labels stay associated with their correct fields once mirrored.
- [ ] The translated copy itself reads naturally (not a literal/awkward
      machine-style translation) — flag any string in
      `packages/shared/src/i18n/catalogs/ar.json` needing revision.

Screens to check:
1. SC-01 entry / language select — `/` with `?lang=ar`
2. SC-02 regime routing form
3. `/apply/[id]` — identity/details form
4. Plan selection cards
5. Quote breakdown display
6. Declaration form
7. Payment / tracker screens
8. Typing-centre consent screen (TC-02a) — `/typing-centre`

## Sign-off
| Field | Value |
|---|---|
| Reviewer name | |
| Date executed | |
| Device/browser used | |
| Result (Pass/Fail per screen) | |
| Copy revisions requested (file + key) | |
| Evidence bundle location (screenshots) | |
