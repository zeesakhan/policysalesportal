/** Email port (INT-11) — secondary delivery channel. */
export interface EmailPort {
  send(to: string, subject: string, body: string, attachments?: string[]): Promise<void>;
}
