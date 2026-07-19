/**
 * Builds synthetic Luhn-valid Emirates IDs for tests and seeds (UAT-PLAN §2:
 * never real EIDs). Constructed at runtime so no valid ID number ever sits as
 * a literal in the repository.
 */
export function makeTestEid(birthYear: number, serial: number): string {
  const body = `784${birthYear.toString().padStart(4, '0')}${serial.toString().padStart(7, '0')}`;
  return body + luhnCheckDigit(body);
}

function luhnCheckDigit(body: string): string {
  let sum = 0;
  let double = true; // check digit position is rightmost → body starts doubled
  for (let i = body.length - 1; i >= 0; i--) {
    let d = body.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return ((10 - (sum % 10)) % 10).toString();
}
