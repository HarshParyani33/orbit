import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TenantTransactionRunner } from '../tenancy/tenant-transaction-runner';
import { TokenService } from '../auth/token.service';
import { ConversationsService } from '../conversations/conversations.service';
import { RealtimeService } from '../realtime/realtime.service';
import {
  WidgetSessionInitInput,
  WidgetSendMessageInput,
} from '@orbit/validation';
import {
  WidgetVisitorPayload,
  WidgetSessionInitResponse,
  WidgetConversationResponse,
} from '@orbit/shared';

interface ResolvedWidgetChannel {
  channelId: string;
  organizationId: string;
  name: string;
  status: string;
  config: {
    allowedDomains?: string[];
    welcomeMessage?: string;
    themeColor?: string;
    title?: string;
    avatarUrl?: string;
    autoAiAssist?: boolean;
    [key: string]: any;
  };
}

@Injectable()
export class WidgetService {
  private readonly logger = new Logger(WidgetService.name);

  // In-memory token-bucket / rate limit records (windowMs: 60,000)
  private readonly initRateLimits = new Map<string, { count: number; resetAt: number }>();
  private readonly msgRateLimits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TenantTransactionRunner) private readonly tenantRunner: TenantTransactionRunner,
    @Inject(TokenService) private readonly tokenService: TokenService,
    @Inject(ConversationsService) private readonly conversationsService: ConversationsService,
    @Inject(RealtimeService) private readonly realtimeService: RealtimeService
  ) {}

  /**
   * Narrow, security-definer lookup of public Web Chat channel metadata.
   * Does NOT grant open table access to unauthenticated callers.
   */
  async resolveChannel(channelId: string): Promise<ResolvedWidgetChannel> {
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        channel_id: string;
        organization_id: string;
        channel_name: string;
        status: string;
        config: any;
      }>
    >('SELECT * FROM resolve_widget_channel($1::uuid)', channelId);

    if (!rows || rows.length === 0) {
      throw new NotFoundException('Web Chat channel not found or inactive');
    }

    const row = rows[0];
    return {
      channelId: row.channel_id,
      organizationId: row.organization_id,
      name: row.channel_name,
      status: row.status,
      config: typeof row.config === 'object' && row.config !== null ? row.config : {},
    };
  }

  /**
   * Enforces origin matching against channel.config.allowed_domains
   */
  verifyOrigin(allowedDomains: string[] | undefined, originHeader?: string): void {
    if (!allowedDomains || allowedDomains.length === 0 || allowedDomains.includes('*')) {
      return; // Permissive / wildcards allowed
    }

    if (!originHeader) {
      return; // Direct calls or mobile webview without Origin header permitted
    }

    try {
      const parsedOrigin = new URL(originHeader).origin.toLowerCase();
      const originHost = new URL(originHeader).hostname.toLowerCase();

      const isAllowed = allowedDomains.some((d) => {
        const clean = d.trim().toLowerCase();
        if (clean === '*' || clean === parsedOrigin || clean === originHost) return true;
        try {
          const domainHost = new URL(clean.startsWith('http') ? clean : `https://${clean}`).hostname;
          return domainHost === originHost;
        } catch {
          return clean === originHost;
        }
      });

      if (!isAllowed) {
        throw new ForbiddenException(`Origin '${originHeader}' is not authorized for this chat widget`);
      }
    } catch (err: any) {
      if (err instanceof ForbiddenException) throw err;
      throw new ForbiddenException('Invalid Origin header');
    }
  }

  /**
   * Rate limiting enforcement: 50 inits/min per IP, 10 messages/min per visitor
   */
  checkRateLimit(key: string, limit: number, store: Map<string, { count: number; resetAt: number }>): void {
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || now > entry.resetAt) {
      store.set(key, { count: 1, resetAt: now + 60_000 });
      return;
    }

    if (entry.count >= limit) {
      throw new BadRequestException('Rate limit exceeded. Please wait before retrying.');
    }

    entry.count += 1;
  }

  /**
   * Public Session Initialization for Embeddable Widget
   */
  async initSession(
    input: WidgetSessionInitInput,
    originHeader?: string,
    clientIp?: string
  ): Promise<WidgetSessionInitResponse> {
    // 1. Rate limit session inits per IP
    if (clientIp) {
      this.checkRateLimit(`init:${clientIp}`, 50, this.initRateLimits);
    }

    // 2. Resolve channel via security-definer function
    const channel = await this.resolveChannel(input.channelId);

    // 3. Validate Origin against channel configuration
    this.verifyOrigin(channel.config?.allowedDomains, originHeader);

    // 4. Stable visitor identifier
    const visitorId = input.visitorId || crypto.randomUUID();

    // 5. Invariant: Multi-tenant database operations strictly inside TenantTransactionRunner
    const { conversation, customer } = await this.tenantRunner.runWithTenant(
      channel.organizationId,
      async (tx) => {
        // Find existing channel identity for this visitor
        let identity = await tx.customerChannelIdentity.findFirst({
          where: {
            channelId: channel.channelId,
            externalId: visitorId,
            organizationId: channel.organizationId,
          },
          include: { customer: true },
        });

        let customerRecord = identity?.customer;

        if (!customerRecord) {
          // Create new customer record
          const customerName =
            input.customerProfile?.name?.trim() || `Visitor ${visitorId.slice(0, 8)}`;
          customerRecord = await tx.customer.create({
            data: {
              organizationId: channel.organizationId,
              name: customerName,
              email: input.customerProfile?.email?.trim() || null,
              phone: input.customerProfile?.phone?.trim() || null,
            },
          });

          // Link CustomerChannelIdentity
          await tx.customerChannelIdentity.create({
            data: {
              organizationId: channel.organizationId,
              customerId: customerRecord.id,
              channelId: channel.channelId,
              provider: 'WEB_CHAT',
              externalId: visitorId,
              verified: false,
            },
          });
        } else if (input.customerProfile) {
          // Update customer record if profile details supplied
          customerRecord = await tx.customer.update({
            where: {
              uq_customers_id_org: {
                id: customerRecord.id,
                organizationId: channel.organizationId,
              },
            },
            data: {
              name: input.customerProfile.name?.trim() || customerRecord.name,
              email: input.customerProfile.email?.trim() || customerRecord.email,
              phone: input.customerProfile.phone?.trim() || customerRecord.phone,
            },
          });
        }

        // Look up active conversation or create new
        let conv = await tx.conversation.findFirst({
          where: {
            organizationId: channel.organizationId,
            channelId: channel.channelId,
            customerId: customerRecord.id,
            status: { in: ['OPEN', 'SNOOZED'] },
          },
          orderBy: { createdAt: 'desc' },
        });

        if (!conv) {
          conv = await tx.conversation.create({
            data: {
              organizationId: channel.organizationId,
              channelId: channel.channelId,
              customerId: customerRecord.id,
              title: `Website Chat (${customerRecord.name})`,
              status: 'OPEN',
            },
          });
        }

        return { conversation: conv, customer: customerRecord };
      }
    );

    // 6. Generate signed visitor token
    const visitorPayload: WidgetVisitorPayload = {
      sub: visitorId,
      channelId: channel.channelId,
      orgId: channel.organizationId,
      conversationId: conversation.id,
      type: 'WIDGET_VISITOR',
    };

    const visitorToken = this.tokenService.generateWidgetToken(visitorPayload);

    return {
      visitorToken,
      visitorId,
      conversationId: conversation.id,
      channel: {
        id: channel.channelId,
        name: channel.name,
        welcomeMessage: channel.config?.welcomeMessage || 'Hi! How can we help you today?',
        themeColor: channel.config?.themeColor || '#4F46E5',
        allowedDomains: channel.config?.allowedDomains,
      },
    };
  }

  /**
   * Retrieve conversation history for verified visitor session
   */
  async getConversation(visitor: WidgetVisitorPayload): Promise<WidgetConversationResponse> {
    return this.tenantRunner.runWithTenant(visitor.orgId, async (tx) => {
      const conversation = await tx.conversation.findFirst({
        where: {
          id: visitor.conversationId,
          organizationId: visitor.orgId,
        },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      if (!conversation) {
        throw new NotFoundException('Conversation not found');
      }

      return {
        conversation: {
          id: conversation.id,
          status: conversation.status,
          title: conversation.title,
        },
        messages: conversation.messages.map((m) => ({
          id: m.id,
          organizationId: m.organizationId,
          conversationId: m.conversationId,
          senderType: m.senderType,
          content: m.content,
          createdAt: m.createdAt.toISOString(),
        })),
      };
    });
  }

  /**
   * Send a message from verified visitor
   */
  async sendMessage(visitor: WidgetVisitorPayload, input: WidgetSendMessageInput) {
    // 1. Rate limit: 10 msg/min per visitor
    this.checkRateLimit(`msg:${visitor.sub}`, 10, this.msgRateLimits);

    // 2. Delegate to ConversationsService (creates message, reopens conversation if resolved, and emits real-time events)
    const message = await this.conversationsService.createMessage(
      visitor.orgId,
      visitor.conversationId,
      {
        senderType: 'CUSTOMER',
        content: input.content,
      }
    );

    return { message };
  }
}
