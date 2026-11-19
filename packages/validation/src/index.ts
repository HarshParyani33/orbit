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

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase().trim(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(16, 'Password reset token is invalid or too short'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password cannot exceed 128 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;


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

export const conversationStatuses = [
  'IN_QUEUE',
  'OPEN',
  'REOPENED',
  'SNOOZED',
  'AWAITING',
  'INVESTIGATING',
  'ESCALATED',
  'RESOLVED',
  'CLOSED',
] as const;

export const updateConversationStatusSchema = z.object({
  status: z.enum(conversationStatuses),
});

export const listConversationsQuerySchema = z.object({
  status: z.enum(conversationStatuses).optional(),
  channelId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().uuid().optional(),
});

// Message Schemas
export const createMessageSchema = z.object({
  content: z.string().min(1, 'Message content cannot be empty').max(10000),
  senderType: z.enum(['CUSTOMER', 'AGENT', 'AI', 'SYSTEM', 'NOTE']).default('AGENT'),
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

// Knowledge Base Schemas & Constants
export const KNOWLEDGE_SOURCE_TYPES = [
  'FAQ',
  'MANUAL_ENTRY',
  'DOCUMENT_UPLOAD',
  'POLICY',
] as const;

export const KNOWLEDGE_DOCUMENT_STATUSES = [
  'DRAFT',
  'PROCESSING',
  'ACTIVE',
  'ARCHIVED',
] as const;

export const createKnowledgeDocumentSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255).trim(),
  sourceType: z.enum(KNOWLEDGE_SOURCE_TYPES).default('MANUAL_ENTRY'),
  content: z.string().min(1, 'Content is required').max(100000, 'Content exceeds 100,000 characters'),
  metadata: z.record(z.unknown()).optional(),
});

export const listKnowledgeDocumentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});

export const searchKnowledgeSchema = z.object({
  query: z.string().min(1, 'Query is required').max(1000, 'Query exceeds 1000 characters').trim(),
  limit: z.coerce.number().int().min(1).max(20).default(5),
  minSimilarity: z.coerce.number().min(0).max(1).default(0.7),
});

export const updateBusinessHoursSchema = z.object({
  timezone: z.string().default('UTC'),
  schedule: z.array(
    z.object({
      dayOfWeek: z.number().int().min(0).max(6),
      openTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid time format (HH:mm)'),
      closeTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid time format (HH:mm)'),
      closed: z.boolean(),
    })
  ).length(7),
  outOfHoursMessage: z.string().max(1000).default('Thank you for reaching out. We are currently outside our operating business hours and will reply as soon as our team opens.'),
  enabled: z.boolean().default(true),
});

export type UpdateBusinessHoursInput = z.infer<typeof updateBusinessHoursSchema>;
export type CreateKnowledgeDocumentInput = z.infer<typeof createKnowledgeDocumentSchema>;
export type ListKnowledgeDocumentsQuery = z.infer<typeof listKnowledgeDocumentsQuerySchema>;
export type SearchKnowledgeInput = z.infer<typeof searchKnowledgeSchema>;




