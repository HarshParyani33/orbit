import { IWhatsAppAdapter, WhatsAppSendParams, WhatsAppSendResult } from './types';

export class MockWhatsAppAdapter implements IWhatsAppAdapter {
  private sentMessages: Array<WhatsAppSendParams & { messageId: string; timestamp: Date }> = [];

  async sendMessage(params: WhatsAppSendParams): Promise<WhatsAppSendResult> {
    if (!params.to || !params.text) {
      return {
        success: false,
        messageId: '',
        status: 'failed',
        error: 'Missing required parameters: recipient phone number and text body are required',
      };
    }

    const messageId = `wamid.mock_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    this.sentMessages.push({
      ...params,
      messageId,
      timestamp: new Date(),
    });

    return {
      success: true,
      messageId,
      status: 'messages',
    };
  }

  getSentMessages(): Array<WhatsAppSendParams & { messageId: string; timestamp: Date }> {
    return [...this.sentMessages];
  }

  clear(): void {
    this.sentMessages = [];
  }
}
