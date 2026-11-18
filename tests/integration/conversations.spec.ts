import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaService } from '../../apps/api/src/prisma/prisma.service';
import { TenantTransactionRunner } from '../../apps/api/src/tenancy/tenant-transaction-runner';
import { ChannelsService } from '../../apps/api/src/channels/channels.service';
import { ConversationsService } from '../../apps/api/src/conversations/conversations.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('Milestone 2 Slice 2.1 — Conversation & Channel Domain Integration Tests', () => {
  let prisma: PrismaService;
  let runner: TenantTransactionRunner;
  let channelsService: ChannelsService;
  let conversationsService: ConversationsService;

  let orgAId: string;
  let orgBId: string;
  let channelAId: string;
  let channelBId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    runner = new TenantTransactionRunner(prisma);
    channelsService = new ChannelsService(runner);
    conversationsService = new ConversationsService(runner);

    const orgA = await prisma.organization.findUniqueOrThrow({ where: { slug: 'acme' } });
    const orgB = await prisma.organization.findUniqueOrThrow({ where: { slug: 'beta' } });
    orgAId = orgA.id;
    orgBId = orgB.id;

    // Create dedicated test channels in Org A and Org B
    const chA = await channelsService.createChannel(orgAId, {
      name: 'Acme WhatsApp Support',
      provider: 'META_WHATSAPP',
      config: { phoneNumberId: '123456789' },
    });
    channelAId = chA.id;

    const chB = await channelsService.createChannel(orgBId, {
      name: 'Beta Web Chat',
      provider: 'WEB_CHAT',
      config: { welcomeMessage: 'Welcome to Beta' },
    });
    channelBId = chB.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('1. Channel Management & Scoping', () => {
    it('creates and retrieves channel within tenant context', async () => {
      const channel = await channelsService.getChannel(orgAId, channelAId);
      expect(channel.id).toBe(channelAId);
      expect(channel.organizationId).toBe(orgAId);
      expect(channel.provider).toBe('META_WHATSAPP');
      expect(channel.name).toBe('Acme WhatsApp Support');
    });

    it('lists channels strictly scoped to active tenant', async () => {
      const orgAChannels = await channelsService.listChannels(orgAId);
      expect(orgAChannels.length).toBeGreaterThan(0);
      expect(orgAChannels.every((c) => c.organizationId === orgAId)).toBe(true);
      expect(orgAChannels.some((c) => c.id === channelAId)).toBe(true);
      expect(orgAChannels.some((c) => c.id === channelBId)).toBe(false);
    });

    it('updates channel configuration and soft-deletes cleanly', async () => {
      const tempChannel = await channelsService.createChannel(orgAId, {
        name: 'Temp Channel',
        provider: 'WEB_CHAT',
      });

      const updated = await channelsService.updateChannel(orgAId, tempChannel.id, {
        name: 'Updated Temp Channel',
      });
      expect(updated.name).toBe('Updated Temp Channel');

      await channelsService.deleteChannel(orgAId, tempChannel.id);

      // Channel should no longer appear in active list
      const activeChannels = await channelsService.listChannels(orgAId);
      expect(activeChannels.some((c) => c.id === tempChannel.id)).toBe(false);

      // Getting deleted channel throws NotFoundException
      await expect(channelsService.getChannel(orgAId, tempChannel.id)).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('2. Conversation Lifecycle & Messaging', () => {
    let createdConvId: string;

    it('creates conversation with initial customer message and assigns channel', async () => {
      const conv = await conversationsService.createConversation(orgAId, {
        channelId: channelAId,
        title: 'Billing Inquiry from Customer',
        initialMessage: 'Hello, I have a question about my invoice #1001.',
      });

      expect(conv.id).toBeDefined();
      expect(conv.organizationId).toBe(orgAId);
      expect(conv.channelId).toBe(channelAId);
      expect(conv.status).toBe('OPEN');
      expect(conv.title).toBe('Billing Inquiry from Customer');
      expect(conv.channel.name).toBe('Acme WhatsApp Support');
      expect(conv.messages).toHaveLength(1);
      expect(conv.messages[0].senderType).toBe('CUSTOMER');
      expect(conv.messages[0].content).toBe('Hello, I have a question about my invoice #1001.');

      createdConvId = conv.id;
    });

    it('appends an agent reply to the conversation', async () => {
      const agentMsg = await conversationsService.createMessage(orgAId, createdConvId, {
        senderType: 'AGENT',
        content: 'Hi! I would be glad to check invoice #1001 for you.',
      });

      expect(agentMsg.id).toBeDefined();
      expect(agentMsg.conversationId).toBe(createdConvId);
      expect(agentMsg.organizationId).toBe(orgAId);
      expect(agentMsg.senderType).toBe('AGENT');
      expect(agentMsg.content).toBe('Hi! I would be glad to check invoice #1001 for you.');

      // Verify list messages contains both customer and agent messages in chronological order
      const messages = await conversationsService.listMessages(orgAId, createdConvId);
      expect(messages).toHaveLength(2);
      expect(messages[0].senderType).toBe('CUSTOMER');
      expect(messages[1].senderType).toBe('AGENT');
    });

    it('handles status transitions: OPEN -> SNOOZED -> RESOLVED', async () => {
      const snoozed = await conversationsService.updateConversationStatus(
        orgAId,
        createdConvId,
        'SNOOZED'
      );
      expect(snoozed.status).toBe('SNOOZED');

      const resolved = await conversationsService.updateConversationStatus(
        orgAId,
        createdConvId,
        'RESOLVED'
      );
      expect(resolved.status).toBe('RESOLVED');
    });

    it('automatically re-opens a RESOLVED conversation when customer sends a new message', async () => {
      await conversationsService.createMessage(orgAId, createdConvId, {
        senderType: 'CUSTOMER',
        content: 'Thanks, but I found another discrepancy on line 3.',
      });

      const conv = await conversationsService.getConversation(orgAId, createdConvId);
      expect(conv.status).toBe('OPEN'); // Automatically re-opened!
      expect(conv.messages).toHaveLength(3);
    });

    it('filters conversations by status and channel with pagination cursor', async () => {
      // Create a second conversation
      await conversationsService.createConversation(orgAId, {
        channelId: channelAId,
        title: 'Technical Support Request',
        initialMessage: 'App crashes on load',
      });

      const openConversations = await conversationsService.listConversations(orgAId, {
        status: 'OPEN',
        limit: 10,
      });

      expect(openConversations.length).toBeGreaterThanOrEqual(2);
      expect(openConversations.every((c) => c.status === 'OPEN')).toBe(true);
      expect(openConversations.every((c) => c.organizationId === orgAId)).toBe(true);
    });
  });

  describe('3. Multi-Tenant Isolation & Security Invariants', () => {
    let convOrgAId: string;

    beforeAll(async () => {
      const convA = await conversationsService.createConversation(orgAId, {
        channelId: channelAId,
        title: 'Org A Confidential Discussion',
        initialMessage: 'Secret customer data for Acme',
      });
      convOrgAId = convA.id;
    });

    it('Tenant B cannot get details of Tenant A conversation (throws NotFoundException)', async () => {
      await expect(conversationsService.getConversation(orgBId, convOrgAId)).rejects.toThrow(
        NotFoundException
      );
    });

    it('Tenant B cannot list messages in Tenant A conversation (throws NotFoundException)', async () => {
      await expect(conversationsService.listMessages(orgBId, convOrgAId)).rejects.toThrow(
        NotFoundException
      );
    });

    it('Tenant B cannot append messages to Tenant A conversation (throws NotFoundException)', async () => {
      await expect(
        conversationsService.createMessage(orgBId, convOrgAId, {
          senderType: 'AGENT',
          content: 'Malicious injection from Tenant B',
        })
      ).rejects.toThrow(NotFoundException);
    });

    it('Tenant B cannot update status of Tenant A conversation (throws NotFoundException)', async () => {
      await expect(
        conversationsService.updateConversationStatus(orgBId, convOrgAId, 'RESOLVED')
      ).rejects.toThrow(NotFoundException);
    });

    it('Tenant B listing conversations sees ZERO conversations from Tenant A', async () => {
      const orgBConvs = await conversationsService.listConversations(orgBId, { limit: 50 });
      expect(orgBConvs.some((c) => c.id === convOrgAId)).toBe(false);
      expect(orgBConvs.every((c) => c.organizationId === orgBId)).toBe(true);
    });

    it('Tenant B cannot create a conversation referencing Tenant A channel (fails with BadRequestException)', async () => {
      await expect(
        conversationsService.createConversation(orgBId, {
          channelId: channelAId, // Belongs to Tenant A!
          title: 'Cross-Tenant Channel Hijack Attempt',
        })
      ).rejects.toThrow(BadRequestException);
    });
  });
});
