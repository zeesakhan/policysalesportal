/**
 * Sanctions screening engine port (INT-03, lists via INT-G4: UN Consolidated
 * + UAE Local Terrorist List — KYC-010). Real vendor adapter is M5-T1.
 */
export type ScreeningStatus = 'clear' | 'potential_match' | 'confirmed_match';

export interface ScreeningPort {
  screen(input: { fullName: string; nationality?: string }): Promise<{
    status: ScreeningStatus;
    hits?: { list: string; name: string; score: number }[];
  }>;
}
