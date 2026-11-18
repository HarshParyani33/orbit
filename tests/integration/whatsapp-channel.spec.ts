import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaService } from '../../apps/api/src/prisma/prisma.service';
import { TenantTransactionRunner } from '../../apps/api/src/tenancy/tenant-transaction-runner';
import { ChannelsService } from '../../apps/api/src/channels/channels.service';
import { ConversationsService } from '../../apps/api/src/conversations/conversations.service';
import { AutomationsService } from '../../apps/api/src/automations/automations.service';
import { RealtimeGateway } from '../../apps/api/src/realtime/realtime.gateway';
import { RealtimeService } from '../../apps/api/src/realtime/realtime.service';
import { WhatsAppIngestionService } from '../../apps/api/src/webhooks/whatsapp-ingestion.service';
import { IngressDatabaseService } from '../../apps/api/src/webhooks/ingress-database.service';
import { WebhookOutboxService } from '../../apps/api/src/webhooks/webhook-outbox.service';
import { WebhooksController } from '../../apps/api/src/webhooks/webhooks.controller';
import { MetaSignatureGuard } from '../../apps/api/src/webhooks/guards/meta-signature.guard';
import { MockWhatsAppAdapter } from '@orbit/integrations';
import { JwtService } from '@nestjs/jwt';
import { ExecutionContext } from '@nestjs/common';
import { getConfig } from '@orbit/config';
import * as crypto from 'crypto';

describe('Milestone 3 Slice 3.2 — Meta WhatsApp Channel Adapter & Webhook Ingestion Tests', () => {
  let prisma: PrismaService;
  let runner: TenantTransactionRunner;
  let channelsService: ChannelsService;
  let conversationsService: ConversationsService;
  let automationsService: AutomationsService;
  let realtimeGateway: RealtimeGateway;
  let realtimeService: RealtimeService;
  let whatsAppIngestion: WhatsAppIngestionService;
  let ingressDb: IngressDatabaseService;
  let outboxService: WebhookOutboxService;
  let controller: WebhooksController;
  let signatureGuard: MetaSignatureGuard;
  let mockWhatsAppAdapter: MockWhatsAppAdapter;

  let orgAId: string;
  let orgBId: string;
  let waChannelAId: string;
  const testPhoneNumberId = '109876543210999';

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    runner = new TenantTransactionRunner(prisma);
    channelsService = new ChannelsService(runner);
    automationsService = new AutomationsService(runner);

    const jwtService = new JwtService({});
    realtimeGateway = new RealtimeGateway(jwtService, prisma, runner);
    realtimeService = new RealtimeService(realtimeGateway);

    mockWhatsAppAdapter = new MockWhatsAppAdapter();
    conversationsService = new ConversationsService(runner, realtimeService, automationsService);
    conversationsService.setWhatsAppAdapter(mockWhatsAppAdapter);

    whatsAppIngestion = new WhatsAppIngestionService(
      prisma,
      runner,
      realtimeService,
      automationsService
    );
    whatsAppIngestion.setWhatsAppAdapter(mockWhatsAppAdapter);

    ingressDb = new IngressDatabaseService();
    ingressDb.onModuleInit();

    outboxService = new WebhookOutboxService(prisma, runner);
    controller = new WebhooksController(ingressDb, outboxService, whatsAppIngestion);
    signatureGuard = new MetaSignatureGuard();

    const orgA = await prisma.organization.findUniqueOrThrow({ where: { slug: 'acme' } });
    const orgB = await prisma.organization.findUniqueOrThrow({ where: { slug: 'beta' } });
    orgAId = orgA.id;
    orgBId = orgB.id;

    // Create and register WhatsApp channel
    const waChan = await channelsService.createChannel(orgAId, {
      name: 'Acme Official WhatsApp',
      provider: 'META_WHATSAPP',
      config: { phoneNumberId: testPhoneNumberId },
    });
    waChannelAId = waChan.id;

    await runner.runWithTenant(orgAId, async (tx) => {
      await tx.$executeRaw`SELECT register_channel_routing(${waChannelAId}::uuid, 'META_WHATSAPP', ${testPhoneNumberId})`;
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
  // 1. INBOUND WHATSAPP MESSAGE INGESTION & CUSTOMER CRM LINKING
  // --------------------------------------------------------------------------
  describe('1. Inbound WhatsApp Message Ingestion & Verified Identity Linking', () => {
    it('creates new Customer, verified ChannelIdentity, Conversation, and Message on first inbound inquiry', async () => {
      const customerPhone = '+15559876599';
      const wamid = `wamid.msg_${Date.now()}_01`;
      const webhookPayload = {
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: testPhoneNumberId },
                  contacts: [{ wa_id: customerPhone, profile: { name: 'Alice Customer' } }],
                  messages: [
                    {
                      id: wamid,
                      from: customerPhone,
                      type: 'text',
                      timestamp: '1731940000',
                      text: { body: 'Hello Acme Support! I have a question.' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const ctx = createSignedContext(webhookPayload);
      expect(signatureGuard.canActivate(ctx)).toBe(true);

      const response = await controller.handleWhatsAppWebhook(webhookPayload);
      expect(response.status).toBe('success');
      expect(response.received).toBe(true);

      // Verify database records in tenant context
      await runner.runWithTenant(orgAId, async (tx) => {
        // 1. Verify Customer created
        const customer = await tx.customer.findFirstOrThrow({
          where: { phone: customerPhone },
        });
        expect(customer.name).toBe('Alice Customer');

        // 2. Verify CustomerChannelIdentity created with verified: true
        const identity = await tx.customerChannelIdentity.findUniqueOrThrow({
          where: {
            uq_channel_identities_channel_ext: {
              channelId: waChannelAId,
              externalId: customerPhone,
            },
          },
        });
        expect(identity.customerId).toBe(customer.id);
        expect(identity.verified).toBe(true);
        expect(identity.provider).toBe('META_WHATSAPP');

        // 3. Verify Conversation created
        const conversation = await tx.conversation.findFirstOrThrow({
          where: {
            channelId: waChannelAId,
            customerId: customer.id,
          },
        });
        expect(conversation.title).toBe('WhatsApp: Alice Customer');
        expect(conversation.status).toBe('OPEN');

        // 4. Verify Message created
        const message = await tx.message.findFirstOrThrow({
          where: {
            conversationId: conversation.id,
            senderType: 'CUSTOMER',
          },
        });
        expect(message.content).toBe('Hello Acme Support! I have a question.');
      });
    });
  });

  // --------------------------------------------------------------------------
  // 2. THREAD CONTINUITY & CONVERSATION RE-OPENING
  // --------------------------------------------------------------------------
  describe('2. Thread Continuity & Conversation Re-Opening', () => {
    it('appends subsequent messages from same customer to existing active thread without duplicate records', async () => {
      const customerPhone = '+15559876599';
      const secondWamid = `wamid.msg_${Date.now()}_02`;
      const webhookPayload = {
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: testPhoneNumberId },
                  contacts: [{ wa_id: customerPhone, profile: { name: 'Alice Customer' } }],
                  messages: [
                    {
                      id: secondWamid,
                      from: customerPhone,
                      type: 'text',
                      timestamp: '1731940020',
                      text: { body: 'Also checking my order status' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      await controller.handleWhatsAppWebhook(webhookPayload);

      // Verify that still exactly 1 customer and 1 conversation exist, with 2 messages
      await runner.runWithTenant(orgAId, async (tx) => {
        const customers = await tx.customer.findMany({ where: { phone: customerPhone } });
        expect(customers.length).toBe(1);

        const conversations = await tx.conversation.findMany({
          where: { channelId: waChannelAId, customerId: customers[0].id },
        });
        expect(conversations.length).toBe(1);

        const messages = await tx.message.findMany({
          where: { conversationId: conversations[0].id },
          orderBy: { createdAt: 'asc' },
        });
        expect(messages.length).toBe(2);
        expect(messages[1].content).toBe('Also checking my order status');
      });
    });

    it('re-opens snoozed conversation when customer sends a new message', async () => {
      const customerPhone = '+15559876599';

      // Snooze conversation
      const conv = await runner.runWithTenant(orgAId, async (tx) => {
        const c = await tx.conversation.findFirstOrThrow({
          where: { channelId: waChannelAId },
        });
        return tx.conversation.update({
          where: { uq_conversations_id_org: { id: c.id, organizationId: orgAId } },
          data: { status: 'SNOOZED' },
        });
      });
      expect(conv.status).toBe('SNOOZED');

      // Customer sends message
      const thirdWamid = `wamid.msg_${Date.now()}_03`;
      const webhookPayload = {
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: testPhoneNumberId },
                  contacts: [{ wa_id: customerPhone, profile: { name: 'Alice Customer' } }],
                  messages: [
                    {
                      id: thirdWamid,
                      from: customerPhone,
                      type: 'text',
                      timestamp: '1731940050',
                      text: { body: 'Are you there?' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      await controller.handleWhatsAppWebhook(webhookPayload);

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
  // 3. OUTBOUND AGENT MESSAGE DISPATCH VIA WHATSAPP ADAPTER
  // --------------------------------------------------------------------------
  describe('3. Outbound Agent Reply Dispatch via WhatsApp Adapter', () => {
    it('agent sending reply on WhatsApp channel dispatches message via IWhatsAppAdapter', async () => {
      mockWhatsAppAdapter.clear();

      // Find active conversation
      const conv = await runner.runWithTenant(orgAId, async (tx) => {
        return tx.conversation.findFirstOrThrow({
          where: { channelId: waChannelAId },
        });
      });

      // Agent replies via conversationsService
      const agentReply = await conversationsService.createMessage(orgAId, conv.id, {
        senderType: 'AGENT',
        content: 'Hi Alice, your order #8841 has shipped!',
      });

      expect(agentReply.senderType).toBe('AGENT');
      expect(agentReply.content).toBe('Hi Alice, your order #8841 has shipped!');

      // Verify that MockWhatsAppAdapter received the outbound dispatch call
      const sent = mockWhatsAppAdapter.getSentMessages();
      expect(sent.length).toBe(1);
      expect(sent[0].to).toBe('+15559876599');
      expect(sent[0].text).toBe('Hi Alice, your order #8841 has shipped!');
      expect(sent[0].phoneNumberId).toBe(testPhoneNumberId);
    });
  });

  // --------------------------------------------------------------------------
  // 4. AUTOMATION ENGINE TRIGGER ON WHATSAPP INGRESS
  // --------------------------------------------------------------------------
  describe('4. Automation Engine Trigger on WhatsApp Message Ingress', () => {
    it('triggers automation rule on customer WhatsApp message and executes action', async () => {
      // Create automation rule: if message CONTAINS "cancel", UPDATE_STATUS to SNOOZED
      const createdRule = await automationsService.createRule(orgAId, {
        name: 'Auto-Snooze Cancel Inquiries',
        trigger: 'MESSAGE_RECEIVED',
        conditions: [
          {
            field: 'messageContent',
            operator: 'CONTAINS',
            value: 'cancel order',
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

      const customerPhone = '+15559876599';
      const triggerWamid = `wamid.msg_${Date.now()}_cancel`;
      const webhookPayload = {
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: testPhoneNumberId },
                  contacts: [{ wa_id: customerPhone, profile: { name: 'Alice Customer' } }],
                  messages: [
                    {
                      id: triggerWamid,
                      from: customerPhone,
                      type: 'text',
                      timestamp: '1731940100',
                      text: { body: 'Please cancel order #8841 immediately' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      await controller.handleWhatsAppWebhook(webhookPayload);

      // Verify automation rule executed and status updated to SNOOZED
      await runner.runWithTenant(orgAId, async (tx) => {
        const conv = await tx.conversation.findFirstOrThrow({
          where: { channelId: waChannelAId },
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
    it('Tenant B cannot access or view WhatsApp conversations or messages belonging to Tenant A', async () => {
      const convA = await runner.runWithTenant(orgAId, async (tx) => {
        return tx.conversation.findFirstOrThrow({ where: { channelId: waChannelAId } });
      });

      // Tenant B querying for convA receives null / NotFound
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
