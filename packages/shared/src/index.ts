/**
 * Config values seeded with this prefix are unresolved business/config gates
 * (CLAUDE.md §2). The API refuses to start in production while any remain.
 */
export const PLACEHOLDER_PREFIX = 'PLACEHOLDER_';

/**
 * Rule-ID families from the WP requirements suite (CLAUDE.md §1). Every
 * implemented rule cites one of these IDs in code, config, tests and audit
 * events. Populated per-rule from M0-T4 onward.
 */
export type RuleIdPrefix = 'REG' | 'UW' | 'QR' | 'KYC' | 'PAY' | 'REF' | 'TEN' | 'END' | 'MIS';

export type RuleId = `${RuleIdPrefix}-${number}${string}`;

export * from './i18n';
