import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaService } from '../../apps/api/src/prisma/prisma.service';
import { TenantTransactionRunner } from '../../apps/api/src/tenancy/tenant-transaction-runner';
import { ChannelsService } from '../../apps/api/src/channels/channels.service';
import { ConversationsService } from '../../apps/api/src/conversations/conversations.service';
import { RealtimeService } from '../../apps/api/src/realtime/realtime.service';
import { RealtimeGateway } from '../../apps/api/src/realtime/realtime.gateway';
import { TokenService } from '../../apps/api/src/auth/token.service';
import { JwtService } from '@nestjs/jwt';
import { WidgetService } from '../../apps/api/src/widget/widget.service';
import { JwtAuthGuard } from '../../apps/api/src/auth/auth.guard';
import { NotFoundException, ForbiddenException, BadRequestException, UnauthorizedException } from '@nestjs/common';

describe('Milestone 2 Slice 2.6 — Website Chat Widget Integration Tests', () => {
  let prisma: PrismaService;
  let runner: TenantTransactionRunner;
  let channelsService: ChannelsService;
  let conversationsService: ConversationsService;
  let tokenService: TokenService;
  let widgetService: WidgetService;
  let jwtAuthGuard: JwtAuthGuard;

  let orgAId: string;
  let orgBId: string;
  let webChatChannelId: string;
  let restrictedChannelId: string;
  let whatsAppChannelId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    runner = new TenantTransactionRunner(prisma);
    channelsService = new ChannelsService(runner);
    conversationsService = new ConversationsService(runner);
    const jwtService = new JwtService({});
    const realtimeGateway = new RealtimeGateway(jwtService, prisma, runner);
    const realtimeService = new RealtimeService(realtimeGateway);
    tokenService = new TokenService(jwtService);
    widgetService = new WidgetService(prisma, runner, tokenService, conversationsService, realtimeService);
    jwtAuthGuard = new JwtAuthGuard(tokenService);

    const orgA = await prisma.organization.findUniqueOrThrow({ where: { slug: 'acme' } });
    const orgB = await prisma.organization.findUniqueOrThrow({ where: { slug: 'beta' } });
    orgAId = orgA.id;
    orgBId = orgB.id;

    // 1. Create standard public Web Chat channel
    const ch1 = await channelsService.createChannel(orgAId, {
      name: 'Acme Website Support',
      provider: 'WEB_CHAT',
      config: {
        welcomeMessage: 'Welcome to Acme! How can we help?',
        themeColor: '#4F46E5',
        allowedDomains: ['*'],
      },
    });
    webChatChannelId = ch1.id;

    // 2. Create domain-restricted Web Chat channel
    const ch2 = await channelsService.createChannel(orgAId, {
      name: 'Acme Secure Portal',
      provider: 'WEB_CHAT',
      config: {
        welcomeMessage: 'Portal support online.',
        themeColor: '#059669',
        allowedDomains: ['https://portal.acme.com', 'https://secure.acme.com'],
      },
    });
    restrictedChannelId = ch2.id;

    // 3. Create non-WEB_CHAT channel (WhatsApp)
    const ch3 = await channelsService.createChannel(orgAId, {
      name: 'Acme WhatsApp',
      provider: 'META_WHATSAPP',
    });
    whatsAppChannelId = ch3.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('1. Public Widget Session Initialization & Visitor Capability Issuance', () => {
    let generatedVisitorId: string;
    let visitorToken: string;
    let conversationId: string;

    it('successfully initializes new visitor session and issues signed capability token', async () => {
      const session = await widgetService.initSession({
        channelId: webChatChannelId,
        customerProfile: {
          name: 'Sarah Customer',
          email: 'sarah@example.com',
        },
      });

      expect(session.visitorId).toBeDefined();
      expect(session.visitorToken).toBeDefined();
      expect(session.conversationId).toBeDefined();
      expect(session.channel.name).toBe('Acme Website Support');
      expect(session.channel.themeColor).toBe('#4F46E5');
      expect(session.channel.welcomeMessage).toBe('Welcome to Acme! How can we help?');

      generatedVisitorId = session.visitorId;
      visitorToken = session.visitorToken;
      conversationId = session.conversationId;

      // Verify token payload claims
      const payload = tokenService.verifyWidgetToken(visitorToken);
      expect(payload.sub).toBe(session.visitorId);
      expect(payload.channelId).toBe(webChatChannelId);
      expect(payload.orgId).toBe(orgAId);
      expect(payload.conversationId).toBe(session.conversationId);
      expect(payload.type).toBe('WIDGET_VISITOR');
    });

    it('resumes existing visitor session using persistent visitorId without creating duplicate customer', async () => {
      const session2 = await widgetService.initSession({
        channelId: webChatChannelId,
        visitorId: generatedVisitorId,
      });

      expect(session2.visitorId).toBe(generatedVisitorId);
      expect(session2.conversationId).toBe(conversationId);

      // Verify in DB that only ONE customer and ONE channel identity exists for this visitor
      await runner.runWithTenant(orgAId, async (tx) => {
        const identities = await tx.customerChannelIdentity.findMany({
          where: {
            channelId: webChatChannelId,
            externalId: generatedVisitorId,
            organizationId: orgAId,
          },
        });
        expect(identities).toHaveLength(1);
      });
    });
  });

  describe('2. Origin Domain Validation (allowed_domains)', () => {
    it('allows session initialization when request Origin matches allowed_domains', async () => {
      const session = await widgetService.initSession(
        { channelId: restrictedChannelId },
        'https://portal.acme.com'
      );
      expect(session.conversationId).toBeDefined();
      expect(session.channel.name).toBe('Acme Secure Portal');
    });

    it('rejects session initialization with ForbiddenException when Origin is not allowed', async () => {
      await expect(
        widgetService.initSession(
          { channelId: restrictedChannelId },
          'https://unauthorized-phishing.com'
        )
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows any Origin when allowed_domains includes wildcard "*"', async () => {
      const session = await widgetService.initSession(
        { channelId: webChatChannelId },
        'https://arbitrary-site.org'
      );
      expect(session.conversationId).toBeDefined();
    });
  });

  describe('3. Channel Status & Provider Guard', () => {
    it('rejects initialization for non-existent channel with NotFoundException', async () => {
      await expect(
        widgetService.initSession({
          channelId: '00000000-0000-0000-0000-000000000000',
        })
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects initialization for non-WEB_CHAT provider channel (e.g. WhatsApp) with NotFoundException', async () => {
      await expect(
        widgetService.initSession({
          channelId: whatsAppChannelId,
        })
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('4. Visitor Capability Guard & Dashboard Route Separation', () => {
    it('visitor capability token is rejected by dashboard JwtAuthGuard with 403 Forbidden', () => {
      const visitorToken = tokenService.generateWidgetToken({
        sub: 'visitor-123',
        channelId: webChatChannelId,
        orgId: orgAId,
        conversationId: 'conv-123',
        type: 'WIDGET_VISITOR',
      });

      // Mock context requesting dashboard route with visitor token
      const mockContext: any = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { authorization: `Bearer ${visitorToken}` },
            cookies: {},
          }),
        }),
      };

      expect(() => jwtAuthGuard.canActivate(mockContext)).toThrow(ForbiddenException);
    });

    it('rejects forged or expired visitor token with UnauthorizedException', () => {
      expect(() =>
        tokenService.verifyWidgetToken('invalid.jwt.token.signature')
      ).toThrow();
    });
  });

  describe('5. Bi-Directional Message Exchange & History Retrieval', () => {
    let visitorSession: any;

    beforeAll(async () => {
      visitorSession = await widgetService.initSession({
        channelId: webChatChannelId,
        customerProfile: { name: 'Alex Johnson', email: 'alex@example.com' },
      });
    });

    it('visitor sends a message and retrieves updated chronological conversation history', async () => {
      const visitorPayload: any = tokenService.verifyWidgetToken(visitorSession.visitorToken);

      // Visitor sends message
      const sendResult = await widgetService.sendMessage(visitorPayload, {
        content: 'Hello, what are your business hours?',
      });

      expect(sendResult.message.id).toBeDefined();
      expect(sendResult.message.senderType).toBe('CUSTOMER');
      expect(sendResult.message.content).toBe('Hello, what are your business hours?');

      // Visitor retrieves conversation history
      const history = await widgetService.getConversation(visitorPayload);
      expect(history.conversation.id).toBe(visitorSession.conversationId);
      expect(history.messages.length).toBeGreaterThanOrEqual(1);

      const lastMsg = history.messages[history.messages.length - 1];
      expect(lastMsg.content).toBe('Hello, what are your business hours?');
      expect(lastMsg.senderType).toBe('CUSTOMER');
    });

    it('human agent reply in dashboard is reflected in visitor conversation history', async () => {
      const visitorPayload: any = tokenService.verifyWidgetToken(visitorSession.visitorToken);

      // Agent replies via ConversationsService
      await conversationsService.createMessage(orgAId, visitorSession.conversationId, {
        senderType: 'AGENT',
        content: 'Hi Alex! We are open Monday through Friday, 9am to 6pm EST.',
      });

      // Visitor queries conversation
      const history = await widgetService.getConversation(visitorPayload);
      const agentMsg = history.messages.find((m) => m.senderType === 'AGENT');
      expect(agentMsg).toBeDefined();
      expect(agentMsg?.content).toContain('9am to 6pm EST');
    });

    it('visitor message automatically re-opens a RESOLVED conversation', async () => {
      const visitorPayload: any = tokenService.verifyWidgetToken(visitorSession.visitorToken);

      // Agent resolves the conversation
      await conversationsService.updateConversationStatus(orgAId, visitorSession.conversationId, 'RESOLVED');

      let history = await widgetService.getConversation(visitorPayload);
      expect(history.conversation.status).toBe('RESOLVED');

      // Customer sends a new message
      await widgetService.sendMessage(visitorPayload, {
        content: 'Wait, I have one more question!',
      });

      // Conversation must be automatically re-opened to OPEN
      history = await widgetService.getConversation(visitorPayload);
      expect(history.conversation.status).toBe('OPEN');
    });
  });

  describe('6. Abuse Prevention & Message Rate Limiting', () => {
    it('exceeding 10 messages/minute throws BadRequestException rate limit', async () => {
      const session = await widgetService.initSession({
        channelId: webChatChannelId,
      });
      const visitorPayload: any = tokenService.verifyWidgetToken(session.visitorToken);

      // Send 10 messages in rapid succession (within limit)
      for (let i = 0; i < 10; i++) {
        await widgetService.sendMessage(visitorPayload, { content: `Message ${i + 1}` });
      }

      // 11th message must be blocked by rate limiter
      await expect(
        widgetService.sendMessage(visitorPayload, { content: 'Message 11 - spam' })
      ).rejects.toThrow(BadRequestException);
    });
  });
});
