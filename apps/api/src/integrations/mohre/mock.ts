import type { MohrePort } from './port';

/** Deterministic MOHRE mock (UAT modes: match / no-record). Default match. */
export class MockMohreAdapter implements MohrePort {
  constructor(private readonly noRecord: Set<string> = new Set()) {}

  setNoRecord(eidOrPassport: string): void {
    this.noRecord.add(eidOrPassport);
  }

  async checkWorkPermit(input: {
    eid?: string;
    passportNo?: string;
  }): Promise<{ result: 'match' | 'no_record' }> {
    const key = input.eid ?? input.passportNo ?? '';
    return { result: this.noRecord.has(key) ? 'no_record' : 'match' };
  }
}
