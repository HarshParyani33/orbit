/**
 * Project Orbit — Shared Interfaces, Types & Enums
 */

export enum Role {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  DELETED = 'DELETED',
}

export enum OrgStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  PENDING_DELETION = 'PENDING_DELETION',
  DELETED = 'DELETED',
}

export enum ConversationStatus {
  OPEN = 'OPEN',
  RESOLVED = 'RESOLVED',
  SNOOZED = 'SNOOZED',
}

export enum SenderType {
  CUSTOMER = 'CUSTOMER',
  AGENT = 'AGENT',
  AI = 'AI',
  SYSTEM = 'SYSTEM',
}

export enum ChannelProvider {
  META_WHATSAPP = 'META_WHATSAPP',
  META_INSTAGRAM = 'META_INSTAGRAM',
  WEB_CHAT = 'WEB_CHAT',
}

export interface ChannelSummary {
  id: string;
  organizationId: string;
  name: string;
  provider: string;
  status: string;
  config?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface MessageSummary {
  id: string;
  organizationId: string;
  conversationId: string;
  senderType: string;
  content: string;
  createdAt: string;
}

export interface CustomerChannelIdentitySummary {
  id: string;
  channelId: string;
  provider: string;
  externalId: string;
  verified: boolean;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  channel?: Pick<ChannelSummary, 'id' | 'name' | 'provider'>;
}

export interface CustomerSummary {
  id: string;
  organizationId: string;
  name: string;
  email: string | null;
  phone: string | null;
  metadata?: Record<string, unknown>;
  mergedIntoId?: string | null;
  createdAt: string;
  updatedAt: string;
  channelIdentities?: CustomerChannelIdentitySummary[];
  conversations?: ConversationSummary[];
  _count?: {
    conversations: number;
  };
}

export interface ConversationSummary {
  id: string;
  organizationId: string;
  channelId: string;
  customerId?: string | null;
  status: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  channel?: Pick<ChannelSummary, 'id' | 'name' | 'provider'>;
  customer?: CustomerSummary | null;
  messages?: MessageSummary[];
  lastMessage?: MessageSummary | null;
}

export interface TenantContext {
  userId: string;
  orgId: string;
  role: Role;
  email: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  status: UserStatus;
  createdAt: string;
}

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  status: OrgStatus;
  role: Role;
}

export interface AuthSessionPayload {
  sub: string; // userId
  email: string;
  name: string;
}

export interface WidgetVisitorPayload {
  sub: string; // visitorId
  channelId: string;
  orgId: string;
  conversationId: string;
  type: 'WIDGET_VISITOR';
}

export interface WidgetSessionInitResponse {
  visitorToken: string;
  visitorId: string;
  conversationId: string;
  channel: {
    id: string;
    name: string;
    welcomeMessage?: string;
    themeColor?: string;
    allowedDomains?: string[];
  };
}

export interface WidgetConversationResponse {
  conversation: {
    id: string;
    status: string;
    title: string | null;
  };
  messages: MessageSummary[];
}

export interface AutomationRuleSummary {
  id: string;
  organizationId: string;
  name: string;
  trigger: string;
  conditions: Array<{ field: string; operator: string; value: any }>;
  actions: Array<{ type: string; payload: any }>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationExecutionAuditSummary {
  id: string;
  organizationId: string;
  ruleId: string;
  conversationId: string;
  trigger: string;
  matched: boolean;
  actionsExecuted: any[];
  status: string;
  errorMessage?: string | null;
  createdAt: string;
}

export interface AnalyticsOverviewResponse {
  totalConversations: number;
  openConversations: number;
  resolvedConversations: number;
  snoozedConversations: number;
  totalMessages: number;
  messagesBySender: {
    customer: number;
    agent: number;
    ai: number;
    system: number;
  };
  averageFirstResponseTimeMs: number | null;
  aiHandledConversationsCount: number;
  totalAutomationAuditsCount: number;
}

export interface AuthTokenResponse {
  user: AuthenticatedUser;
  organizations: OrganizationSummary[];
  activeOrgId?: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export class OrbitError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'OrbitError';
  }
}
