import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(64),
  email: z.string().email('Invalid email address').toLowerCase().trim(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password cannot exceed 128 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  organizationName: z
    .string()
    .min(2, 'Organization name must be at least 2 characters')
    .max(64)
    .optional(),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase().trim(),
  password: z.string().min(1, 'Password is required'),
});

export const createOrganizationSchema = z.object({
  name: z.string().min(2, 'Organization name must be at least 2 characters').max(64).trim(),
  slug: z
    .string()
    .min(2, 'Slug must be at least 2 characters')
    .max(32)
    .regex(/^[a-z0-9-]+$/, 'Slug must only contain lowercase alphanumeric characters and hyphens')
    .trim()
    .optional(),
});

export const updateOrganizationSchema = z.object({
  name: z.string().min(2).max(64).trim().optional(),
});

export const addMemberSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase().trim(),
  role: z.enum(['ADMIN', 'MEMBER']).default('MEMBER'),
});

// Channel Schemas
export const createChannelSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(64).trim(),
  provider: z.enum(['META_WHATSAPP', 'META_INSTAGRAM', 'WEB_CHAT']),
  config: z.record(z.unknown()).optional(),
});

export const updateChannelSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(64).trim().optional(),
  config: z.record(z.unknown()).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

// Conversation Schemas
export const createConversationSchema = z.object({
  channelId: z.string().uuid('Invalid channel ID'),
  customerId: z.string().uuid('Invalid customer ID').optional(),
  title: z.string().max(255).optional(),
  initialMessage: z.string().min(1).max(10000).optional(),
});

export const updateConversationStatusSchema = z.object({
  status: z.enum(['OPEN', 'RESOLVED', 'SNOOZED']),
});

export const listConversationsQuerySchema = z.object({
  status: z.enum(['OPEN', 'RESOLVED', 'SNOOZED']).optional(),
  channelId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().uuid().optional(),
});

// Message Schemas
export const createMessageSchema = z.object({
  content: z.string().min(1, 'Message content cannot be empty').max(10000),
  senderType: z.enum(['CUSTOMER', 'AGENT', 'AI', 'SYSTEM']).default('AGENT'),
});

// Customer & Identity Schemas
export const createCustomerSchema = z.object({
  name: z.string().min(1, 'Name must be at least 1 character').max(128).trim(),
  email: z.string().email('Invalid email address').toLowerCase().trim().optional(),
  phone: z.string().max(64).trim().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const updateCustomerSchema = z.object({
  name: z.string().min(1).max(128).trim().optional(),
  email: z.string().email('Invalid email address').toLowerCase().trim().nullable().optional(),
  phone: z.string().max(64).trim().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const listCustomersQuerySchema = z.object({
  search: z.string().max(128).trim().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().uuid().optional(),
});

export const linkChannelIdentitySchema = z.object({
  channelId: z.string().uuid('Invalid channel ID'),
  provider: z.enum(['META_WHATSAPP', 'META_INSTAGRAM', 'WEB_CHAT']),
  externalId: z.string().min(1, 'External ID cannot be empty').max(128).trim(),
  verified: z.boolean().default(false),
  metadata: z.record(z.unknown()).optional(),
});

export const mergeCustomersSchema = z.object({
  targetCustomerId: z.string().uuid('Target customer ID is required'),
  reason: z.string().min(3, 'Reason must be at least 3 characters').max(255).trim(),
});

// AI Configuration & Suggestion Schemas
export const createAiConfigSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(128).trim(),
  systemInstructions: z.string().min(10, 'Instructions must be at least 10 characters').max(10000).trim(),
  policyRules: z.array(z.string().min(1).max(500)).default([]),
  provider: z.enum(['MOCK', 'OPENAI', 'ANTHROPIC']).default('MOCK'),
  model: z.string().min(1).max(64).default('gpt-4o-mini'),
  temperature: z.number().min(0).max(1).default(0.3),
});

export const generateAiSuggestionSchema = z.object({
  conversationId: z.string().uuid('Invalid conversation ID'),
});

export const widgetSessionInitSchema = z.object({
  channelId: z.string().uuid('Invalid channel ID'),
  visitorId: z.string().uuid('Invalid visitor ID').optional(),
  customerProfile: z
    .object({
      name: z.string().max(128).trim().optional(),
      email: z.string().email().optional(),
      phone: z.string().max(64).trim().optional(),
    })
    .optional(),
});

export const widgetSendMessageSchema = z.object({
  content: z.string().min(1, 'Message cannot be empty').max(10000, 'Message too long').trim(),
});

export const createAutomationRuleSchema = z.object({
  name: z.string().min(2, 'Rule name must be at least 2 characters').max(128).trim(),
  trigger: z.enum(['CONVERSATION_CREATED', 'MESSAGE_RECEIVED', 'CONVERSATION_RESOLVED']),
  conditions: z
    .array(
      z.object({
        field: z.string().min(1),
        operator: z.enum(['EQUALS', 'CONTAINS', 'STARTS_WITH', 'IN']),
        value: z.any(),
      })
    )
    .default([]),
  actions: z
    .array(
      z.object({
        type: z.enum(['UPDATE_STATUS', 'SEND_SYSTEM_MESSAGE', 'ASSIGN_PRIORITY', 'ESCALATE_HUMAN']),
        payload: z.record(z.any()),
      })
    )
    .min(1, 'At least one action is required'),
  enabled: z.boolean().default(true),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
export type AddMemberInput = z.infer<typeof addMemberSchema>;
export type CreateChannelInput = z.infer<typeof createChannelSchema>;
export type UpdateChannelInput = z.infer<typeof updateChannelSchema>;
export type CreateConversationInput = z.infer<typeof createConversationSchema>;
export type UpdateConversationStatusInput = z.infer<typeof updateConversationStatusSchema>;
export type ListConversationsQuery = z.infer<typeof listConversationsQuerySchema>;
export type CreateMessageInput = z.infer<typeof createMessageSchema>;
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
export type LinkChannelIdentityInput = z.infer<typeof linkChannelIdentitySchema>;
export type MergeCustomersInput = z.infer<typeof mergeCustomersSchema>;
export type CreateAiConfigInput = z.infer<typeof createAiConfigSchema>;
export type GenerateAiSuggestionInput = z.infer<typeof generateAiSuggestionSchema>;
export type WidgetSessionInitInput = z.infer<typeof widgetSessionInitSchema>;
export type WidgetSendMessageInput = z.infer<typeof widgetSendMessageSchema>;
export type CreateAutomationRuleInput = z.infer<typeof createAutomationRuleSchema>;

// Attachment Constants & Validation
export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'application/json',
] as const;

export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

