/**
 * Emirates ID validation (UW-102): 15 digits, 784 prefix, birth-year segment,
 * Luhn check digit. Format: 784-YYYY-NNNNNNN-C (dashes optional on input).
 */
export function normalizeEid(input: string): string {
  return input.replace(/[ -]/g, '');
}

export function eidChecksumValid(input: string): boolean {
  const digits = normalizeEid(input);
  if (!/^784\d{12}$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/** Formats a normalized EID for display: 784-YYYY-NNNNNNN-C. */
export function formatEid(input: string): string {
  const d = normalizeEid(input);
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7, 14)}-${d.slice(14)}`;
}

/**
 * Simple normalized similarity for OCR-vs-entered name fuzzy match (SC-03).
 * 1 = identical after normalization; 0 = nothing in common.
 */
export function nameSimilarity(a: string, b: string): number {
  const na = a.trim().toLowerCase().replace(/\s+/g, ' ');
  const nb = b.trim().toLowerCase().replace(/\s+/g, ' ');
  if (na === nb) return 1;
  const dist = levenshtein(na, nb);
  const max = Math.max(na.length, nb.length);
  return max === 0 ? 1 : 1 - dist / max;
}

function levenshtein(a: string, b: string): number {
  const prev = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!;
      prev[j] = Math.min(
        prev[j]! + 1,
        prev[j - 1]! + 1,
        diag + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diag = tmp;
    }
  }
  return prev[b.length]!;
}
