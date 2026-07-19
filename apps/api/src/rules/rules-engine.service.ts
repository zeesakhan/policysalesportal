import type { RuleId } from '@psp/shared';
import { PlaceholderConfigError } from '../config/placeholder-guard';
import { valueHasPlaceholder, type RuleConfigEntry } from './rule-config';

/**
 * Single rules-engine config service (ARCHITECTURE §1): configuration-driven
 * values keyed by rule ID, evaluated/consumed by one service so business
 * values marked [INSURER] are changeable without redeploying code.
 */
export class RulesEngine {
  private readonly byKey = new Map<string, RuleConfigEntry>();

  constructor(entries: RuleConfigEntry[]) {
    for (const entry of entries) {
      if (this.byKey.has(entry.key)) throw new Error(`duplicate rule config key: ${entry.key}`);
      this.byKey.set(entry.key, entry);
    }
  }

  entries(): RuleConfigEntry[] {
    return [...this.byKey.values()];
  }

  get<T = unknown>(key: string): T {
    const entry = this.byKey.get(key);
    if (!entry) throw new Error(`unknown rule config key: ${key}`);
    return entry.value as T;
  }

  /** All entries citing a rule ID — the spec→config traceability direction. */
  forRuleId(ruleId: RuleId): RuleConfigEntry[] {
    return this.entries().filter((e) => e.ruleIds.includes(ruleId));
  }

  /**
   * Numeric accessor with a development fallback: [INSURER] values are seeded
   * as PLACEHOLDER_ strings; outside production the engine runs on the given
   * dev default so the journey works end-to-end on mocks. In production a
   * placeholder never survives boot (assertProductionReady), so the fallback
   * can never leak into prod behaviour.
   */
  getNumber(key: string, devDefault: number, env = process.env.NODE_ENV): number {
    const value = this.get(key);
    if (typeof value === 'number') return value;
    if (valueHasPlaceholder(value) && env !== 'production') return devDefault;
    throw new Error(`rule config ${key} is not numeric`);
  }

  placeholderKeys(): string[] {
    return this.entries()
      .filter((e) => valueHasPlaceholder(e.value))
      .map((e) => e.key)
      .sort();
  }

  /**
   * Production startup gate over rule config (CLAUDE.md §2), complementing the
   * environment-variable guard: refuses production boot while any rule value
   * still carries a PLACEHOLDER_ marker.
   */
  assertProductionReady(env: string | undefined): void {
    if (env !== 'production') return;
    const keys = this.placeholderKeys();
    if (keys.length > 0) throw new PlaceholderConfigError(keys);
  }
}
