import { describe, expect, it } from 'vitest';
// @ts-expect-error plain-JS CI script without type declarations
import { findPanCandidates, luhnValid } from './check-pan-patterns.mjs';

// PANs are constructed at runtime so this spec file itself stays clean under
// the repo-wide scan the script performs in CI.
const visaTestPan = ['4111', '1111', '1111', '1111'].join('');
const amexTestPan = ['3782', '822463', '10005'].join('');

describe('PAN-pattern check (ARCHITECTURE §2 / PAY-001)', () => {
  it('validates Luhn correctly', () => {
    expect(luhnValid(visaTestPan)).toBe(true);
    expect(luhnValid('1234567890123456')).toBe(false);
  });

  it('catches bare, spaced and dashed PANs', () => {
    expect(findPanCandidates(`card=${visaTestPan}`)).toHaveLength(1);
    expect(findPanCandidates(['4111', '1111', '1111', '1111'].join(' '))).toHaveLength(1);
    expect(findPanCandidates(['4111', '1111', '1111', '1111'].join('-'))).toHaveLength(1);
    expect(findPanCandidates(`amex ${amexTestPan} in a fixture`)).toHaveLength(1);
  });

  it('passes clean text, non-Luhn digit runs and ordinary identifiers', () => {
    expect(findPanCandidates('policy PSP-2026-000123 issued')).toHaveLength(0);
    expect(findPanCandidates('digits 1234567890123456 fail luhn')).toHaveLength(0);
    expect(findPanCandidates('an Emirates ID is 784-XXXX-XXXXXXX-X masked')).toHaveLength(0);
    // zero-filled UUIDs are repeated-digit runs, never PANs
    expect(findPanCandidates('id 00000000-0000-0000-0000-000000000001')).toHaveLength(0);
  });
});
