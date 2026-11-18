import { Injectable, Inject, Logger } from '@nestjs/common';
import { TenantTransactionRunner } from '../tenancy/tenant-transaction-runner';
import { CreateAutomationRuleInput } from '@orbit/validation';
import { Prisma } from '@prisma/client';

export interface AutomationContext {
  conversationId: string;
  messageContent?: string;
  channelProvider?: string;
  status?: string;
}

@Injectable()
export class AutomationsService {
  private readonly logger = new Logger(AutomationsService.name);

  constructor(
    @Inject(TenantTransactionRunner)
    private readonly tenantRunner: TenantTransactionRunner
  ) {}

  async createRule(organizationId: string, input: CreateAutomationRuleInput) {
    return this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      return tx.automationRule.create({
        data: {
          organizationId,
          name: input.name,
          trigger: input.trigger,
          conditions: input.conditions as Prisma.InputJsonValue,
          actions: input.actions as Prisma.InputJsonValue,
          enabled: input.enabled,
        },
      });
    });
  }

  async listRules(organizationId: string) {
    return this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      return tx.automationRule.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
      });
    });
  }

  async listAudits(organizationId: string, conversationId?: string) {
    return this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      return tx.automationExecutionAudit.findMany({
        where: {
          organizationId,
          ...(conversationId ? { conversationId } : {}),
        },
        orderBy: { createdAt: 'desc' },
      });
    });
  }

  /**
   * Safely evaluates active tenant rules against context.
   * Executes matched actions and records an immutable audit log.
   */
  async evaluateRules(
    organizationId: string,
    trigger: 'CONVERSATION_CREATED' | 'MESSAGE_RECEIVED' | 'CONVERSATION_RESOLVED',
    context: AutomationContext
  ) {
    return this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      const activeRules = await tx.automationRule.findMany({
        where: {
          organizationId,
          trigger,
          enabled: true,
        },
        orderBy: { createdAt: 'asc' },
      });

      const results = [];

      for (const rule of activeRules) {
        const conditions = Array.isArray(rule.conditions) ? (rule.conditions as any[]) : [];
        let matched = true;

        for (const cond of conditions) {
          const actualValue = (context as any)[cond.field];
          const expectedValue = cond.value;

          if (cond.operator === 'EQUALS') {
            if (actualValue !== expectedValue) matched = false;
          } else if (cond.operator === 'CONTAINS') {
            const actualStr = String(actualValue || '').toLowerCase();
            const expStr = String(expectedValue || '').toLowerCase();
            if (!actualStr.includes(expStr)) matched = false;
          } else if (cond.operator === 'STARTS_WITH') {
            const actualStr = String(actualValue || '').toLowerCase();
            const expStr = String(expectedValue || '').toLowerCase();
            if (!actualStr.startsWith(expStr)) matched = false;
          } else if (cond.operator === 'IN') {
            if (!Array.isArray(expectedValue) || !expectedValue.includes(actualValue)) {
              matched = false;
            }
          }
          if (!matched) break;
        }

        const actionsExecuted = [];
        let auditStatus = matched ? 'SUCCESS' : 'SKIPPED';
        let errorMsg: string | null = null;

        if (matched) {
          const actions = Array.isArray(rule.actions) ? (rule.actions as any[]) : [];
          for (const action of actions) {
            try {
              if (action.type === 'UPDATE_STATUS' && action.payload?.status) {
                await tx.conversation.update({
                  where: {
                    uq_conversations_id_org: {
                      id: context.conversationId,
                      organizationId,
                    },
                  },
                  data: {
                    status: action.payload.status,
                    updatedAt: new Date(),
                  },
                });
                actionsExecuted.push(action);
              } else if (action.type === 'SEND_SYSTEM_MESSAGE' && action.payload?.content) {
                await tx.message.create({
                  data: {
                    organizationId,
                    conversationId: context.conversationId,
                    senderType: 'SYSTEM',
                    content: action.payload.content,
                  },
                });
                actionsExecuted.push(action);
              } else if (action.type === 'ESCALATE_HUMAN') {
                await tx.conversation.update({
                  where: {
                    uq_conversations_id_org: {
                      id: context.conversationId,
                      organizationId,
                    },
                  },
                  data: {
                    status: 'OPEN',
                    updatedAt: new Date(),
                  },
                });
                if (action.payload?.notice) {
                  await tx.message.create({
                    data: {
                      organizationId,
                      conversationId: context.conversationId,
                      senderType: 'SYSTEM',
                      content: action.payload.notice,
                    },
                  });
                }
                actionsExecuted.push(action);
              }
            } catch (err: any) {
              auditStatus = 'FAILED';
              errorMsg = err.message;
              this.logger.error(`Error executing rule ${rule.id} action: ${err.message}`);
            }
          }
        }

        // Record immutable audit entry
        const audit = await tx.automationExecutionAudit.create({
          data: {
            organizationId,
            ruleId: rule.id,
            conversationId: context.conversationId,
            trigger,
            matched,
            actionsExecuted: actionsExecuted as Prisma.InputJsonValue,
            status: auditStatus,
            errorMessage: errorMsg,
          },
        });

        results.push(audit);
      }

      return results;
    });
  }
}
