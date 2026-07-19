import ar from './catalogs/ar.json';
import bn from './catalogs/bn.json';
import en from './catalogs/en.json';
import hi from './catalogs/hi.json';
import ur from './catalogs/ur.json';

/**
 * i18n framework (ARCHITECTURE §2): EN/UR/HI/BN/AR content keys from day one;
 * hardcoded customer-facing strings are a defect. All five catalogs are
 * seeded (M2-T1); new keys fall back to EN until translated.
 */
export const LOCALES = ['en', 'ur', 'hi', 'bn', 'ar'] as const;
export type Locale = (typeof LOCALES)[number];

export type Catalog = Record<string, string>;

// NOTE: ARCHITECTURE §2 marks AR as RTL. Urdu is written in an Arabic-derived
// script and is also RTL as a matter of script direction (technical property,
// not a business rule) — flagged in PROGRESS.md as a candidate WP amendment.
const RTL_LOCALES: readonly Locale[] = ['ar', 'ur'];

export const catalogs: Partial<Record<Locale, Catalog>> = {
  en: en as Catalog,
  ur: ur as Catalog,
  hi: hi as Catalog,
  bn: bn as Catalog,
  ar: ar as Catalog,
};

export function isRtl(locale: Locale): boolean {
  return RTL_LOCALES.includes(locale);
}

export class MissingContentKeyError extends Error {
  constructor(key: string) {
    super(`unknown content key: ${key}`);
    this.name = 'MissingContentKeyError';
  }
}

/**
 * Resolves a content key for a locale, falling back to EN (the reference
 * catalog). A key absent from EN is a defect and throws.
 */
export function t(locale: Locale, key: string): string {
  const reference = (en as Catalog)[key];
  if (reference === undefined) throw new MissingContentKeyError(key);
  return catalogs[locale]?.[key] ?? reference;
}

/** Keys present in the EN reference catalog but missing from `locale`. */
export function missingKeys(locale: Locale): string[] {
  const catalog = catalogs[locale];
  if (!catalog) return Object.keys(en);
  return Object.keys(en).filter((key) => catalog[key] === undefined);
}
