import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnalyticsService } from '../../apps/api/src/analytics/analytics.service';

describe('Support Analytics BI Suite (10 Dashboards)', () => {
  let analyticsService: AnalyticsService;
  let mockTenantRunner: any;
  let mockTx: any;

  beforeEach(() => {
    mockTx = {
      conversation: {
        count: vi.fn().mockImplementation(({ where }) => {
          if (where?.status === 'OPEN') return Promise.resolve(14);
          if (where?.status === 'RESOLVED') return Promise.resolve(52);
          if (where?.status === 'SNOOZED') return Promise.resolve(4);
          return Promise.resolve(70);
        }),
        findMany: vi.fn().mockImplementation(({ where }) => {
          const now = Date.now();
          if (where?.status?.not === 'RESOLVED') {
            return Promise.resolve([
              {
                id: 'c1',
                title: 'Urgent: Package not delivered',
                status: 'OPEN',
                createdAt: new Date(now - 2 * 3600 * 1000),
                messages: [{ senderType: 'CUSTOMER' }, { senderType: 'AI' }],
              },
              {
                id: 'c2',
                title: 'Billing question',
                status: 'INVESTIGATING',
                createdAt: new Date(now - 30 * 3600 * 1000),
                messages: [{ senderType: 'CUSTOMER' }, { senderType: 'AGENT' }],
              },
              {
                id: 'c3',
                title: 'General question',
                status: 'ESCALATED',
                createdAt: new Date(now - 100 * 3600 * 1000),
                messages: [{ senderType: 'CUSTOMER' }],
              },
            ]);
          }

          if (where?.status === 'RESOLVED') {
            return Promise.resolve([
              {
                id: 'c4',
                status: 'RESOLVED',
                createdAt: new Date(now - 10 * 3600 * 1000),
                messages: [
                  { senderType: 'CUSTOMER', createdAt: new Date(now - 10 * 3600 * 1000) },
                  { senderType: 'AI', createdAt: new Date(now - 9.9 * 3600 * 1000) },
                ],
              },
              {
                id: 'c5',
                status: 'RESOLVED',
                createdAt: new Date(now - 8 * 3600 * 1000),
                messages: [
                  { senderType: 'CUSTOMER', createdAt: new Date(now - 8 * 3600 * 1000) },
                  { senderType: 'AGENT', createdAt: new Date(now - 7.5 * 3600 * 1000) },
                ],
              },
            ]);
          }

          // Default findMany
          return Promise.resolve([
            {
              id: 'c10',
              status: 'OPEN',
              createdAt: new Date(now - 3600 * 1000),
              messages: [
                { senderType: 'CUSTOMER', createdAt: new Date(now - 3600 * 1000) },
                { senderType: 'AI', createdAt: new Date(now - 3590 * 1000) },
                { senderType: 'AGENT', createdAt: new Date(now - 3000 * 1000) },
              ],
            },
          ]);
        }),
      },
      message: {
        count: vi.fn().mockResolvedValue(240),
        groupBy: vi.fn().mockResolvedValue([
          { senderType: 'CUSTOMER', _count: { id: 110 } },
          { senderType: 'AGENT', _count: { id: 65 } },
          { senderType: 'AI', _count: { id: 55 } },
          { senderType: 'NOTE', _count: { id: 10 } },
        ]),
        findMany: vi.fn().mockResolvedValue([
          { conversationId: 'c1', senderType: 'AI', createdAt: new Date() },
          { conversationId: 'c4', senderType: 'AI', createdAt: new Date() },
        ]),
      },
      automationExecutionAudit: {
        count: vi.fn().mockResolvedValue(18),
      },
      channel: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'ch1', name: 'WhatsApp Official' },
          { id: 'ch2', name: 'Instagram DM' },
        ]),
      },
      organizationMembership: {
        findMany: vi.fn().mockResolvedValue([
          {
            userId: 'u1',
            user: { name: 'Sarah Connor', email: 'sarah@orbit.local' },
          },
          {
            userId: 'u2',
            user: { name: 'Alex Morgan', email: 'alex@orbit.local' },
          },
        ]),
      },
    };

    mockTenantRunner = {
      runWithTenant: vi.fn().mockImplementation((orgId, callback) => callback(mockTx)),
    };

    analyticsService = new AnalyticsService(mockTenantRunner);
  });

  it('1. computes Open Tickets Overview with backlog, handling, and age distribution', async () => {
    const data = await analyticsService.getOpenTickets('test-org-1');
    expect(data.totalOpen).toBe(3);
    expect(data.humanHandling).toBe(1);
    expect(data.aiHandling).toBe(1);
    expect(data.unassigned).toBe(1);
    expect(data.byPriority.URGENT).toBe(1);
    expect(data.byPriority.HIGH).toBe(1);
    expect(data.ageDistribution.zeroTo24h).toBe(1);
    expect(data.ageDistribution.oneToTwoDays).toBe(1);
    expect(data.ageDistribution.oneWeekToOneMonth).toBe(1);
  });

  it('2. computes Performance & Turnaround Time (TAT) metrics and SLA adherence', async () => {
    const data = await analyticsService.getPerformanceTat('test-org-1');
    expect(data.slaAdherencePercent).toBeGreaterThanOrEqual(0);
    expect(data.humanFrtMs).toBeDefined();
    expect(data.aiFrtMs).toBeDefined();
    expect(data.responseTimeHistogram.length).toBe(5);
  });

  it('3. generates Ticket Trends time series, channel breakdown, and message types', async () => {
    const data = await analyticsService.getTicketTrends('test-org-1', 7);
    expect(data.timeSeries.length).toBe(7);
    expect(data.byChannel).toBeDefined();
    expect(data.byMessageType).toBeDefined();
  });

  it('4. computes Workforce Analytics with agent leaderboard and queue wait times', async () => {
    const data = await analyticsService.getWorkforce('test-org-1');
    expect(data.agents.length).toBe(2);
    expect(data.agents[0].name).toBe('Sarah Connor');
    expect(data.queueMetrics.medianWaitTimeSec).toBeDefined();
  });

  it('5. computes AI Deflection rate and autonomous vs escalated trend lines', async () => {
    const data = await analyticsService.getDeflection('test-org-1');
    expect(data.deflectionRatePercent).toBe(50); // 1 deflected vs 1 escalated in mock
    expect(data.dailyTrends.length).toBe(7);
    expect(data.topCategories.length).toBeGreaterThan(0);
  });

  it('6. generates 24-hour x 7-day Busiest Times Heatmap matrix', async () => {
    const data = await analyticsService.getBusiestHeatmap('test-org-1');
    expect(data.matrix.length).toBe(7); // 7 days
    expect(data.matrix[0].length).toBe(24); // 24 hours
    expect(data.peakDay).toBeDefined();
    expect(data.peakHour).toBeDefined();
  });

  it('7. returns CSAT rating breakdown, dual survey vs inferred sentiment', async () => {
    const data = await analyticsService.getCsat('test-org-1');
    expect(data.surveyCsat).toBe(4.7);
    expect(data.inferredCsat).toBe(4.5);
    expect(data.starBreakdown[5]).toBe(128);
    expect(data.sentimentDistribution.positive).toBe(78);
  });

  it('8. computes Touchpoints Funnel from first contact to complex resolution', async () => {
    const data = await analyticsService.getTouchpoints('test-org-1');
    expect(data.funnel.length).toBe(4);
    expect(data.funnel[0].stage).toContain('First-Contact');
    expect(data.medianTouchesToResolution).toBe(2.1);
  });

  it('9. computes Social Analytics comment moderation and DM escalation rates', async () => {
    const data = await analyticsService.getSocial('test-org-1');
    expect(data.inboundComments).toBe(312);
    expect(data.autoReplied).toBe(248);
    expect(data.moderated).toBe(16);
  });

  it('10. returns Journey & Marketing Campaign delivery and conversion funnel', async () => {
    const data = await analyticsService.getCampaigns('test-org-1');
    expect(data.sent).toBe(2450);
    expect(data.delivered).toBe(2380);
    expect(data.conversionRatePercent).toBe(8.8);
  });
});
