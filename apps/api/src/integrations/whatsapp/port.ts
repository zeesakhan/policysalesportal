/** WhatsApp Business API port (INT-04) — delivery + notification spine. */
export interface WhatsAppPort {
  send(to: string, message: string, attachments?: string[]): Promise<void>;
}
