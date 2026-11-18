import {
  Injectable,
  Inject,
  Optional,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { TenantTransactionRunner } from '../tenancy/tenant-transaction-runner';
import { PrismaService } from '../prisma/prisma.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import {
  CreateAiConfigInput,
} from '@orbit/validation';
import {
  IAiProvider,
  MockAiProvider,
  OpenAiProvider,
  AiMessage,
  CitationValidator,
  GroundingSourceChunk,
} from '@orbit/integrations';

@Injectable()
export class AiService {
  constructor(
    @Inject(TenantTransactionRunner)
    private readonly tenantRunner: TenantTransactionRunner,
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(KnowledgeService)
    private readonly knowledgeService?: KnowledgeService,
  ) {}

  private getProviderInstance(provider: string, model: string): IAiProvider {
    if (provider === 'OPENAI') {
      return new OpenAiProvider(process.env.OPENAI_API_KEY);
    }
    return new MockAiProvider(model);
  }

  async getActiveConfiguration(organizationId: string) {
    return this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      return tx.aiConfiguration.findFirst({
        where: {
          organizationId,
          status: 'ACTIVE',
        },
        orderBy: { version: 'desc' },
      });
    });
  }

  async listConfigurations(organizationId: string) {
    return this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      return tx.aiConfiguration.findMany({
        where: { organizationId },
        orderBy: { version: 'desc' },
      });
    });
  }

  async createConfiguration(organizationId: string, data: CreateAiConfigInput) {
    return this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      // Find highest version
      const latest = await tx.aiConfiguration.findFirst({
        where: { organizationId },
        orderBy: { version: 'desc' },
      });
      const nextVersion = (latest?.version || 0) + 1;

      return tx.aiConfiguration.create({
        data: {
          organizationId,
          name: data.name,
          systemInstructions: data.systemInstructions,
          policyRules: data.policyRules,
          provider: data.provider,
          model: data.model,
          temperature: data.temperature,
          status: 'DRAFT',
          version: nextVersion,
        },
      });
    });
  }

  async activateConfiguration(
    organizationId: string,
    configId: string,
    approvedByUserId: string | null
  ) {
    return this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      const config = await tx.aiConfiguration.findFirst({
        where: { id: configId, organizationId },
      });

      if (!config) {
        throw new NotFoundException('Configuration not found');
      }

      // 1. Archive current active configuration
      await tx.aiConfiguration.updateMany({
        where: {
          organizationId,
          status: 'ACTIVE',
        },
        data: {
          status: 'ARCHIVED',
        },
      });

      // 2. Activate the approved version
      return tx.aiConfiguration.update({
        where: {
          uq_ai_configs_id_org: {
            id: configId,
            organizationId,
          },
        },
        data: {
          status: 'ACTIVE',
          approvedAt: new Date(),
          approvedByUserId,
        },
      });
    });
  }

  async generateSuggestion(
    organizationId: string,
    conversationId: string,
    options?: { mockReply?: string; minSimilarity?: number }
  ) {
    return this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      // 1. Fetch conversation and messages
      const conversation = await tx.conversation.findFirst({
        where: { id: conversationId, organizationId },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            take: 20,
          },
        },
      });

      if (!conversation) {
        throw new NotFoundException('Conversation not found');
      }

      // 2. Human Takeover Invariant Check
      if (conversation.status === 'SNOOZED' || conversation.status === 'RESOLVED') {
        return {
          bypassed: true,
          reason: 'HUMAN_TAKEOVER_STATUS_CLOSED',
          message: 'AI generation skipped: conversation is snoozed or resolved',
        };
      }

      const lastMessage = conversation.messages[conversation.messages.length - 1];
      if (lastMessage && lastMessage.senderType === 'AGENT') {
        return {
          bypassed: true,
          reason: 'HUMAN_TAKEOVER_AGENT_REPLIED',
          message: 'AI generation skipped: agent has already replied to customer',
        };
      }

      // 3. Resolve active tenant AI configuration
      const aiConfig = await tx.aiConfiguration.findFirst({
        where: {
          organizationId,
          status: 'ACTIVE',
        },
        orderBy: { version: 'desc' },
      });

      if (!aiConfig) {
        throw new BadRequestException('No active AI configuration found for this organization');
      }

      // 4. Pre-Flight Pricing Schedule Resolution (Fail-Closed Protocol)
      const pricing = await tx.aiModelPricingSchedule.findFirst({
        where: {
          provider: aiConfig.provider,
          canonicalModel: aiConfig.model,
          effectiveFrom: { lte: new Date() },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
        },
        orderBy: { effectiveFrom: 'desc' },
      });

      if (!pricing) {
        throw new BadRequestException(
          `Missing pricing schedule for provider ${aiConfig.provider} and model ${aiConfig.model}`
        );
      }

      // 5. Prompt-Injection & Framing Defense
      const policyRules = Array.isArray(aiConfig.policyRules)
        ? (aiConfig.policyRules as string[])
        : [];

      // 5.1 Semantic Knowledge Retrieval & Grounding (Section 9 Architecture)
      let dynamicInstructions = aiConfig.systemInstructions;
      const chunkMap = new Map<string, GroundingSourceChunk>();

      if (this.knowledgeService) {
        const docCount = await tx.knowledgeDocument.count({
          where: { organizationId, status: 'ACTIVE' },
        });

        if (docCount > 0) {
          const lastCustomerMsg = [...conversation.messages]
            .reverse()
            .find((m) => m.senderType === 'CUSTOMER');

          if (lastCustomerMsg && lastCustomerMsg.content) {
            const knowledgeResults = await this.knowledgeService.searchSimilarChunks(
              organizationId,
              {
                query: lastCustomerMsg.content,
                minSimilarity: options?.minSimilarity ?? 0.7,
                limit: 3,
              },
            );

            if (knowledgeResults.totalMatched === 0) {
              // Insufficient-Evidence Abstention (Section 9.2)
              return {
                bypassed: true,
                reason: 'LOW_RELEVANCE',
                message:
                  'I do not have sufficient information regarding that, but I can connect you with our team.',
                escalatedToHuman: true,
              };
            }

            for (const item of knowledgeResults.results) {
              chunkMap.set(item.id, {
                id: item.id,
                chunkText: item.chunkText,
                documentTitle: item.documentTitle,
              });
            }

            const knowledgeBlock =
              `\n\n<verified_knowledge>\n` +
              knowledgeResults.results
                .map(
                  (r) =>
                    `[Source: ${r.id}] (Title: "${r.documentTitle}")\n${r.chunkText}`,
                )
                .join('\n\n') +
              `\n</verified_knowledge>\n` +
              `CRITICAL INSTRUCTION: You MUST ground your answer strictly in the <verified_knowledge> above. For every factual claim, number, or price, you MUST cite the source chunk using [Source: chunk-id] format. Never fabricate citations or claim facts not present in the sources.`;

            dynamicInstructions = `${dynamicInstructions || ''}\n${knowledgeBlock}`;
          }
        }
      }

      const promptMessages: AiMessage[] = conversation.messages.map((m) => {
        if (m.senderType === 'CUSTOMER') {
          return {
            role: 'user' as const,
            content: `<customer_message>\n${m.content}\n</customer_message>`,
          };
        } else {
          return {
            role: 'assistant' as const,
            content: m.content,
          };
        }
      });

      // 6. Record logical AI Request (The Customer Turn)
      const idempotencyKey = `ai_req_${conversationId}_${Date.now()}`;
      const aiRequest = await tx.aiRequest.create({
        data: {
          organizationId,
          conversationId,
          idempotencyKey,
          status: 'PENDING',
        },
      });

      // 7. Invoke Provider
      let provider: IAiProvider;
      if (options?.mockReply) {
        provider = new MockAiProvider(aiConfig.model, options.mockReply);
      } else {
        provider = this.getProviderInstance(aiConfig.provider, aiConfig.model);
      }

      const completion = await provider.generateResponse({
        messages: promptMessages,
        systemInstructions: dynamicInstructions,
        policyRules,
        model: aiConfig.model,
        temperature: Number(aiConfig.temperature),
      });

      // 7.1 Deterministic Citation & Fact Verification (Section 9.1)
      let citations: string[] = [];
      if (chunkMap.size > 0) {
        const validation = CitationValidator.validate(completion.content, chunkMap);
        if (!validation.isValid) {
          return {
            bypassed: true,
            reason: validation.violationReason,
            message: `AI suggestion rejected due to grounding failure: ${validation.errorDetails}`,
            escalatedToHuman: true,
            requestId: aiRequest.id,
          };
        }
        citations = validation.citedChunkIds;
      }

      // 8. Mathematical Cost Accounting
      const promptRate = Number(pricing.promptTokenRatePerM);
      const completionRate = Number(pricing.completionTokenRatePerM);
      const incurredCostUsd =
        (completion.promptTokens * promptRate) / 1_000_000 +
        (completion.completionTokens * completionRate) / 1_000_000;

      // 9. Record Physical Attempt (Platform COGS Liability)
      await tx.aiRequestAttempt.create({
        data: {
          organizationId,
          requestId: aiRequest.id,
          provider: aiConfig.provider,
          model: completion.model,
          promptTokens: completion.promptTokens,
          completionTokens: completion.completionTokens,
          incurredCostUsd,
          costReconciliationStatus: 'KNOWN',
          isTenantBillable: true,
          status: 'SUCCESS',
        },
      });

      // 10. Record Customer Billable Event (Exactly-Once per Turn)
      await tx.aiUsageEvent.create({
        data: {
          organizationId,
          requestId: aiRequest.id,
          totalTokens: completion.totalTokens,
          billableAmountUsd: incurredCostUsd,
        },
      });

      // 11. Mark AI request COMPLETED
      await tx.aiRequest.update({
        where: { uq_ai_requests_id_org: { id: aiRequest.id, organizationId } },
        data: { status: 'COMPLETED' },
      });

      return {
        bypassed: false,
        suggestion: completion.content,
        model: completion.model,
        tokens: completion.totalTokens,
        incurredCostUsd,
        requestId: aiRequest.id,
        citations,
      };
    });
  }
}
