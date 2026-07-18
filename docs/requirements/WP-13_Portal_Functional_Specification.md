# WP-13 — Portal Functional Specification: Screens, Inputs & Segregation
**Version:** 1.0 (for business review) | **Date:** 12 July 2026
**Depends on:** WP-03, WP-04, WP-05, WP-09 | **Feeds:** WP-12 (UAT), UI/UX design, technical build
**ID prefixes:** SC-xx (Sales screens), TC-xx (Typing centre), BR-xx (Broker), IN-xx (Insurer/TPA), AD-xx (Platform admin), INT-xx (Integrations)

---

## 1. Portal Architecture — One Engine, Five Skins

There is **one application engine** (identity → routing → capture → quote → declaration → UW → payment → issuance). Each portal embeds the same engine screens with channel-specific wrappers and permissions (WP-09). This is the most important build decision in this document: never build four separate application flows — build one, parameterised by channel, or the underwriting rules will drift between channels.

| Portal | Users | Wrapper around the engine |
|---|---|---|
| Sales portal (public) | Customer | Marketing pages, language, self-service account |
| Typing centre portal | Centre admin, Operator | Consent capture, print, desk workflow, payout view |
| Broker portal | Broker admin, Agent | Client book, bulk tools, commission view |
| Insurer/TPA portal | Underwriter, Rates manager, Finance, Auditor | Referral queue, product/rate config, registration ops, bordereaux |
| Platform admin portal | Super-admin, Ops, Compliance, Finance, Support | Tenants, users, approvals, monitoring, audit |

---

## 2. The Application Engine — Screen by Screen (SC-xx)

Convention per screen: **Purpose → Inputs (field / type / mandatory / validation / why) → System actions → Exits.** Rule IDs cite WP-04/05/06/07.

### SC-01 — Entry & Language
**Purpose:** attribution + comprehension.
| Field | Type | M | Validation / source | Why |
|---|---|---|---|---|
| Channel/tenant/affiliate code | Hidden | Auto | From URL/session | Attribution & payouts (QR-023) |
| Language | Select (EN/UR/HI/BN/AR) | Y | — | Segment literacy (WP-01 §4) |
| Privacy consent | Checkbox + link | Y | Timestamped consent record | PDPL lawful basis (REG-050) |
**Exit:** → SC-02.

### SC-02 — Regime Routing
**Purpose:** the master branch (WP-01 routing principle).
| Field | Type | M | Validation | Why |
|---|---|---|---|---|
| Emirate of visa issuance | Visual picker (7 emirates + "I don't know") | Y | If "don't know" → guided help showing where it appears on visa/EID | Determines regime, product set, eligibility, registration platform (UW-103) |
| Visa status | Select: Active / In process / Visit-tourist | Y | Visit → block for mandatory products (UW-101) | Eligibility gate |
**System:** sets regime = Federal Basic / Dubai / Abu Dhabi. **Exit:** → SC-03; visit visa → decline screen SC-14.

### SC-03 — Applicant Identity
**Purpose:** KYC anchor.
| Field | Type | M | Validation | Why |
|---|---|---|---|---|
| Emirates ID | Chip read (card reader, INT-G2) / camera scan → OCR / manual 15-digit | Y* | Checksum + format (UW-102), then **real-time ICP Validation Gateway check** (INT-G1): genuine + active + data match; ICP fail/expired → REFER (identity) | Identity, dedupe key (UW-105), screening input (KYC-001); ICP validation is the authoritative identity control — OCR alone never sufficient |
| Full name (EN) | Text (OCR-prefilled) | Y | Fuzzy match vs OCR ≥ threshold, else REFER flag | Policy & registration accuracy |
| DOB | Date (OCR-prefilled) | Y | Age computed at start date (UW-104) | Drives every age rule |
| Gender | Select (OCR-prefilled) | Y | — | Rating dimension; maternity rules (UW-306) |
| Nationality | Select (OCR-prefilled) | Y | ISO list | Screening + insurer statistics |
| Passport no. | Text | Y if no EID | Format by nationality | New-arrival path (KYC-002) |
| Visa file / UID no. | Text | Y if no EID | Format check | Links to residence permit; supports later EID endorsement |
*No-EID path: passport + visa mandatory, EID endorsement task auto-created (END-002a).
**System:** duplicate check on EID (UW-105); sanctions screening fires here asynchronously (KYC-011 — early, so the result is ready before quote acceptance). **Exit:** → SC-04.

### SC-04 — Applicant Details & Sponsor Context
**Purpose:** category, contactability, and the sponsor logic you asked about.
| Field | Type | M | Validation | Why |
|---|---|---|---|---|
| Mobile (UAE) | Phone + OTP verify | Y | OTP is the attestation identity for the whole journey (UW-108) | Delivery channel; assisted-journey control |
| Email | Text | N | Format | Secondary delivery |
| Employment category | Select: Private employee / Domestic worker / Self-sponsored / Freelancer / Dependent (not working) | Y | Drives UW-204 (federal population), UW-301/401 (band tracks) | Scheme population rules |
| **Sponsor type** | Select: Employer / Self / Family member | Y | If Employer → employer name + trade-licence-emirate; if Family → sponsor name + relationship + sponsor EID | Regime obligations differ: AD employer must cover spouse+3 children (UW-402); Dubai sponsor insures dependents (UW-307); payer≠insured logging (KYC-004) |
| Monthly salary band | Select bands (e.g., <4k / 4–10k / >10k) | Y where regime needs | Attestation checkbox (UW-302) | EBP vs enhanced routing (UW-301); AD Basic banding (UW-401) |
| Occupation | Searchable list | Y | Insurer restricted list check (UW-207) | Occupation referrals |
| Emirate of residence | Select | Y | Informational if ≠ visa emirate | Network/geo analytics; NOT used for regime (UW-103) |
**Exit:** → SC-05 if buyer indicates dependents, else → SC-06.

### SC-05 — Dependents Capture
**Purpose:** multi-life applications; each dependent is a separate insured life through UW-1xx.
Per dependent (repeatable card):
| Field | Type | M | Validation | Why |
|---|---|---|---|---|
| Relationship | Select: Spouse / Child / Parent / Other | Y | AD sponsored-children: child <18 validation (UW-404); Dubai newborn ≤30-day notice (REG-024) | Regime dependent categories |
| EID / passport+visa | Same as SC-03 | Y | Same validations, own screening | Each life is screened & rated individually |
| DOB / gender / nationality | As SC-03 | Y | Child/adult band checks | Per-life rating (QR-006) |
**System:** AD regime + employer sponsor → display sponsor-obligation notice with acknowledgement (UW-402). **Exit:** → SC-06.

### SC-06 — Plan Selection & Quotation
**Purpose:** THE quote-generation point — and the answer to "when to generate quotation":
- **Community-rated products (Federal Basic, EBP base, AD Basic): the final quote generates HERE**, before any health questions, because no medical rating applies (UW-206/304/403). Fastest possible path for the volume segment.
- **Enhanced plans: an *indicative* quote generates here** (age/plan/network/co-pay based); it is labelled indicative because declarations may add loadings (UW-506). The *final* quote regenerates after SC-07/UW decision.
| Element | Detail |
|---|---|
| Plan cards | Max 3 side-by-side, identical benefit rows (QR-011); regime-filtered catalogue only |
| Options | Network tier, co-pay level, maternity option (enhanced only) — each re-rates live |
| Quote display | Itemised: base + loadings + fees + VAT = total (QR-003); insurer name, licence line, validity 14 days (QR-005, QR-010); price-first layout (QR-012) |
| Promo code | Optional; validates against insurer campaign only (QR-004) |
**System:** quote record created with ID + snapshot of rate-table version. **Exit:** community-rated → SC-08; enhanced → SC-07.

### SC-07 — Health Declaration (conditional)
**Purpose:** D1–D8 short-form (WP-04 §6); answered by the insured person, per life.
| Element | Detail |
|---|---|
| D1–D8 questions | Yes/No toggles, plain language, per insured life; any Yes expands condition detail sub-form (condition, since when, medication, hospitalisation) |
| Full MAF | Auto-presented only for Yes answers not on the auto-accept list (UW-502) |
| Sensitive-data consent | Explicit, separate from SC-01 consent (REG-050) |
| Attestation | OTP to the insured's own mobile — in assisted journeys the operator may translate but never answer (JB-06 control) |
**System:** rules evaluate → clean (UW-501) / auto-load (re-rate, show new itemised premium) / REFER (case to queue, WP-08) / decline-list (SC-14). **Exit:** → SC-08, or SC-13 (referral status), or SC-14.

### SC-08 — Review & Attestation
**Purpose:** contract-quality evidence before money.
Displays: applicant + dependents summary, plan + final premium, declarations summary (answers visible only to the customer, never to operator screen — TEN-002), key exclusions, cooling-off/cancellation terms (REG-063). Action: confirm via OTP (UW-108). **Exit:** → SC-09.

### SC-09 — Payment
**Purpose:** direct-to-insurer money movement (REG-002/PAY-001).
Redirect/embed of insurer gateway or "send payment link to my phone" (assisted mode). Portal shows payment-pending state, listens for webhook. 48-hour window (PAY-003). **Exit:** success → SC-10; fail → retry (max 3, PAY-005).

### SC-10 — Issuance & Activation Status
**Purpose:** the three-state tracker the customer actually cares about: **Paid → Policy issued → Active & registered (visa-ready)** (PAY-022). Failure path shows "processing — no action needed" (PAY-023). Delivery of policy pack per PAY-024. **Exit:** → SC-11.

### SC-11 — My Policies (servicing)
Policy list, documents download, endorsement requests (END-002 catalogue as guided forms), cancellation with computed refund + visa warning (END-011/012), renewal one-tap (END-020).

### SC-12 — Save & Resume
Any screen → save; resume link via WhatsApp OTP; 14-day retention (J-R2).

### SC-13 — Referral Status
Case reference, expected decision date (REF-010 SLA), info-request upload area, counter-offer acceptance flow with OTP (REF-021).

### SC-14 — Decline / Block
Reason category only (J-R4); regime-compliant alternative offered where applicable (REF-023).

---

## 3. Typing Centre Portal (TC-xx)

| Screen | Content & why |
|---|---|
| TC-01 Dashboard | Today's applications by state; pending payments; print queue; announcements |
| TC-02 New Application | Launches engine SC-02→ with operator context; **TC-02a Consent screen first**: customer-language consent text + OTP to customer phone; consent artifact stored (JB-02) |
| TC-03 Application List | Own centre's applications; state filters; resume; payment-link resend; **no declaration content ever** (TEN-002) |
| TC-04 Print & Delivery | Policy pack print after "Active & registered" only; reprint logged |
| TC-05 Payout Statement | Accrued/paid/clawed per policy (QR-021/022); own centre only |
| TC-06 Users (centre admin) | Add/deactivate operators; each operator = named individual, no shared logins (TEN-013) |

## 4. Broker Portal (BR-xx)

| Screen | Content & why |
|---|---|
| BR-01 Dashboard | Pipeline by state, referral cases awaiting insurer, renewals due in 60 days |
| BR-02 Client Book | Broker's own clients (CRU own — TEN-001); client file = person + policies + documents |
| BR-03 New Application | Engine embedded; declaration link goes to insured's phone (JC-05); broker sees status only |
| BR-04 Quote Workspace | Comparison view; client-facing quote PDF (commission hidden); commission-inclusive internal view toggle by role |
| BR-05 Bulk Intake | CSV upload of lives → per-life validation report → each life still individually screened/rated; failed rows returned with reasons |
| BR-06 Referral Tracker | Own cases: state, SLA countdown, info-request upload on client's behalf (documents only, not declarations) |
| BR-07 Commission Statements | Accruals on issued+registered only (QR-021); clawback lines explicit |
| BR-08 Users (broker admin) | Agent management; agent sees own clients or branch book per admin setting |

## 5. Insurer / TPA Portal (IN-xx)

| Screen | Content & why |
|---|---|
| IN-01 Referral Queue | Both-queue visibility for UW roles (underwriting only — compliance queue stays platform-side, REF-001); case view = application snapshot + triggering rule IDs + documents; actions: Accept / Accept-with-terms (loading %, exclusion text → generates counter-offer) / Decline (reason category + internal rationale) (REF-020–024) |
| IN-02 Product Designer | **How plans are added/configured:** create product → regime tag (Federal/Dubai-EBP/Dubai-enhanced/AD-Basic/AD-enhanced) → benefit schedule rows → exclusions → network mapping → declaration requirement flag → status Draft→Submitted→**Platform-approved→Live** (AD-04 approval gate). Products are versioned; live version immutable |
| IN-03 Rate Table Manager | Upload/edit matrix (age band × plan × network × co-pay × maternity × emirate); effective-date ranges; version history; in-flight quote protection explained on publish (QR-001/QR-030) |
| IN-04 Loading & Decline Lists | Auto-accept conditions with loading %; decline-list conditions; loading cap (UW-502/506/508) — these ARE the [INSURER] annex, maintained as configuration |
| IN-05 Campaign Manager | Discount campaigns: code, %/amount, validity, product scope — the only source of discounts (REG-005/QR-004) |
| IN-06 Registration Ops | Issued-not-registered queue (PAY-023); retry; regime-platform error codes; SLA clock |
| IN-07 Bordereaux & Recon | Generate/download bordereau (MIS §2); commission payable view with 10-day aging (REG-004) |
| IN-08 Auditor (read-only) | Cross-screen read access, zero actions |

## 6. Platform Admin Portal (AD-xx)

| Screen | Content & why |
|---|---|
| AD-01 Tenant Manager | Create/suspend/offboard tenants; onboarding gate checklist (agreement, AML attestation, broker licence no. verification) (TEN-010–012) |
| AD-02 User & Role Manager | All-tenant user admin; role assignment strictly from WP-09 matrix; MFA enforcement for privileged roles; session policy (TEN-013) |
| AD-03 Compliance Workbench | Compliance queue (KYC-012), EDD cases (KYC-020), whitelist notes, DSAR extract (MIS-011), goAML escalation record |
| AD-04 Product Approval | Insurer-submitted products/rates reviewed for REG-060 content completeness before Live |
| AD-05 Conduct Monitor | Per-tenant referral/decline/cancellation/mismatch dashboards with thresholds (TEN-011); suspension switch |
| AD-06 Content & Language | Journey text, notices, WhatsApp/notification templates in all languages; regulatory notices (UW-402, END-012) version-controlled |
| AD-07 Audit Log Viewer | Every event searchable by EID/policy/user/date (J-R1, TEN-004, MIS-010) |
| AD-08 Exceptions Dashboard | Three-way-match orphans (PAY-030/MIS-002) |

## 7. Integrations (INT-xx)

### 7.1 Government Integrations (INT-G) — required

| # | Integration | Purpose in the journey | Where it fires | Prerequisite |
|---|---|---|---|---|
| INT-G1 | **ICP Validation Gateway** | Real-time validation that the Emirates ID is genuine, active and matches the presented person data (number ↔ name ↔ DOB ↔ nationality); card-status check (valid/expired/cancelled) | SC-03 (applicant), SC-05 (each dependent) — validation result stored on the application; a failed/expired ICP result → REFER (identity) instead of proceeding on OCR data alone | ICP cooperation contract + service-provider onboarding (test env → go-live). **[ACTION: apply early — onboarding lead time gates the launch]** |
| INT-G2 | **ICP Emirates ID SDK + smart-card readers** | Chip read of the physical EID at typing-centre desks — highest-assurance capture (beats OCR); public-data read populates SC-03/SC-05 fields directly from the card | TC-02 assisted applications; card-reader present = chip read mandatory, OCR is the fallback | Same ICP onboarding; PC/SC-compatible readers at each desk |
| INT-G3 | **MOHRE work-permit validation** | Confirms applicant's private-sector-employee / domestic-worker status and employer identity for federal Basic Scheme population eligibility (UW-204); replaces pure self-declaration for the scheme's category test | SC-04 category check when regime = Federal Basic | Access model to be confirmed — direct service access or via the scheme insurer's channel **[VERIFY during ICP/MOHRE onboarding]** |
| INT-G4 | **EOCN sanctions lists + goAML** | Automated ingestion of UAE Local Terrorist List updates (screening currency, KYC-010/011) and STR filing channel (KYC-031/REG-042) | Screening engine list-feed (continuous); goAML used by compliance officer on escalation | goAML registration of the licensed entity (mandatory); EOCN list subscription |
| INT-G5 | **Regime registration platforms — DHA (ISAHD/UMIS), DoH, federal scheme** | Policy registration that makes coverage visa-recognised (PAY-022) | S9 issuance step | Registration is executed under **insurer/TPA credentials** (they are the credentialed parties); the portal integrates to the *insurer's* registration status API/webhooks. If the chosen licensing structure (D-06) gives the entity its own platform credentials (e.g., DHA intermediary access), a direct lane can be added as an annex |
| INT-G6 | **ICP visa-status recognition** | The customer's "visa-ready" state (SC-10) | Derived from INT-G5 confirmation — no separate ICP polling needed in v1; direct visa-status lookup can be added later as a UX enhancement once the ICP contract (INT-G1) is live | Covered by INT-G1 contract scope discussion |
| INT-G7 | UAE PASS | Digital identity login/signing for self-service users | Phase 2: SC-03 alternative for smartphone users | UAE PASS service-provider onboarding |

**Government integration principle (corrected):** *identity, category and AML validation are the portal's own direct government integrations* (INT-G1–G4) — they must fire before quote acceptance so no policy is ever sold on unvalidated identity. *Policy registration* (INT-G5) runs under the credentials of whichever party the licensing structure makes the credentialed intermediary — insurer/TPA by default, the platform entity where permits allow.

### 7.2 Commercial & Technical Integrations

| # | Integration | Verdict | Why |
|---|---|---|---|
| INT-01 | **Insurer policy-admin API** (quote-confirm, issue, endorse, cancel, status webhooks) | **NEEDED — the backbone** | REG-003: only the insurer issues |
| INT-02 | **Insurer payment gateway / payment links** | **NEEDED** | REG-002 direct-to-insurer; keeps portal out of PCI and fund-handling |
| INT-03 | **Sanctions screening engine** | NEEDED | KYC-010; consumes INT-G4 lists + UN Consolidated List |
| INT-04 | **WhatsApp Business API + SMS OTP** | NEEDED | Delivery + attestation spine (UW-108, PAY-024) |
| INT-05 | **EID OCR/scan SDK (mobile)** | NEEDED | SC-03 self-service capture; chip read (INT-G2) supersedes it wherever a reader exists |
| INT-08 | eClaimLink | NOT needed | Claims are insurer/TPA remit (WP-01 §7) |
| INT-10 | Salary/employer verification beyond INT-G3 | NOT in v1 | MOHRE validation covers the scheme category; salary band stays attestation-based (UW-302) for banding only |
| INT-11 | Email + push notification service | NEEDED (secondary) | S10/S11 delivery |
| INT-12 | Accounting export (commission/payout ledgers) | NEEDED (simple) | Feeds finance from MIS ledgers |

## 8. Cross-Portal User Management Model (summary)

- One identity service, tenant-scoped directories; roles exactly per WP-09 matrix — no custom roles in v1 (role sprawl is how health-data leaks happen).
- Privileged roles (compliance, UW, rates, super-admin): MFA mandatory, session timeout 15 min.
- Operator/agent roles: named individuals, device binding, no concurrent sessions (TEN-013).
- Every screen in this document declares its role access from the WP-09 matrix; any screen not mapped = not built.

## 9. Items Deliberately Excluded (with reasons)
1. **"Agent" as a separate portal** — agents exist as a *role inside the broker tenant* (BR-08), not a separate portal; a standalone agent portal would recreate the licensing question of REG-006.
2. **Portal-side premium wallet/collection screens** — prohibited design (REG-002).
3. **Claims screens / eClaimLink** — out of scope v1 (WP-01 §7); IN-xx deliberately contains no claims module.
4. **Salary verification services beyond MOHRE** — category validation is government-verified (INT-G3); salary *band* remains attestation-based in v1 (UW-302).

*(Correction note: an earlier draft of this document excluded direct ICP/MOHRE integration. That was wrong — it conflated policy registration with identity/category validation. ICP Validation Gateway, EID SDK, MOHRE validation and EOCN/goAML are direct government integrations required in v1; see §7.1.)*
