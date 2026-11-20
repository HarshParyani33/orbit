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
  IN_QUEUE = 'IN_QUEUE',
  OPEN = 'OPEN',
  REOPENED = 'REOPENED',
  SNOOZED = 'SNOOZED',
  AWAITING = 'AWAITING',
  INVESTIGATING = 'INVESTIGATING',
  ESCALATED = 'ESCALATED',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
}

export enum SenderType {
  CUSTOMER = 'CUSTOMER',
  AGENT = 'AGENT',
  AI = 'AI',
  SYSTEM = 'SYSTEM',
  NOTE = 'NOTE',
}

export enum TicketPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export interface BusinessHoursSchedule {
  timezone: string;
  schedule: {
    dayOfWeek: number; // 0=Sunday, 1=Monday, ..., 6=Saturday
    openTime: string;  // HH:mm (e.g. "09:00")
    closeTime: string; // HH:mm (e.g. "18:00")
    closed: boolean;
  }[];
  outOfHoursMessage: string;
  enabled: boolean;
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

export type CampaignAudienceSegment =
  | 'ALL_CUSTOMERS'
  | 'CART_ABANDONERS'
  | 'VIP_SPENDERS'
  | 'INACTIVE_60_DAYS';

export type CampaignChannel = 'META_WHATSAPP' | 'EMAIL';

export type CampaignStatus = 'DRAFT' | 'SCHEDULED' | 'RUNNING' | 'COMPLETED' | 'PAUSED';

export interface MarketingCampaign {
  id: string;
  name: string;
  channel: CampaignChannel;
  audienceSegment: CampaignAudienceSegment;
  status: CampaignStatus;
  messageTemplate: string;
  recipientCount: number;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  clickedCount: number;
  convertedCount: number;
  attributedRevenue: number;
  createdAt: string;
  scheduledAt?: string;
}

export type VoiceCallStatus =
  | 'INITIATED'
  | 'RINGING'
  | 'IN_PROGRESS'
  | 'TRANSFER_REQUESTED'
  | 'TRANSFERRED'
  | 'COMPLETED'
  | 'FAILED'
  | 'BUSY'
  | 'NO_ANSWER';

export interface VoiceTranscriptionTurn {
  id: string;
  role: 'customer' | 'assistant' | 'human_agent';
  transcript: string;
  confidence: number;
  durationMs: number;
  timestamp: string;
}

export interface VoiceHandoffBriefing {
  callId: string;
  conversationId: string;
  customerName?: string;
  customerPhone?: string;
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'FRUSTRATED' | 'ANGRY';
  intent: string;
  summary: string;
  customerKeyPoints: string[];
  suggestedAction: string;
  transferredToTeam?: string;
  transferredAt: string;
}

export interface VoiceCallSession {
  id: string;
  organizationId: string;
  channelId: string;
  conversationId: string;
  externalCallSid: string;
  callerNumber: string;
  calledNumber: string;
  status: VoiceCallStatus;
  turns: VoiceTranscriptionTurn[];
  briefing?: VoiceHandoffBriefing;
  durationSeconds?: number;
  startedAt: string;
  endedAt?: string;
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

// ==============================================================================
// 7. PLATFORM SUPER-ADMIN & CONTROL PLANE (Surface C)
// ==============================================================================

export interface PlatformTenantSummary {
  id: string;
  name: string;
  slug: string;
  planTier: string;
  status: 'ACTIVE' | 'SUSPENDED';
  creditsRemaining: number;
  monthlySpendUsd: number;
  providerCogsUsd: number;
  grossMarginPct: number;
  memberCount: number;
  createdAt: string;
}

export interface PlatformCircuitBreakerStatus {
  provider: 'OPENAI' | 'GROQ' | 'OPENROUTER';
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  latencyMs: number;
  consecutiveFailures: number;
  lastFailureTime?: string | null;
  lastSuccessTime?: string | null;
}

export interface PlatformMarginMetrics {
  monthlyRecurringRevenueUsd: number;
  annualRecurringRevenueUsd: number;
  providerCogsUsd: number;
  platformGrossMarginPct: number;
  totalActiveCredits: number;
  flaggedTenantsCount: number; // Tenants with gross margin < 75%
  flaggedTenants: Array<{
    id: string;
    name: string;
    grossMarginPct: number;
    monthlySpendUsd: number;
    providerCogsUsd: number;
  }>;
}

export interface PlatformAuditLogEntry {
  id: string;
  operatorEmail: string;
  action: 'IMPERSONATION_REQUEST' | 'CIRCUIT_BREAKER_TRIP' | 'CIRCUIT_BREAKER_RESET' | 'TENANT_SUSPEND' | 'TENANT_ACTIVATE' | 'CREDIT_ADJUSTMENT';
  targetTenantId?: string;
  targetTenantSlug?: string;
  justification?: string;
  ticketId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  createdAt: string;
}

export interface ImpersonationRequestInput {
  tenantId: string;
  operatorEmail: string;
  reason: string;
  ticketId?: string;
}

export interface ImpersonationResponse {
  token: string;
  redirectUrl: string;
  expiresInSeconds: number;
  expiresAt: string;
  impersonatedOrg: {
    id: string;
    name: string;
    slug: string;
  };
}

