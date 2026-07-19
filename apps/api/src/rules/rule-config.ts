import { PLACEHOLDER_PREFIX, type RuleId } from '@psp/shared';

/**
 * Rule-keyed configuration (CLAUDE.md §2): values marked [INSURER]/[VERIFY]/
 * [COUNSEL] in the WPs are configuration points, seeded with clearly-fake
 * PLACEHOLDER_ defaults. Values fixed by the WP text itself carry source
 * 'SPEC' with the citation. Every entry is listed in CONFIG-REGISTER.md and
 * production refuses to boot while any placeholder remains.
 */
export interface RuleConfigEntry {
  key: string;
  ruleIds: RuleId[];
  source: 'INSURER' | 'VERIFY' | 'COUNSEL' | 'SPEC';
  description: string;
  value: unknown;
}

export const defaultRuleConfig: RuleConfigEntry[] = [
  {
    key: 'UW_502_AUTO_ACCEPT_LIST',
    ruleIds: ['UW-502'],
    source: 'INSURER',
    description:
      'Conditions auto-acceptable with loading (declared conditions path) — from signed insurer annex',
    value: ['PLACEHOLDER_condition_list'],
  },
  {
    key: 'QR_001_RATE_TABLE_CURRENT_VERSION',
    ruleIds: ['QR-001', 'QR-030'],
    source: 'INSURER',
    description: 'Current versioned rate-table pointer; quotes snapshot this version',
    value: 'PLACEHOLDER_rate_table_version',
  },
  {
    key: 'UW_301_SALARY_BAND_THRESHOLD_AED',
    ruleIds: ['UW-301', 'UW-401'],
    source: 'VERIFY',
    description: 'Salary band threshold routing basic vs enhanced eligibility — re-verify against current DHA/DoH publications',
    value: 'PLACEHOLDER_salary_threshold',
  },
  {
    key: 'UW_506_LOADING_CAP_PCT',
    ruleIds: ['UW-506'],
    source: 'INSURER',
    description: 'Cumulative loading cap; above → REFER (indicative 100%)',
    value: 'PLACEHOLDER_loading_cap_pct',
  },
  {
    key: 'UW_508_DECLINE_LIST',
    ruleIds: ['UW-508'],
    source: 'INSURER',
    description: 'Declared conditions that decline (category: medical) — from signed insurer annex',
    value: ['PLACEHOLDER_decline_condition_list'],
  },
  {
    key: 'UW_207_RESTRICTED_OCCUPATIONS',
    ruleIds: ['UW-207'],
    source: 'INSURER',
    description: 'Occupations requiring referral — from signed insurer annex',
    value: ['PLACEHOLDER_occupation_list'],
  },
  {
    key: 'END_011_REFUND_TABLE',
    ruleIds: ['END-011'],
    source: 'INSURER',
    description: 'Refund basis per filed product terms (pre-registration / pro-rata / short-rate, min earned premium)',
    value: 'PLACEHOLDER_refund_table',
  },
  {
    key: 'QR_020_COMMISSION_PCT',
    ruleIds: ['QR-020'],
    source: 'INSURER',
    description: 'Insurer→licensed-entity commission % per partner agreement (indicative 5–10%)',
    value: 'PLACEHOLDER_commission_pct',
  },
  {
    key: 'QR_021_PAYOUT_TABLE',
    ruleIds: ['QR-021'],
    source: 'INSURER',
    description: 'Downstream payout table: broker % / typing-centre AED / affiliate AED — business to set',
    value: 'PLACEHOLDER_payout_table',
  },
  {
    key: 'UW_102_NAME_MATCH_THRESHOLD',
    ruleIds: ['UW-102'],
    source: 'SPEC',
    description:
      'Fuzzy-match threshold for OCR vs entered name (SC-03); engineering default, insurer may tune via annex',
    value: 0.8,
  },
  {
    key: 'PAY_003_PAYMENT_WINDOW_HOURS',
    ruleIds: ['PAY-003'],
    source: 'SPEC',
    description: 'Payment window after UW accept before the application lapses',
    value: 48,
  },
  {
    key: 'REF_010_SLA_STANDARD_UW_DAYS',
    ruleIds: ['REF-010'],
    source: 'SPEC',
    description: 'Standard underwriting referral SLA (business days)',
    value: 1,
  },
  {
    key: 'REF_010_SLA_MEDICAL_REPORT_DAYS',
    ruleIds: ['REF-010'],
    source: 'SPEC',
    description: 'Medical-report referral SLA (business days)',
    value: 3,
  },
  {
    key: 'REF_010_SLA_COMPLIANCE_DAYS',
    ruleIds: ['REF-010'],
    source: 'SPEC',
    description: 'Compliance queue SLA (business days)',
    value: 1,
  },
  {
    key: 'REF_010_SLA_EDD_DAYS',
    ruleIds: ['REF-010'],
    source: 'SPEC',
    description: 'Enhanced due diligence SLA (business days)',
    value: 2,
  },
  {
    key: 'REF_022_COUNTER_OFFER_VALIDITY_DAYS',
    ruleIds: ['REF-022'],
    source: 'SPEC',
    description: 'Counter-offer validity; expiry closes the case as lapsed',
    value: 7,
  },
  {
    key: 'J_R3_DECLINE_COOLING_DAYS',
    ruleIds: ['REF-023'],
    source: 'SPEC',
    description: 'Decline cooling period keyed to EID before re-application',
    value: 30,
  },
  {
    key: 'REF_030_REFERRAL_RATE_TARGET_PCT',
    ruleIds: ['REF-030'],
    source: 'SPEC',
    description: 'Referral-rate KPI target for Basic/EBP volume products',
    value: 10,
  },
];

/** Recursively collects string values carrying the PLACEHOLDER_ prefix. */
export function valueHasPlaceholder(value: unknown): boolean {
  if (typeof value === 'string') return value.startsWith(PLACEHOLDER_PREFIX);
  if (Array.isArray(value)) return value.some(valueHasPlaceholder);
  if (value !== null && typeof value === 'object') {
    return Object.values(value).some(valueHasPlaceholder);
  }
  return false;
}
