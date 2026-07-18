import type { SmsPort } from './port';

/** Records outbound messages for tests/demos; never leaves the process. */
export class MockSmsAdapter implements SmsPort {
  readonly sent: { to: string; message: string }[] = [];

  async send(to: string, message: string): Promise<void> {
    this.sent.push({ to, message });
  }
}
