# WP-09 — Multi-Tenant Roles & Permissions Matrix
**Version:** 1.0 (for business review) | **Date:** 12 July 2026
**Depends on:** WP-03 | **Feeds:** WP-12; technical RBAC design
**Rule ID prefix:** TEN-xxx

---

## 1. Tenant Types & Roles

| Tenant | Roles within tenant |
|---|---|
| Platform (licensed entity) | Super-admin, Ops, Compliance officer, Finance, Support |
| Insurer/TPA partner | Underwriter, Product/rates manager, Finance, Read-only auditor |
| Broker | Broker admin, Broker agent |
| Typing centre | Centre admin, Operator |
| Affiliate | Affiliate (single role) |

## 2. Permission Principles
- **TEN-001.** Hard tenant isolation: no tenant sees another tenant's customers, applications, or commercial terms (QR-024). Enforced at data layer, not UI layer.
- **TEN-002.** Health declaration content (D1–D8/MAF answers) is visible only to: insurer underwriter role and platform compliance officer. Brokers/operators see only "declaration required/complete" status — never answers (REG-052). This is the single most important permission rule in the platform.
- **TEN-003.** Affiliates see attribution metrics and payouts only; zero access to any customer PII (WP-03 Journey D).
- **TEN-004.** Every privileged read of customer PII/health data is audit-logged (who/when/what) and reportable (REG-050 accountability).
- **TEN-005.** Payment data: nobody in any tenant sees card data (PAY-001 keeps it off-platform); payment status/reference visible to the transacting tenant and platform ops.

## 3. Permission Matrix (C=create, R=read, U=update, X=none; own = own tenant's records only)

| Capability | Platform ops | Compliance | Insurer UW | Insurer rates | Broker | TC operator | Affiliate |
|---|---|---|---|---|---|---|---|
| Applications | R all | R all | R referred | X | CRU own | CRU own | X |
| Health declarations | X | R | R | X | status only | status only | X |
| Quotes | R all | R all | R referred | R | CR own | CR own | X |
| Rate tables | R | X | X | CRU | X | X | X |
| Referral queue (UW) | R | X | CRU | X | R own status | R own status | X |
| Compliance queue | R | CRU | X | X | X | X | X |
| Policies | R all | R all | R | X | R own | R own | X |
| Endorsements/cancellations | CRU | R | approve | X | C own (request) | C own (request) | X |
| Commission/payout — own | R | X | X | X | R own | R own | R own |
| Commission terms — others' | R (all) | X | X | X | X | X | X |
| Bordereaux/recon | R | X | R | R | X | X | X |
| Tenant management | CRU | R | X | X | own users | own users | X |
| Audit logs | R | R | X | X | X | X | X |

## 4. Tenant Lifecycle
- **TEN-010.** Onboarding gates: signed sub-distribution/marketing agreement; AML training attestation (KYC-032) for brokers and typing centres; broker tenants additionally provide CBUAE licence number (verified); activation by platform ops.
- **TEN-011.** Conduct monitoring: per-tenant referral rate, decline rate, cancellation rate, declaration-mismatch findings; thresholds trigger review; suspension switch immediate-effect (in-flight applications complete, no new business).
- **TEN-012.** Offboarding: access revoked; customer records remain with the platform (customers belong to the licensed entity/insurer relationship, not the channel); payout account settled after clawback window (QR-022).
- **TEN-013.** Session controls: operator/broker sessions bind user + device; concurrent-session block for operator role; every application records the acting user ID (KYC-003).
