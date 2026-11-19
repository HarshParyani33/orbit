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

// AI Provider Contracts & Adapters
export * from './ai/types';
export * from './ai/mock-provider';
export * from './ai/openai-provider';
export * from './ai/groq-provider';
export * from './ai/openrouter-provider';
export * from './ai/resilient-ai-gateway';
export * from './ai/citation-validator';

// WhatsApp Provider Contracts & Adapters
export * from './whatsapp/types';
export * from './whatsapp/mock-whatsapp.adapter';

// Instagram Provider Contracts & Adapters
export * from './instagram/types';
export * from './instagram/mock-instagram.adapter';

// Storage Provider Contracts & Adapters
export * from './storage/types';
export * from './storage/disk-storage.provider';
export * from './storage/mock-storage.provider';
export * from './storage/s3-storage.provider';

// Embedding Provider Contracts & Chunking Engine
export * from './embeddings/types';
export * from './embeddings/chunking-engine';
export * from './embeddings/mock-embedding.provider';
export * from './embeddings/openai-embedding.provider';

// Cryptographic Envelope Encryption
export * from './security/envelope-encryption.service';

// Voice Provider Contracts & Briefing Types
export * from './voice/types';

// Commerce & Logistics Adapters
export * from './commerce/types';
export * from './commerce/shopify-commerce.adapter';
export * from './commerce/courier-logistics.adapter';



