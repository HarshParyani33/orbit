import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaService } from '../../apps/api/src/prisma/prisma.service';
import { TenantTransactionRunner } from '../../apps/api/src/tenancy/tenant-transaction-runner';
import { ChannelsService } from '../../apps/api/src/channels/channels.service';
import { ConversationsService } from '../../apps/api/src/conversations/conversations.service';
import { AutomationsService } from '../../apps/api/src/automations/automations.service';
import { RealtimeGateway } from '../../apps/api/src/realtime/realtime.gateway';
import { RealtimeService } from '../../apps/api/src/realtime/realtime.service';
import { InstagramIngestionService } from '../../apps/api/src/webhooks/instagram-ingestion.service';
import { IngressDatabaseService } from '../../apps/api/src/webhooks/ingress-database.service';
import { WebhookOutboxService } from '../../apps/api/src/webhooks/webhook-outbox.service';
import { WebhooksController } from '../../apps/api/src/webhooks/webhooks.controller';
import { MetaSignatureGuard } from '../../apps/api/src/webhooks/guards/meta-signature.guard';
import { MockInstagramAdapter } from '@orbit/integrations';
import { JwtService } from '@nestjs/jwt';
import { ExecutionContext } from '@nestjs/common';
import { getConfig } from '@orbit/config';
import * as crypto from 'crypto';

describe('Milestone 3 Slice 3.3 — Meta Instagram Channel Adapter & Webhook Ingestion Tests', () => {
  let prisma: PrismaService;
  let runner: TenantTransactionRunner;
  let channelsService: ChannelsService;
  let conversationsService: ConversationsService;
  let automationsService: AutomationsService;
  let realtimeGateway: RealtimeGateway;
  let realtimeService: RealtimeService;
  let instagramIngestion: InstagramIngestionService;
  let ingressDb: IngressDatabaseService;
  let outboxService: WebhookOutboxService;
  let controller: WebhooksController;
  let signatureGuard: MetaSignatureGuard;
  let mockInstagramAdapter: MockInstagramAdapter;

  let orgAId: string;
  let orgBId: string;
  let igChannelAId: string;
  const testInstagramAccountId = 'ig_biz_page_777';
  let testIgsid: string;

  beforeAll(async () => {
    testIgsid = `ig_user_${Date.now()}`;
    prisma = new PrismaService();
    await prisma.$connect();
    runner = new TenantTransactionRunner(prisma);
    channelsService = new ChannelsService(runner);
    automationsService = new AutomationsService(runner);

    const jwtService = new JwtService({});
    realtimeGateway = new RealtimeGateway(jwtService, prisma, runner);
    realtimeService = new RealtimeService(realtimeGateway);

    mockInstagramAdapter = new MockInstagramAdapter();
    conversationsService = new ConversationsService(runner, realtimeService, automationsService);
    conversationsService.setInstagramAdapter(mockInstagramAdapter);

    instagramIngestion = new InstagramIngestionService(
      prisma,
      runner,
      realtimeService,
      automationsService
    );
    instagramIngestion.setInstagramAdapter(mockInstagramAdapter);

    ingressDb = new IngressDatabaseService();
    ingressDb.onModuleInit();

    outboxService = new WebhookOutboxService(prisma, runner);
    controller = new WebhooksController(ingressDb, outboxService, undefined, instagramIngestion);
    signatureGuard = new MetaSignatureGuard();

    const orgA = await prisma.organization.findUniqueOrThrow({ where: { slug: 'acme' } });
    const orgB = await prisma.organization.findUniqueOrThrow({ where: { slug: 'beta' } });
    orgAId = orgA.id;
    orgBId = orgB.id;

    // Create and register Instagram channel
    const igChan = await channelsService.createChannel(orgAId, {
      name: 'Acme Official Instagram Direct',
      provider: 'META_INSTAGRAM',
      config: { accountId: testInstagramAccountId },
    });
    igChannelAId = igChan.id;

    await runner.runWithTenant(orgAId, async (tx) => {
      await tx.$executeRaw`SELECT register_channel_routing(${igChannelAId}::uuid, 'META_INSTAGRAM', ${testInstagramAccountId})`;
    });
  });

  afterAll(async () => {
    await ingressDb.onModuleDestroy();
    await prisma.$disconnect();
  });

  function createSignedContext(payload: any): ExecutionContext {
    const config = getConfig();
    const rawBody = Buffer.from(JSON.stringify(payload), 'utf8');
    const signature = crypto
      .createHmac('sha256', config.META_APP_SECRET)
      .update(rawBody)
      .digest('hex');

    const req = {
      headers: { 'x-hub-signature-256': `sha256=${signature}` },
      body: payload,
      rawBody,
    };
    return {
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => ({}),
        getNext: () => ({}),
      }),
    } as unknown as ExecutionContext;
  }

  // --------------------------------------------------------------------------
  // 1. INBOUND INSTAGRAM DM INGESTION & CUSTOMER CRM LINKING
  // --------------------------------------------------------------------------
  describe('1. Inbound Instagram Message Ingestion & Verified Identity Linking', () => {
    it('creates new Customer, verified ChannelIdentity, Conversation, and Message on first inbound Instagram DM', async () => {
      const igsid = testIgsid;
      const mid = `mid.ig_${Date.now()}_01`;
      const webhookPayload = {
        object: 'instagram',
        entry: [
          {
            id: testInstagramAccountId,
            time: 1731940000,
            messaging: [
              {
                sender: { id: igsid },
                recipient: { id: testInstagramAccountId },
                timestamp: 1731940000,
                message: {
                  mid,
                  text: 'Hi! Do you offer international shipping for Instagram followers?',
                },
              },
            ],
          },
        ],
      };

      const ctx = createSignedContext(webhookPayload);
      expect(signatureGuard.canActivate(ctx)).toBe(true);

      const response = await controller.handleInstagramWebhook(webhookPayload);
      expect(response.status).toBe('success');
      expect(response.received).toBe(true);

      // Verify database records in tenant context
      await runner.runWithTenant(orgAId, async (tx) => {
        // 1. Customer created
        const customer = await tx.customer.findFirstOrThrow({
          where: { name: `Instagram User ${igsid}` },
        });
        expect(customer.organizationId).toBe(orgAId);

        // 2. Channel Identity created with verified: true
        const identity = await tx.customerChannelIdentity.findUniqueOrThrow({
          where: {
            uq_channel_identities_channel_ext: {
              channelId: igChannelAId,
              externalId: igsid,
            },
          },
        });
        expect(identity.customerId).toBe(customer.id);
        expect(identity.verified).toBe(true);
        expect(identity.provider).toBe('META_INSTAGRAM');

        // 3. Conversation created
        const conversation = await tx.conversation.findFirstOrThrow({
          where: {
            channelId: igChannelAId,
            customerId: customer.id,
          },
        });
        expect(conversation.title).toBe(`Instagram: ${igsid}`);
        expect(conversation.status).toBe('OPEN');

        // 4. Message created
        const message = await tx.message.findFirstOrThrow({
          where: {
            conversationId: conversation.id,
            senderType: 'CUSTOMER',
          },
        });
        expect(message.content).toBe('Hi! Do you offer international shipping for Instagram followers?');
      });
    });
  });

  // --------------------------------------------------------------------------
  // 2. THREAD CONTINUITY & CONVERSATION RE-OPENING
  // --------------------------------------------------------------------------
  describe('2. Thread Continuity & Conversation Re-Opening', () => {
    it('appends subsequent messages from same IGSID to existing active conversation without duplicate records', async () => {
      const igsid = testIgsid;
      const secondMid = `mid.ig_${Date.now()}_02`;
      const webhookPayload = {
        object: 'instagram',
        entry: [
          {
            id: testInstagramAccountId,
            time: 1731940020,
            messaging: [
              {
                sender: { id: igsid },
                recipient: { id: testInstagramAccountId },
                timestamp: 1731940020,
                message: {
                  mid: secondMid,
                  text: 'Specifically shipping to Canada?',
                },
              },
            ],
          },
        ],
      };

      await controller.handleInstagramWebhook(webhookPayload);

      // Verify still exactly 1 customer, 1 conversation, with 2 messages
      await runner.runWithTenant(orgAId, async (tx) => {
        const customers = await tx.customer.findMany({ where: { name: `Instagram User ${igsid}` } });
        expect(customers.length).toBe(1);

        const conversations = await tx.conversation.findMany({
          where: { channelId: igChannelAId, customerId: customers[0].id },
        });
        expect(conversations.length).toBe(1);

        const messages = await tx.message.findMany({
          where: { conversationId: conversations[0].id },
          orderBy: { createdAt: 'asc' },
        });
        expect(messages.length).toBe(2);
        expect(messages[1].content).toBe('Specifically shipping to Canada?');
      });
    });

    it('re-opens snoozed conversation when Instagram user replies', async () => {
      const igsid = testIgsid;

      // Snooze conversation
      const conv = await runner.runWithTenant(orgAId, async (tx) => {
        const c = await tx.conversation.findFirstOrThrow({
          where: { channelId: igChannelAId },
        });
        return tx.conversation.update({
          where: { uq_conversations_id_org: { id: c.id, organizationId: orgAId } },
          data: { status: 'SNOOZED' },
        });
      });
      expect(conv.status).toBe('SNOOZED');

      // Customer sends message
      const thirdMid = `mid.ig_${Date.now()}_03`;
      const webhookPayload = {
        object: 'instagram',
        entry: [
          {
            id: testInstagramAccountId,
            time: 1731940050,
            messaging: [
              {
                sender: { id: igsid },
                recipient: { id: testInstagramAccountId },
                timestamp: 1731940050,
                message: {
                  mid: thirdMid,
                  text: 'Waiting for your answer',
                },
              },
            ],
          },
        ],
      };

      await controller.handleInstagramWebhook(webhookPayload);

      // Verify conversation transitioned back to OPEN
      await runner.runWithTenant(orgAId, async (tx) => {
        const updated = await tx.conversation.findUniqueOrThrow({
          where: { uq_conversations_id_org: { id: conv.id, organizationId: orgAId } },
        });
        expect(updated.status).toBe('OPEN');
      });
    });
  });

  // --------------------------------------------------------------------------
  // 3. OUTBOUND AGENT MESSAGE DISPATCH VIA INSTAGRAM ADAPTER
  // --------------------------------------------------------------------------
  describe('3. Outbound Agent Reply Dispatch via Instagram Adapter', () => {
    it('agent sending reply on Instagram channel dispatches message via IInstagramAdapter', async () => {
      mockInstagramAdapter.clear();

      // Find active conversation
      const conv = await runner.runWithTenant(orgAId, async (tx) => {
        return tx.conversation.findFirstOrThrow({
          where: { channelId: igChannelAId },
        });
      });

      // Agent replies via conversationsService
      const agentReply = await conversationsService.createMessage(orgAId, conv.id, {
        senderType: 'AGENT',
        content: 'Hi! Yes, we offer express delivery across Canada!',
      });

      expect(agentReply.senderType).toBe('AGENT');
      expect(agentReply.content).toBe('Hi! Yes, we offer express delivery across Canada!');

      // Verify that MockInstagramAdapter received outbound dispatch call
      const sent = mockInstagramAdapter.getSentMessages();
      expect(sent.length).toBe(1);
      expect(sent[0].recipientIgsid).toBe(testIgsid);
      expect(sent[0].text).toBe('Hi! Yes, we offer express delivery across Canada!');
      expect(sent[0].accountId).toBe(testInstagramAccountId);
    });
  });

  // --------------------------------------------------------------------------
  // 4. AUTOMATION ENGINE TRIGGER ON INSTAGRAM INGRESS
  // --------------------------------------------------------------------------
  describe('4. Automation Engine Trigger on Instagram Message Ingress', () => {
    it('triggers automation rule on customer Instagram message and executes action', async () => {
      const createdRule = await automationsService.createRule(orgAId, {
        name: 'Auto-Snooze Return Queries',
        trigger: 'MESSAGE_RECEIVED',
        conditions: [
          {
            field: 'messageContent',
            operator: 'CONTAINS',
            value: 'return policy',
          },
        ],
        actions: [
          {
            type: 'UPDATE_STATUS',
            payload: { status: 'SNOOZED' },
          },
        ],
        enabled: true,
      });

      const igsid = testIgsid;
      const triggerMid = `mid.ig_${Date.now()}_return`;
      const webhookPayload = {
        object: 'instagram',
        entry: [
          {
            id: testInstagramAccountId,
            time: 1731940100,
            messaging: [
              {
                sender: { id: igsid },
                recipient: { id: testInstagramAccountId },
                timestamp: 1731940100,
                message: {
                  mid: triggerMid,
                  text: 'What is your return policy?',
                },
              },
            ],
          },
        ],
      };

      await controller.handleInstagramWebhook(webhookPayload);

      // Verify automation rule executed and status updated to SNOOZED
      await runner.runWithTenant(orgAId, async (tx) => {
        const conv = await tx.conversation.findFirstOrThrow({
          where: { channelId: igChannelAId },
        });
        expect(conv.status).toBe('SNOOZED');

        const audit = await tx.automationExecutionAudit.findFirstOrThrow({
          where: { conversationId: conv.id, ruleId: createdRule.id },
          orderBy: { createdAt: 'desc' },
        });
        expect(audit.matched).toBe(true);
        expect(audit.status).toBe('SUCCESS');
      });
    });
  });

  // --------------------------------------------------------------------------
  // 5. CROSS-TENANT ISOLATION
  // --------------------------------------------------------------------------
  describe('5. Multi-Tenant Isolation', () => {
    it('Tenant B cannot access or view Instagram conversations or messages belonging to Tenant A', async () => {
      const convA = await runner.runWithTenant(orgAId, async (tx) => {
        return tx.conversation.findFirstOrThrow({ where: { channelId: igChannelAId } });
      });

      // Tenant B querying for convA receives null
      const convInB = await runner.runWithTenant(orgBId, async (tx) => {
        return tx.conversation.findUnique({ where: { id: convA.id } });
      });
      expect(convInB).toBeNull();

      // Tenant B querying messages for convA receives empty array
      const messagesInB = await runner.runWithTenant(orgBId, async (tx) => {
        return tx.message.findMany({ where: { conversationId: convA.id } });
      });
      expect(messagesInB.length).toBe(0);
    });
  });
});
