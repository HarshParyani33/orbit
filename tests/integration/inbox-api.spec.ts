import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaService } from '../../apps/api/src/prisma/prisma.service';
import { TenantTransactionRunner } from '../../apps/api/src/tenancy/tenant-transaction-runner';
import { ChannelsService } from '../../apps/api/src/channels/channels.service';
import { ConversationsService } from '../../apps/api/src/conversations/conversations.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('Milestone 2 Slice 2.2 — Agent Inbox Query & Mutation API Integration Tests', () => {
  let prisma: PrismaService;
  let runner: TenantTransactionRunner;
  let channelsService: ChannelsService;
  let conversationsService: ConversationsService;

  let orgAId: string;
  let orgBId: string;
  let channelA1Id: string;
  let channelA2Id: string;
  let channelBId: string;

  let convOpenId: string;
  let convSnoozedId: string;
  let convResolvedId: string;

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

    // Create 2 channels in Org A: WhatsApp and Web Chat
    const chA1 = await channelsService.createChannel(orgAId, {
      name: 'Acme Support Desk',
      provider: 'WEB_CHAT',
    });
    channelA1Id = chA1.id;

    const chA2 = await channelsService.createChannel(orgAId, {
      name: 'Acme WhatsApp VIP',
      provider: 'META_WHATSAPP',
    });
    channelA2Id = chA2.id;

    // Create 1 channel in Org B
    const chB = await channelsService.createChannel(orgBId, {
      name: 'Beta Global Desk',
      provider: 'WEB_CHAT',
    });
    channelBId = chB.id;

    // Seed conversations in Org A with distinct statuses
    const c1 = await conversationsService.createConversation(orgAId, {
      channelId: channelA1Id,
      title: 'Ticket #1 - Needs Help',
      initialMessage: 'Customer question 1',
    });
    convOpenId = c1.id;

    const c2 = await conversationsService.createConversation(orgAId, {
      channelId: channelA1Id,
      title: 'Ticket #2 - Snoozed Inquiry',
      initialMessage: 'Customer question 2',
    });
    await conversationsService.updateConversationStatus(orgAId, c2.id, 'SNOOZED');
    convSnoozedId = c2.id;

    const c3 = await conversationsService.createConversation(orgAId, {
      channelId: channelA2Id,
      title: 'Ticket #3 - Resolved Issue',
      initialMessage: 'Customer question 3',
    });
    await conversationsService.updateConversationStatus(orgAId, c3.id, 'RESOLVED');
    convResolvedId = c3.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('1. Agent Inbox Filtering & Search Feeds', () => {
    it('returns all conversations when no status filter is applied', async () => {
      const all = await conversationsService.listConversations(orgAId, { limit: 50 });
      expect(all.length).toBeGreaterThanOrEqual(3);
      expect(all.some((c) => c.id === convOpenId)).toBe(true);
      expect(all.some((c) => c.id === convSnoozedId)).toBe(true);
      expect(all.some((c) => c.id === convResolvedId)).toBe(true);
    });

    it('filters strictly by OPEN status', async () => {
      const open = await conversationsService.listConversations(orgAId, {
        status: 'OPEN',
        limit: 50,
      });
      expect(open.some((c) => c.id === convOpenId)).toBe(true);
      expect(open.some((c) => c.id === convSnoozedId)).toBe(false);
      expect(open.some((c) => c.id === convResolvedId)).toBe(false);
    });

    it('filters strictly by SNOOZED status', async () => {
      const snoozed = await conversationsService.listConversations(orgAId, {
        status: 'SNOOZED',
        limit: 50,
      });
      expect(snoozed.some((c) => c.id === convSnoozedId)).toBe(true);
      expect(snoozed.some((c) => c.id === convOpenId)).toBe(false);
      expect(snoozed.some((c) => c.id === convResolvedId)).toBe(false);
    });

    it('filters strictly by RESOLVED status', async () => {
      const resolved = await conversationsService.listConversations(orgAId, {
        status: 'RESOLVED',
        limit: 50,
      });
      expect(resolved.some((c) => c.id === convResolvedId)).toBe(true);
      expect(resolved.some((c) => c.id === convOpenId)).toBe(false);
      expect(resolved.some((c) => c.id === convSnoozedId)).toBe(false);
    });

    it('filters strictly by channelId', async () => {
      const vipConversations = await conversationsService.listConversations(orgAId, {
        channelId: channelA2Id,
        limit: 50,
      });
      expect(vipConversations.every((c) => c.channelId === channelA2Id)).toBe(true);
      expect(vipConversations.some((c) => c.id === convResolvedId)).toBe(true);
      expect(vipConversations.some((c) => c.id === convOpenId)).toBe(false);
    });
  });

  describe('2. Detail Thread & Agent Reply Exchange', () => {
    it('retrieves conversation thread with chronological message history', async () => {
      const thread = await conversationsService.getConversation(orgAId, convOpenId);
      expect(thread.id).toBe(convOpenId);
      expect(thread.messages).toHaveLength(1);
      expect(thread.messages[0].senderType).toBe('CUSTOMER');
    });

    it('allows agent to send multiple replies in sequence', async () => {
      const r1 = await conversationsService.createMessage(orgAId, convOpenId, {
        senderType: 'AGENT',
        content: 'Agent reply 1: Looking into your request.',
      });
      expect(r1.senderType).toBe('AGENT');

      const r2 = await conversationsService.createMessage(orgAId, convOpenId, {
        senderType: 'AGENT',
        content: 'Agent reply 2: Here is your solution.',
      });
      expect(r2.senderType).toBe('AGENT');

      const thread = await conversationsService.getConversation(orgAId, convOpenId);
      expect(thread.messages).toHaveLength(3);
      expect(thread.messages[1].content).toBe('Agent reply 1: Looking into your request.');
      expect(thread.messages[2].content).toBe('Agent reply 2: Here is your solution.');
    });

    it('updates ticket status through full triage lifecycle', async () => {
      // Transition from OPEN to SNOOZED
      const s1 = await conversationsService.updateConversationStatus(orgAId, convOpenId, 'SNOOZED');
      expect(s1.status).toBe('SNOOZED');

      // Transition from SNOOZED to RESOLVED
      const s2 = await conversationsService.updateConversationStatus(orgAId, convOpenId, 'RESOLVED');
      expect(s2.status).toBe('RESOLVED');

      // Transition from RESOLVED back to OPEN
      const s3 = await conversationsService.updateConversationStatus(orgAId, convOpenId, 'OPEN');
      expect(s3.status).toBe('OPEN');
    });
  });

  describe('3. Multi-Tenant Boundary Invariants', () => {
    it('Org B agent cannot list or access any conversations from Org A', async () => {
      const orgBList = await conversationsService.listConversations(orgBId, { limit: 50 });
      expect(orgBList.some((c) => c.id === convOpenId)).toBe(false);
      expect(orgBList.some((c) => c.id === convSnoozedId)).toBe(false);
      expect(orgBList.some((c) => c.id === convResolvedId)).toBe(false);
    });

    it('Org B agent attempting to fetch Org A ticket details receives NotFoundException (404)', async () => {
      await expect(conversationsService.getConversation(orgBId, convOpenId)).rejects.toThrow(
        NotFoundException
      );
    });

    it('Org B agent attempting to post a reply to Org A ticket receives NotFoundException (404)', async () => {
      await expect(
        conversationsService.createMessage(orgBId, convOpenId, {
          senderType: 'AGENT',
          content: 'Cross-tenant agent reply attempt',
        })
      ).rejects.toThrow(NotFoundException);
    });

    it('Org B agent attempting to change status of Org A ticket receives NotFoundException (404)', async () => {
      await expect(
        conversationsService.updateConversationStatus(orgBId, convOpenId, 'RESOLVED')
      ).rejects.toThrow(NotFoundException);
    });
  });
});
