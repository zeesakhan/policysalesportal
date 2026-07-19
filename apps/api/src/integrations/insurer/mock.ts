import { randomUUID } from 'node:crypto';
import type { InsurerPort } from './port';

/**
 * Deterministic insurer mock (UAT modes: payment success/timeout, issuance,
 * registration success/fail×N). Registration failures are programmable per
 * policy so PAY-023 retry orchestration is testable.
 */
export class MockInsurerAdapter implements InsurerPort {
  private registrationFailuresRemaining = new Map<string, number>();
  private policySeq = 1;
  readonly issued: string[] = [];

  /** Program the next N registration attempts for any policy to fail. */
  failRegistrations(policyNumber: string, times: number): void {
    this.registrationFailuresRemaining.set(policyNumber, times);
  }

  async createPaymentLink(input: { applicationRef: string }): Promise<{
    paymentRef: string;
    url: string;
  }> {
    const paymentRef = `PAYREF-${randomUUID()}`;
    return { paymentRef, url: `https://insurer.example/pay/${paymentRef}?app=${input.applicationRef}` };
  }

  async issuePolicy(input: { applicationRef: string }): Promise<{ policyNumber: string }> {
    const policyNumber = `POL-DEMO-${String(this.policySeq++).padStart(6, '0')}`;
    this.issued.push(`${input.applicationRef}:${policyNumber}`);
    return { policyNumber };
  }

  async registerPolicy(input: { policyNumber: string }): Promise<{
    result: 'registered' | 'failed';
    errorCode?: string;
  }> {
    const remaining = this.registrationFailuresRemaining.get(input.policyNumber) ?? 0;
    if (remaining > 0) {
      this.registrationFailuresRemaining.set(input.policyNumber, remaining - 1);
      return { result: 'failed', errorCode: 'REGIME_PLATFORM_TIMEOUT' };
    }
    return { result: 'registered' };
  }
}
