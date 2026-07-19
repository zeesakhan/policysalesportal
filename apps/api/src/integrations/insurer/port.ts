/**
 * Insurer policy-admin + payment rails port (INT-01/INT-02 — the backbone):
 * REG-002 payment executes on insurer rails; REG-003 only the insurer issues.
 * Real adapter is M5-T1, gated on partner credentials.
 */
export interface InsurerPort {
  /** PAY-001: hosted gateway page / payment link; portal stores the reference only. */
  createPaymentLink(input: {
    applicationRef: string;
    amountAed: number;
  }): Promise<{ paymentRef: string; url: string }>;

  /** PAY-020/REG-003: request policy issuance after payment confirmation. */
  issuePolicy(input: {
    applicationRef: string;
    productCode: string;
    startDate: string;
  }): Promise<{ policyNumber: string }>;

  /** PAY-022: regime-platform registration executed under insurer/TPA credentials. */
  registerPolicy(input: {
    policyNumber: string;
    regime: string;
  }): Promise<{ result: 'registered' | 'failed'; errorCode?: string }>;
}
