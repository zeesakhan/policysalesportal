import type { WhatsAppPort } from './port';

export class MockWhatsAppAdapter implements WhatsAppPort {
  readonly sent: { to: string; message: string; attachments?: string[] }[] = [];

  async send(to: string, message: string, attachments?: string[]): Promise<void> {
    this.sent.push({ to, message, attachments });
  }
}
