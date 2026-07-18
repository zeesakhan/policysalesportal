import { describe, expect, it } from 'vitest';
import { isRtl, LOCALES, missingKeys, MissingContentKeyError, t } from './index';

describe('i18n framework (ARCHITECTURE §2)', () => {
  it('resolves seeded EN and AR content keys', () => {
    expect(t('en', 'common.continue')).toBe('Continue');
    expect(t('ar', 'common.continue')).toBe('متابعة');
  });

  it('falls back to EN for locales not yet seeded (UR/HI/BN arrive in M2-T1)', () => {
    expect(t('ur', 'common.continue')).toBe('Continue');
    expect(t('hi', 'sc01.title')).toBe(t('en', 'sc01.title'));
  });

  it('a key missing from the EN reference catalog is a defect', () => {
    expect(() => t('en', 'made.up.key')).toThrow(MissingContentKeyError);
  });

  it('AR has full parity with EN (no missing keys in seeded catalogs)', () => {
    expect(missingKeys('ar')).toEqual([]);
    expect(missingKeys('en')).toEqual([]);
  });

  it('marks Arabic-script locales as RTL', () => {
    expect(isRtl('ar')).toBe(true);
    expect(isRtl('ur')).toBe(true);
    expect(isRtl('en')).toBe(false);
    expect(isRtl('hi')).toBe(false);
    expect(isRtl('bn')).toBe(false);
  });

  it('exposes exactly the five WP-13 SC-01 languages', () => {
    expect([...LOCALES]).toEqual(['en', 'ur', 'hi', 'bn', 'ar']);
  });
});
