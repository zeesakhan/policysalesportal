import type { EmailPort } from './port';

export class MockEmailAdapter implements EmailPort {
  readonly sent: { to: string; subject: string; body: string; attachments?: string[] }[] = [];

  async send(to: string, subject: string, body: string, attachments?: string[]): Promise<void> {
    this.sent.push({ to, subject, body, attachments });
  }
}
