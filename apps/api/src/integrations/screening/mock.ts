import type { ScreeningPort, ScreeningStatus } from './port';

/**
 * Deterministic screening mock (UAT-PLAN modes). Name markers drive results:
 * 'WATCHLIST' → potential match (fuzzy), 'SANCTIONED' → confirmed match.
 * Explicit programming per name overrides the markers.
 */
export class MockScreeningAdapter implements ScreeningPort {
  constructor(private readonly responses: Record<string, ScreeningStatus> = {}) {}

  setResponse(fullName: string, status: ScreeningStatus): void {
    this.responses[fullName] = status;
  }

  async screen(input: { fullName: string }): Promise<{
    status: ScreeningStatus;
    hits?: { list: string; name: string; score: number }[];
  }> {
    const programmed = this.responses[input.fullName];
    const upper = input.fullName.toUpperCase();
    const status: ScreeningStatus =
      programmed ??
      (upper.includes('SANCTIONED')
        ? 'confirmed_match'
        : upper.includes('WATCHLIST')
          ? 'potential_match'
          : 'clear');
    if (status === 'clear') return { status };
    return {
      status,
      hits: [
        {
          list: 'UN_CONSOLIDATED',
          name: input.fullName,
          score: status === 'confirmed_match' ? 1 : 0.82,
        },
      ],
    };
  }
}
