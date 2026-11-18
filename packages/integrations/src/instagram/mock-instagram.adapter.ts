import { IInstagramAdapter, InstagramSendParams, InstagramSendResult } from './types';

export class MockInstagramAdapter implements IInstagramAdapter {
  private sentMessages: Array<InstagramSendParams & { messageId: string; timestamp: Date }> = [];

  async sendMessage(params: InstagramSendParams): Promise<InstagramSendResult> {
    if (!params.recipientIgsid || !params.text) {
      return {
        success: false,
        messageId: '',
        status: 'failed',
        error: 'Missing required parameters: recipientIgsid and text are required',
      };
    }

    const messageId = `mid.mock_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    this.sentMessages.push({
      ...params,
      messageId,
      timestamp: new Date(),
    });

    return {
      success: true,
      messageId,
      status: 'sent',
    };
  }

  getSentMessages(): Array<InstagramSendParams & { messageId: string; timestamp: Date }> {
    return [...this.sentMessages];
  }

  clear(): void {
    this.sentMessages = [];
  }
}
