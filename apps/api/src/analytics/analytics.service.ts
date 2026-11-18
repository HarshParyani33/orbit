import { Injectable, Inject } from '@nestjs/common';
import { TenantTransactionRunner } from '../tenancy/tenant-transaction-runner';
import { AnalyticsOverviewResponse } from '@orbit/shared';

@Injectable()
export class AnalyticsService {
  constructor(
    @Inject(TenantTransactionRunner)
    private readonly tenantRunner: TenantTransactionRunner
  ) {}

  async getOverview(organizationId: string): Promise<AnalyticsOverviewResponse> {
    return this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      // 1. Conversation Counts by Status
      const [
        totalConversations,
        openConversations,
        resolvedConversations,
        snoozedConversations,
        totalMessages,
        totalAutomationAuditsCount,
      ] = await Promise.all([
        tx.conversation.count({ where: { organizationId } }),
        tx.conversation.count({ where: { organizationId, status: 'OPEN' } }),
        tx.conversation.count({ where: { organizationId, status: 'RESOLVED' } }),
        tx.conversation.count({ where: { organizationId, status: 'SNOOZED' } }),
        tx.message.count({ where: { organizationId } }),
        tx.automationExecutionAudit.count({ where: { organizationId, matched: true } }),
      ]);

      // 2. Message Breakdown by Sender Type
      const messageGroups = await tx.message.groupBy({
        by: ['senderType'],
        where: { organizationId },
        _count: { id: true },
      });

      const messagesBySender = {
        customer: 0,
        agent: 0,
        ai: 0,
        system: 0,
      };

      for (const grp of messageGroups) {
        const type = grp.senderType.toUpperCase();
        if (type === 'CUSTOMER') messagesBySender.customer = grp._count.id;
        else if (type === 'AGENT') messagesBySender.agent = grp._count.id;
        else if (type === 'AI') messagesBySender.ai = grp._count.id;
        else if (type === 'SYSTEM') messagesBySender.system = grp._count.id;
      }

      // 3. AI-Handled Conversations Count (conversations with AI sender)
      const aiConvs = await tx.message.findMany({
        where: { organizationId, senderType: 'AI' },
        select: { conversationId: true },
        distinct: ['conversationId'],
      });
      const aiHandledConversationsCount = aiConvs.length;

      // 4. SLA First Response Time (FRT) Calculation
      // Average time in ms from first CUSTOMER message to first subsequent AGENT message
      const conversationsWithMessages = await tx.conversation.findMany({
        where: { organizationId },
        select: {
          messages: {
            select: {
              senderType: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      const responseTimesMs: number[] = [];

      for (const conv of conversationsWithMessages) {
        const firstCustomerMsg = conv.messages.find((m) => m.senderType === 'CUSTOMER');
        if (!firstCustomerMsg) continue;

        const firstAgentMsg = conv.messages.find(
          (m) =>
            m.senderType === 'AGENT' &&
            m.createdAt.getTime() >= firstCustomerMsg.createdAt.getTime()
        );

        if (firstAgentMsg) {
          const diffMs = firstAgentMsg.createdAt.getTime() - firstCustomerMsg.createdAt.getTime();
          responseTimesMs.push(diffMs);
        }
      }

      const averageFirstResponseTimeMs =
        responseTimesMs.length > 0
          ? Math.round(
              responseTimesMs.reduce((acc, val) => acc + val, 0) / responseTimesMs.length
            )
          : null;

      return {
        totalConversations,
        openConversations,
        resolvedConversations,
        snoozedConversations,
        totalMessages,
        messagesBySender,
        averageFirstResponseTimeMs,
        aiHandledConversationsCount,
        totalAutomationAuditsCount,
      };
    });
  }
}
