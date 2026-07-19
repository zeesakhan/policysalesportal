import { describe, expect, it } from 'vitest';
import { PlaceholderConfigError } from '../config/placeholder-guard';
import { renderConfigRegister } from './config-register';
import { defaultRuleConfig, valueHasPlaceholder } from './rule-config';
import { RulesEngine } from './rules-engine.service';

describe('rules-engine config service (CLAUDE.md §2, ARCHITECTURE §1)', () => {
  const engine = new RulesEngine(defaultRuleConfig);

  it('resolves spec-fixed values by key', () => {
    expect(engine.get<number>('PAY_003_PAYMENT_WINDOW_HOURS')).toBe(48);
    expect(engine.get<number>('REF_022_COUNTER_OFFER_VALIDITY_DAYS')).toBe(7);
    expect(engine.get<number>('J_R3_DECLINE_COOLING_DAYS')).toBe(30);
  });

  it('rejects unknown keys instead of returning undefined', () => {
    expect(() => engine.get('UW_999_MADE_UP')).toThrow(/unknown rule config key/);
  });

  it('traces config entries back to rule IDs', () => {
    const entries = engine.forRuleId('REF-010');
    expect(entries.map((e) => e.key)).toContain('REF_010_SLA_EDD_DAYS');
    expect(entries).toHaveLength(4);
  });

  it('detects placeholders anywhere in a value (strings, arrays, objects)', () => {
    expect(valueHasPlaceholder('PLACEHOLDER_x')).toBe(true);
    expect(valueHasPlaceholder(['a', 'PLACEHOLDER_x'])).toBe(true);
    expect(valueHasPlaceholder({ nested: { v: 'PLACEHOLDER_x' } })).toBe(true);
    expect(valueHasPlaceholder(48)).toBe(false);
    expect(valueHasPlaceholder(['clean'])).toBe(false);
  });

  it('lists the [INSURER]/[VERIFY] seeded placeholders', () => {
    expect(engine.placeholderKeys()).toEqual([
      'QR_001_RATE_TABLE_CURRENT_VERSION',
      'UW_207_RESTRICTED_OCCUPATIONS',
      'UW_301_SALARY_BAND_THRESHOLD_AED',
      'UW_502_AUTO_ACCEPT_LIST',
      'UW_506_LOADING_CAP_PCT',
      'UW_508_DECLINE_LIST',
    ]);
  });

  it('getNumber returns dev defaults for placeholders outside production only', () => {
    expect(engine.getNumber('UW_506_LOADING_CAP_PCT', 100, 'development')).toBe(100);
    expect(engine.getNumber('PAY_003_PAYMENT_WINDOW_HOURS', 99, 'development')).toBe(48);
    expect(() => engine.getNumber('UW_506_LOADING_CAP_PCT', 100, 'production')).toThrow(
      /not numeric/,
    );
  });

  it('refuses production boot while rule placeholders remain; allows dev/uat', () => {
    expect(() => engine.assertProductionReady('production')).toThrow(PlaceholderConfigError);
    expect(() => engine.assertProductionReady('development')).not.toThrow();
    expect(() => engine.assertProductionReady(undefined)).not.toThrow();
  });

  it('allows production once every placeholder is resolved', () => {
    const resolved = new RulesEngine(
      defaultRuleConfig.map((e) => ({
        ...e,
        value: valueHasPlaceholder(e.value) ? 'resolved-by-signed-annex' : e.value,
      })),
    );
    expect(() => resolved.assertProductionReady('production')).not.toThrow();
  });

  it('rejects duplicate keys at construction', () => {
    expect(() => new RulesEngine([...defaultRuleConfig, defaultRuleConfig[0]!])).toThrow(
      /duplicate/,
    );
  });
});

describe('CONFIG-REGISTER renderer', () => {
  it('lists every key with status and placeholder count', () => {
    const md = renderConfigRegister(defaultRuleConfig, new Date('2026-07-18T00:00:00Z'));
    for (const entry of defaultRuleConfig) {
      expect(md).toContain(`\`${entry.key}\``);
    }
    expect(md).toContain('Placeholders remaining: **6**');
    expect(md).toContain('**PLACEHOLDER**');
    // resolved values are printed; placeholders are not leaked as values
    expect(md).toContain('`48`');
  });
});
