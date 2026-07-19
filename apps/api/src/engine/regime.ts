/**
 * Regime routing (WP-01 routing principle / UW-103 / SC-02): the emirate of
 * VISA ISSUANCE — never residence — is the master branch. Dubai visa → DHA
 * regime, Abu Dhabi visa → DoH regime, all other emirates → federal Basic
 * Health Insurance Scheme.
 */
export const EMIRATES = [
  'abu_dhabi',
  'dubai',
  'sharjah',
  'ajman',
  'umm_al_quwain',
  'ras_al_khaimah',
  'fujairah',
] as const;

export type Emirate = (typeof EMIRATES)[number];
export type Regime = 'federal' | 'dubai' | 'abu_dhabi';

export function regimeForEmirate(emirate: Emirate): Regime {
  // UW-103: buyer resident in Sharjah with a Dubai visa is routed to Dubai
  // products — the mapping depends solely on visa issuance
  if (emirate === 'dubai') return 'dubai';
  if (emirate === 'abu_dhabi') return 'abu_dhabi';
  return 'federal';
}
