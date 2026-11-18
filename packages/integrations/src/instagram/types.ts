export interface InstagramSendParams {
  accountId: string;
  accessToken?: string;
  recipientIgsid: string;
  text: string;
}

export interface InstagramSendResult {
  success: boolean;
  messageId: string;
  status: string;
  error?: string;
}

export interface IInstagramAdapter {
  sendMessage(params: InstagramSendParams): Promise<InstagramSendResult>;
}
