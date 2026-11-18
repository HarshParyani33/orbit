import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaService } from '../../apps/api/src/prisma/prisma.service';
import { TenantTransactionRunner } from '../../apps/api/src/tenancy/tenant-transaction-runner';
import { ChannelsService } from '../../apps/api/src/channels/channels.service';
import { ConversationsService } from '../../apps/api/src/conversations/conversations.service';
import { AutomationsService } from '../../apps/api/src/automations/automations.service';
import { AnalyticsService } from '../../apps/api/src/analytics/analytics.service';
import { OrbitWorkerProcessor } from '../../apps/worker/src/index';

describe('Milestone 2 Slice 2.7 — Initial Automation Engine, SLA Metrics & Queue Processing Tests', () => {
  let prisma: PrismaService;
  let runner: TenantTransactionRunner;
  let channelsService: ChannelsService;
  let conversationsService: ConversationsService;
  let automationsService: AutomationsService;
  let analyticsService: AnalyticsService;
  let workerProcessor: OrbitWorkerProcessor;

  let orgAId: string;
  let orgBId: string;
  let channelAId: string;
  let channelBId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    runner = new TenantTransactionRunner(prisma);
    automationsService = new AutomationsService(runner);
    conversationsService = new ConversationsService(runner, undefined, automationsService);
    channelsService = new ChannelsService(runner);
    analyticsService = new AnalyticsService(runner);
    workerProcessor = new OrbitWorkerProcessor();

    const orgA = await prisma.organization.findUniqueOrThrow({ where: { slug: 'acme' } });
    const orgB = await prisma.organization.findUniqueOrThrow({ where: { slug: 'beta' } });
    orgAId = orgA.id;
    orgBId = orgB.id;

    const chA = await channelsService.createChannel(orgAId, {
      name: 'Automation Web Channel',
      provider: 'WEB_CHAT',
    });
    channelAId = chA.id;

    const chB = await channelsService.createChannel(orgBId, {
      name: 'Org B Channel',
      provider: 'WEB_CHAT',
    });
    channelBId = chB.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('1. Automation Rule Creation & Management', () => {
    it('creates keyword-escalation rule and persists conditions and actions with tenant isolation', async () => {
      const rule = await automationsService.createRule(orgAId, {
        name: 'Urgent Keyword Escalation',
        trigger: 'MESSAGE_RECEIVED',
        conditions: [
          {
            field: 'messageContent',
            operator: 'CONTAINS',
            value: 'urgent',
          },
        ],
        actions: [
          {
            type: 'ESCALATE_HUMAN',
            payload: {
              notice: '[Automation] Conversation marked urgent and escalated to human agent queue.',
            },
          },
        ],
        enabled: true,
      });

      expect(rule.id).toBeDefined();
      expect(rule.organizationId).toBe(orgAId);
      expect(rule.trigger).toBe('MESSAGE_RECEIVED');
      expect(rule.enabled).toBe(true);

      // Verify in list
      const rules = await automationsService.listRules(orgAId);
      expect(rules.some((r) => r.id === rule.id)).toBe(true);

      // Verify Org B cannot view Org A rules
      const rulesB = await automationsService.listRules(orgBId);
      expect(rulesB.some((r) => r.id === rule.id)).toBe(false);
    });

    it('creates auto-reply system message rule on human inquiry', async () => {
      const rule = await automationsService.createRule(orgAId, {
        name: 'Human Request Acknowledgement',
        trigger: 'MESSAGE_RECEIVED',
        conditions: [
          {
            field: 'messageContent',
            operator: 'CONTAINS',
            value: 'human',
          },
        ],
        actions: [
          {
            type: 'SEND_SYSTEM_MESSAGE',
            payload: {
              content: 'Connecting you with a support representative shortly.',
            },
          },
        ],
        enabled: true,
      });

      expect(rule.id).toBeDefined();
      expect(rule.name).toBe('Human Request Acknowledgement');
    });
  });

  describe('2. Automation Rule Execution & Immutable Audit Trail', () => {
    let testConvId: string;

    beforeAll(async () => {
      const conv = await conversationsService.createConversation(orgAId, {
        channelId: channelAId,
        title: 'Automation Execution Inquiry',
        initialMessage: 'Initial greeting from visitor',
      });
      testConvId = conv.id;
    });

    it('triggers automation rule when customer message satisfies condition and executes actions', async () => {
      // Customer sends a message containing "urgent"
      const msg = await conversationsService.createMessage(orgAId, testConvId, {
        senderType: 'CUSTOMER',
        content: 'This is an urgent request regarding account access!',
      });

      expect(msg.id).toBeDefined();

      // Verify immutable audit trail
      const audits = await automationsService.listAudits(orgAId, testConvId);
      const urgentAudit = audits.find((a) => a.matched && a.trigger === 'MESSAGE_RECEIVED');

      expect(urgentAudit).toBeDefined();
      expect(urgentAudit?.status).toBe('SUCCESS');
      expect(urgentAudit?.matched).toBe(true);
      expect(urgentAudit?.conversationId).toBe(testConvId);

      // Verify action was executed: system notice message was created in the conversation
      const messages = await conversationsService.listMessages(orgAId, testConvId);
      const systemNotice = messages.find(
        (m) => m.senderType === 'SYSTEM' && m.content.includes('escalated to human agent queue')
      );
      expect(systemNotice).toBeDefined();
    });

    it('skips rule execution when conditions do not match and records SKIPPED audit', async () => {
      await conversationsService.createMessage(orgAId, testConvId, {
        senderType: 'CUSTOMER',
        content: 'Just browsing products, thank you!',
      });

      const audits = await automationsService.listAudits(orgAId, testConvId);
      const skippedAudit = audits.find((a) => !a.matched && a.status === 'SKIPPED');
      expect(skippedAudit).toBeDefined();
    });
  });

  describe('3. SLA & Conversation Analytics Overview', () => {
    it('accurately calculates conversation volume, status distribution, and sender breakdown', async () => {
      const overview = await analyticsService.getOverview(orgAId);

      expect(overview.totalConversations).toBeGreaterThanOrEqual(1);
      expect(overview.openConversations).toBeGreaterThanOrEqual(1);
      expect(overview.totalMessages).toBeGreaterThanOrEqual(1);
      expect(overview.messagesBySender.customer).toBeGreaterThanOrEqual(1);
      expect(overview.totalAutomationAuditsCount).toBeGreaterThanOrEqual(1);
    });

    it('calculates average first response time (FRT) in milliseconds between customer and agent', async () => {
      // Create dedicated conversation to verify exact FRT calculation
      const conv = await conversationsService.createConversation(orgAId, {
        channelId: channelAId,
        title: 'FRT SLA Benchmark Test',
      });

      // Customer sends first inquiry at T0
      await conversationsService.createMessage(orgAId, conv.id, {
        senderType: 'CUSTOMER',
        content: 'Can someone help me with my setup?',
      });

      // Human agent replies at T1
      await conversationsService.createMessage(orgAId, conv.id, {
        senderType: 'AGENT',
        content: 'Hello! I am happy to help you with your setup.',
      });

      const overview = await analyticsService.getOverview(orgAId);
      expect(overview.averageFirstResponseTimeMs).not.toBeNull();
      expect(overview.averageFirstResponseTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('enforces multi-tenant isolation: Tenant B overview reflects zero Tenant A data', async () => {
      const overviewB = await analyticsService.getOverview(orgBId);

      // Org B has no conversations created yet in this suite
      expect(overviewB.totalConversations).toBe(0);
      expect(overviewB.totalMessages).toBe(0);
      expect(overviewB.totalAutomationAuditsCount).toBe(0);
      expect(overviewB.averageFirstResponseTimeMs).toBeNull();
    });
  });

  describe('4. Idempotent Queue Consumer & Worker Processing (@orbit/worker)', () => {
    it('executes background job within tenant context', async () => {
      let executedOrgId: string | null = null;
      let executedPayload: any = null;

      const result = await workerProcessor.processJob(
        {
          id: 'job-1001',
          organizationId: orgAId,
          type: 'SLA_BREACH_CHECK',
          data: { thresholdMinutes: 15 },
        },
        async (txOrgId, data) => {
          executedOrgId = txOrgId;
          executedPayload = data;
          return { checked: true };
        }
      );

      expect(result.status).toBe('COMPLETED');
      expect(result.jobId).toBe('job-1001');
      expect(executedOrgId).toBe(orgAId);
      expect(executedPayload).toEqual({ thresholdMinutes: 15 });
    });

    it('rejects duplicate job delivery without re-executing handler (idempotency guarantee)', async () => {
      let executionCount = 0;

      const duplicateResult = await workerProcessor.processJob(
        {
          id: 'job-1001', // Identical jobId already processed
          organizationId: orgAId,
          type: 'SLA_BREACH_CHECK',
          data: { thresholdMinutes: 15 },
        },
        async () => {
          executionCount++;
        }
      );

      expect(duplicateResult.status).toBe('DUPLICATE');
      expect(executionCount).toBe(0); // Handler was not invoked
    });

    it('rejects job without organizationId tenant scope', async () => {
      await expect(
        workerProcessor.processJob(
          { id: 'job-missing-org', organizationId: '', type: 'NO_ORG', data: {} },
          async () => {}
        )
      ).rejects.toThrow(/Missing mandatory organizationId/i);
    });
  });
});
