/**
 * Project Orbit — Provider Adapter Contracts
 * Note: Real integrations are deferred to Milestone 2 in accordance with Milestone 1 scope.
 */

export interface ChannelMessagePayload {
  channelId: string;
  recipientId: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface ChannelAdapterResult {
  success: boolean;
  externalMessageId?: string;
  error?: string;
}

export interface IChannelAdapter {
  readonly provider: string;
  sendMessage(payload: ChannelMessagePayload): Promise<ChannelAdapterResult>;
}
