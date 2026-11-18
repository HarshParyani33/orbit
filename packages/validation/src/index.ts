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
  title: z.string().max(255).optional(),
  initialMessage: z.string().min(1).max(10000).optional(),
});

export const updateConversationStatusSchema = z.object({
  status: z.enum(['OPEN', 'RESOLVED', 'SNOOZED']),
});

export const listConversationsQuerySchema = z.object({
  status: z.enum(['OPEN', 'RESOLVED', 'SNOOZED']).optional(),
  channelId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().uuid().optional(),
});

// Message Schemas
export const createMessageSchema = z.object({
  content: z.string().min(1, 'Message content cannot be empty').max(10000),
  senderType: z.enum(['CUSTOMER', 'AGENT', 'AI', 'SYSTEM']).default('AGENT'),
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
