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

export interface OpenTicketsAnalytics {
  totalOpen: number;
  humanHandling: number;
  aiHandling: number;
  unassigned: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  ageDistribution: {
    zeroTo24h: number;
    oneToTwoDays: number;
    oneWeekToOneMonth: number;
    overOneMonth: number;
  };
}

export interface PerformanceTatAnalytics {
  humanFrtMs: number;
  aiFrtMs: number;
  humanMttrMs: number;
  aiMttrMs: number;
  slaAdherencePercent: number;
  responseTimeHistogram: Array<{ range: string; count: number }>;
}

export interface TicketTrendsAnalytics {
  timeSeries: Array<{ date: string; total: number; ai: number; human: number }>;
  byChannel: Record<string, number>;
  byMessageType: Record<string, number>;
}

export interface WorkforceAnalytics {
  agents: Array<{
    id: string;
    name: string;
    email: string;
    assigned: number;
    resolved: number;
    medianResponseTimeSec: number;
    csatScore: number;
  }>;
  queueMetrics: {
    enteredQueue: number;
    assignedFromQueue: number;
    medianWaitTimeSec: number;
  };
}

export interface DeflectionAnalytics {
  deflectionRatePercent: number;
  deflectedCount: number;
  escalatedCount: number;
  dailyTrends: Array<{ date: string; deflected: number; escalated: number; rate: number }>;
  topCategories: Array<{ category: string; count: number }>;
}

export interface BusiestTimesHeatmapAnalytics {
  matrix: number[][]; // 7 days (rows) x 24 hours (cols)
  peakDay: string;
  peakHour: number;
}

export interface CsatAnalytics {
  surveyCsat: number;
  inferredCsat: number;
  totalResponses: number;
  starBreakdown: Record<number, number>;
  sentimentDistribution: { positive: number; neutral: number; negative: number };
  agentLeaderboard: Array<{ name: string; score: number; ratingsCount: number }>;
}

export interface TouchpointsFunnelAnalytics {
  funnel: Array<{ stage: string; touches: string; count: number; percentage: number }>;
  medianTouchesToResolution: number;
}

export interface SocialAnalytics {
  inboundComments: number;
  autoReplied: number;
  escalatedToDm: number;
  moderated: number;
  sentimentBreakdown: { positive: number; neutral: number; negative: number };
}

export interface CampaignAnalytics {
  sent: number;
  delivered: number;
  read: number;
  clicked: number;
  converted: number;
  failed: number;
  conversionRatePercent: number;
}


export interface CommerceLineItem {
  id: string;
  title: string;
  quantity: number;
  price: string;
  thumbnailUrl?: string;
  sku?: string;
}

export interface ShippingAddress {
  name: string;
  address1: string;
  city: string;
  province?: string;
  country: string;
  zip: string;
}

export type ShipmentStatus =
  | 'ORDER_PLACED'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'NDR_EXCEPTION'
  | 'RETURNED_TO_ORIGIN';

export interface TrackingEvent {
  timestamp: string;
  location: string;
  activity: string;
}

export interface ShipmentDetails {
  carrier: string;
  awbNumber: string;
  trackingUrl?: string;
  status: ShipmentStatus;
  estimatedDelivery?: string;
  lastLocation?: string;
  events?: TrackingEvent[];
}

export interface CommerceOrder {
  id: string;
  orderNumber: string;
  customerEmail: string;
  customerPhone?: string;
  createdAt: string;
  currency: string;
  totalPrice: string;
  financialStatus: 'paid' | 'pending' | 'refunded' | 'partially_refunded' | 'voided';
  fulfillmentStatus: 'fulfilled' | 'unfulfilled' | 'partial' | 'in_transit' | 'delivered' | 'returned';
  lineItems: CommerceLineItem[];
  shippingAddress?: ShippingAddress;
  shipment?: ShipmentDetails;
}

export interface SocialPublicReply {
  id: string;
  content: string;
  createdAt: string;
  repliedBy: 'AI_AGENT' | 'HUMAN';
}

export interface SocialComment {
  id: string;
  postId: string;
  postTitle: string;
  postImageUrl?: string;
  authorUsername: string;
  authorAvatarUrl?: string;
  content: string;
  createdAt: string;
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'TOXIC';
  status: 'PENDING' | 'REPLIED' | 'ESCALATED_TO_DM' | 'HIDDEN' | 'DELETED';
  publicReply?: SocialPublicReply;
  dmConversationId?: string;
}

export type PulseChartType = 'BAR' | 'LINE' | 'DONUT' | 'TABLE';

export interface PulseChartData {
  type: PulseChartType;
  title: string;
  labels: string[];
  series: Array<{ name: string; data: number[] }>;
  rawTable?: Array<Record<string, any>>;
}

export interface PulseQueryResponse {
  answer: string;
  chart?: PulseChartData;
  suggestedNextQuestions?: string[];
  executionTimeMs: number;
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
