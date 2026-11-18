export interface WhatsAppSendParams {
  phoneNumberId: string;
  accessToken?: string;
  to: string;
  text: string;
}

export interface WhatsAppSendResult {
  success: boolean;
  messageId: string;
  status: string;
  error?: string;
}

export interface IWhatsAppAdapter {
  sendMessage(params: WhatsAppSendParams): Promise<WhatsAppSendResult>;
}
