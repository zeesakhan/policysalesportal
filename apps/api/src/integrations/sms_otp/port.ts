/**
 * SMS adapter port (CLAUDE.md §3.5 — mock-first integrations). The real
 * provider adapter is a separate M5-T1 task gated on credentials.
 */
export interface SmsPort {
  send(to: string, message: string): Promise<void>;
}
