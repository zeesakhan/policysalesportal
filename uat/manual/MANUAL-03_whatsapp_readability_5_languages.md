# Manual UAT Script 03 — WhatsApp Message Readability in All 5 Languages

**Covers:** PAY-024 policy pack delivery, S10 delivery, WP-01 §4 Phase-1
languages (EN/UR/HI/BN/AR).
**Rule IDs:** PAY-024, REG-061.
**Why manual:** `apps/api/src/engine/delivery.service.ts` proves
*structurally* that `deliverPolicyPack` sends via the WhatsApp adapter with
the application's stored language and attaches the four policy-pack
documents (`delivery.service.spec.ts`), and the mock adapter records every
call. What it cannot verify is how the actual message renders inside the
real WhatsApp Business app — line wrapping, emoji/RTL rendering inside a chat
bubble, whether attachments preview correctly, whether the message is flagged
as spam by WhatsApp's template review.

**Status: NOT YET EXECUTED** — requires the real WhatsApp Business API
integration (M5-T1, gated on credentials/template approval) and native
speakers of each language to review actual delivered messages.

## Pre-requisites
- [ ] WhatsApp Business API adapter connected to a sandbox/test number
      (real adapter, not the mock — this script tests the real channel)
- [ ] WhatsApp message templates submitted and approved by Meta for each
      of the 5 languages
- [ ] Test recipient phone numbers with WhatsApp installed
- [ ] Native/fluent reviewers for each of UR, HI, BN, AR (EN reviewed by
      any team member)

## Steps & Evidence Checklist
For each of the 5 languages, run a policy through to delivery
(`deliverPolicyPack`) with an application whose `language` field is set to
that locale, then on the receiving device:
- [ ] Message arrives within a reasonable time of the API call.
- [ ] Text renders correctly (no mojibake / missing glyphs / boxes for
      unsupported characters).
- [ ] RTL languages (AR) display correctly within the chat bubble.
- [ ] Attachments (policy schedule, e-card, receipt, benefit summary)
      download and open correctly from the chat.
- [ ] Message is not flagged/hidden as suspicious by WhatsApp.
- [ ] A native speaker confirms the message reads naturally and the
      policy number / key facts are unambiguous.

## Sign-off
| Language | Reviewer | Date | Result | Notes |
|---|---|---|---|---|
| EN | | | | |
| UR | | | | |
| HI | | | | |
| BN | | | | |
| AR | | | | |
