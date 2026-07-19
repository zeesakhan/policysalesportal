import { describe, expect, it } from 'vitest';
import { isRtl, LOCALES, missingKeys, MissingContentKeyError, t } from './index';

describe('i18n framework (ARCHITECTURE §2)', () => {
  it('resolves seeded EN and AR content keys', () => {
    expect(t('en', 'common.continue')).toBe('Continue');
    expect(t('ar', 'common.continue')).toBe('متابعة');
  });

  it('all five locales resolve seeded keys in their own language', () => {
    expect(t('ur', 'common.continue')).toBe('جاری رکھیں');
    expect(t('hi', 'common.continue')).toBe('आगे बढ़ें');
    expect(t('bn', 'common.continue')).toBe('এগিয়ে যান');
  });

  it('a key missing from the EN reference catalog is a defect', () => {
    expect(() => t('en', 'made.up.key')).toThrow(MissingContentKeyError);
  });

  it('every locale has full parity with the EN reference catalog', () => {
    for (const locale of LOCALES) {
      expect(missingKeys(locale)).toEqual([]);
    }
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
