import type { IcpResult, IcpValidationPort } from './port';

/**
 * Deterministic ICP mock (UAT-PLAN mock modes: pass/fail/expired). Responses
 * can be programmed per EID; default is pass.
 */
export class MockIcpAdapter implements IcpValidationPort {
  constructor(private readonly responses: Record<string, IcpResult> = {}) {}

  setResponse(eid: string, result: IcpResult): void {
    this.responses[eid] = result;
  }

  async validate(input: { eid: string }): Promise<{ result: IcpResult }> {
    return { result: this.responses[input.eid] ?? 'pass' };
  }
}
