import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/app.config';
import { PrismaService } from '../../apps/api/src/prisma/prisma.service';
import { TenantTransactionRunner } from '../../apps/api/src/tenancy/tenant-transaction-runner';
import { AiService } from '../../apps/api/src/ai/ai.service';
import { KnowledgeService } from '../../apps/api/src/knowledge/knowledge.service';
import { ChannelsService } from '../../apps/api/src/channels/channels.service';
import { ConversationsService } from '../../apps/api/src/conversations/conversations.service';
import {
  CitationValidator,
  GroundingSourceChunk,
} from '@orbit/integrations';

describe('Milestone 4 Slice 4.4: Evidence-Based AI Grounding & Citation Validation Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let runner: TenantTransactionRunner;
  let aiService: AiService;
  let knowledgeService: KnowledgeService;
  let channelsService: ChannelsService;
  let conversationsService: ConversationsService;

  let orgId: string;
  let channelId: string;
  let chunkSlaId: string;
  let docSlaId: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { rawBody: true, logger: false });
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    runner = app.get(TenantTransactionRunner);
    aiService = app.get(AiService);
    knowledgeService = app.get(KnowledgeService);
    channelsService = app.get(ChannelsService);
    conversationsService = app.get(ConversationsService);

    const org = await prisma.organization.findUniqueOrThrow({ where: { slug: 'acme' } });
    orgId = org.id;

    // Create channel for conversations
    const channel = await channelsService.createChannel(orgId, {
      name: 'Grounding Verification Support',
      provider: 'WEB_CHAT',
    });
    channelId = channel.id;

    // Seed Active Knowledge Document
    const doc = await knowledgeService.createDocument(orgId, {
      title: 'Grounding Test: Enterprise Support & SLAs',
      sourceType: 'POLICY',
      content:
        'Enterprise SLA Policy: Enterprise tier customers receive 24/7 dedicated support with a guaranteed first response time under 15 minutes. Pro tier customers receive priority response within 2 hours. Pricing is $99/mo for Pro and $299/mo for Enterprise.',
      metadata: { category: 'support' },
    });
    docSlaId = doc.id;

    // Retrieve chunk ID
    const docWithChunks = await knowledgeService.getDocument(orgId, doc.id);
    chunkSlaId = docWithChunks.chunks[0].id;

    // Seed AI Pricing Schedule for Model
    await runner.runWithTenant(orgId, async (tx) => {
      const existing = await tx.aiModelPricingSchedule.findFirst({
        where: { provider: 'MOCK', canonicalModel: 'gpt-4o-mini' },
      });
      if (!existing) {
        await tx.aiModelPricingSchedule.create({
          data: {
            provider: 'MOCK',
            canonicalModel: 'gpt-4o-mini',
            promptTokenRatePerM: 0.15,
            completionTokenRatePerM: 0.6,
            effectiveFrom: new Date('2026-01-01'),
          },
        });
      }
    });

    // Ensure active AI configuration exists
    const existingConfig = await aiService.getActiveConfiguration(orgId);
    if (!existingConfig) {
      const config = await aiService.createConfiguration(orgId, {
        name: 'Grounding Test AI Configuration',
        systemInstructions: 'You are an accurate customer support assistant.',
        provider: 'MOCK',
        model: 'gpt-4o-mini',
        temperature: 0.2,
      });
      await aiService.activateConfiguration(orgId, config.id, null);
    }
  });

  afterAll(async () => {
    try {
      await runner.runWithTenant(orgId, async (tx) => {
        await tx.message.deleteMany({
          where: { conversation: { channelId } },
        });
        await tx.conversation.deleteMany({
          where: { channelId },
        });
        await tx.knowledgeDocument.deleteMany({
          where: { title: { startsWith: 'Grounding Test' } },
        });
      });
    } catch {
      // Ignore cleanup errors
    }
    await app.close();
  });

  describe('1. CitationValidator Deterministic Contract Tests', () => {
    const chunkMap = new Map<string, GroundingSourceChunk>([
      [
        'chunk-uuid-1',
        {
          id: 'chunk-uuid-1',
          chunkText:
            'Starter plan is $29/mo and Pro plan is $99/mo. All plans include 30 days money-back guarantee.',
          documentTitle: 'Pricing & Plans',
        },
      ],
    ]);

    it('accepts valid citation where all facts exist in cited chunk text', () => {
      const candidate =
        'Our Starter plan is $29/mo and includes 30 days money-back guarantee [Source: chunk-uuid-1].';
      const result = CitationValidator.validate(candidate, chunkMap);

      expect(result.isValid).toBe(true);
      expect(result.violationReason).toBe('NONE');
      expect(result.citedChunkIds).toEqual(['chunk-uuid-1']);
    });

    it('rejects candidate answer citing fabricated or nonexistent chunk ID (INVALID_CITATION_ID)', () => {
      const candidate =
        'Our Pro plan is $99/mo [Source: chunk-fabricated-999].';
      const result = CitationValidator.validate(candidate, chunkMap);

      expect(result.isValid).toBe(false);
      expect(result.violationReason).toBe('INVALID_CITATION_ID');
      expect(result.errorDetails).toContain('chunk-fabricated-999');
    });

    it('rejects candidate answer with hallucinated price entity not in source (UNGROUNDED_ENTITY)', () => {
      const candidate =
        'Our Enterprise plan is $499/mo with unlimited features [Source: chunk-uuid-1].';
      const result = CitationValidator.validate(candidate, chunkMap);

      expect(result.isValid).toBe(false);
      expect(result.violationReason).toBe('UNGROUNDED_ENTITY');
      expect(result.errorDetails).toContain('$499/mo');
    });

    it('rejects candidate answer with hallucinated duration not in source (UNGROUNDED_ENTITY)', () => {
      const candidate =
        'Our refund guarantee extends for 90 days from purchase [Source: chunk-uuid-1].';
      const result = CitationValidator.validate(candidate, chunkMap);

      expect(result.isValid).toBe(false);
      expect(result.violationReason).toBe('UNGROUNDED_ENTITY');
      expect(result.errorDetails).toContain('90 days');
    });
  });

  describe('2. End-to-End AI Assistant Grounding & Verification Invariants', () => {
    const matchingQueryText =
      'Enterprise SLA Policy: Enterprise tier customers receive 24/7 dedicated support with a guaranteed first response time under 15 minutes. Pro tier customers receive priority response within 2 hours. Pricing is $99/mo for Pro and $299/mo for Enterprise.';

    it('generates grounded suggestion with valid citations when relevant knowledge exists', async () => {
      // Create conversation with customer asking about enterprise response time
      const conv = await conversationsService.createConversation(orgId, {
        channelId,
        customerName: 'Enterprise Client',
        initialMessage: matchingQueryText,
      });

      // Mock LLM generates grounded answer with valid citation and exact text facts
      const groundedMockReply = `Enterprise customers receive support with a guaranteed first response time under 15 minutes [Source: ${chunkSlaId}].`;

      const result = await aiService.generateSuggestion(orgId, conv.id, {
        mockReply: groundedMockReply,
      });

      expect(result.bypassed).toBe(false);
      expect(result.suggestion).toBe(groundedMockReply);
      expect(result.citations).toContain(chunkSlaId);
    });

    it('rejects suggestion and escalates to human when model hallucinates a citation ID', async () => {
      const conv = await conversationsService.createConversation(orgId, {
        channelId,
        customerName: 'Enterprise Client',
        initialMessage: matchingQueryText,
      });

      // Mock LLM generates reply citing a fabricated UUID
      const fakeCitationReply = `Our response time is under 15 minutes [Source: c0000000-0000-0000-0000-000000000000].`;

      const result = await aiService.generateSuggestion(orgId, conv.id, {
        mockReply: fakeCitationReply,
      });

      expect(result.bypassed).toBe(true);
      expect(result.reason).toBe('INVALID_CITATION_ID');
      expect((result as any).escalatedToHuman).toBe(true);
    });

    it('rejects suggestion and escalates to human when model hallucinates an ungrounded entity', async () => {
      const conv = await conversationsService.createConversation(orgId, {
        channelId,
        customerName: 'Enterprise Client',
        initialMessage: matchingQueryText,
      });

      // Mock LLM cites real chunk but hallucinates a non-existent $999/mo price
      const hallucinatedPriceReply = `Enterprise SLA is under 15 minutes and costs $999/mo [Source: ${chunkSlaId}].`;

      const result = await aiService.generateSuggestion(orgId, conv.id, {
        mockReply: hallucinatedPriceReply,
      });

      expect(result.bypassed).toBe(true);
      expect(result.reason).toBe('UNGROUNDED_ENTITY');
      expect((result as any).escalatedToHuman).toBe(true);
    });

    it('automatically abstains (LOW_RELEVANCE) when no knowledge meets relevance threshold', async () => {
      // Customer asks about an unrelated topic completely absent from knowledge base
      const conv = await conversationsService.createConversation(orgId, {
        channelId,
        customerName: 'Inquiring Visitor',
        initialMessage: 'What is the flight schedule from Tokyo to Paris on Air France?',
      });

      const result = await aiService.generateSuggestion(orgId, conv.id);

      // Abstains without generating or charging customer
      expect(result.bypassed).toBe(true);
      expect(result.reason).toBe('LOW_RELEVANCE');
      expect((result as any).escalatedToHuman).toBe(true);
      expect((result as any).message).toContain('I do not have sufficient information');
    });
  });
});
