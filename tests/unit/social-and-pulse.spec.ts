import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SocialService } from '../../apps/api/src/social/social.service';
import { PulseService } from '../../apps/api/src/pulse/pulse.service';

describe('Milestone 5: Social Engagement & Pulse AI BI', () => {
  let socialService: SocialService;
  let pulseService: PulseService;
  let mockTenantRunner: any;
  let mockTx: any;

  beforeEach(() => {
    mockTx = {
      customer: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'cust_ig_99', ...data })),
      },
      customerChannelIdentity: {
        create: vi.fn().mockResolvedValue({ id: 'ident_ig_1' }),
      },
      channel: {
        findFirst: vi.fn().mockResolvedValue({ id: 'chan_ig_1', name: 'Instagram DM', provider: 'META_INSTAGRAM' }),
      },
      conversation: {
        create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'conv_dm_101', ...data })),
        findMany: vi.fn().mockResolvedValue([
          { createdAt: new Date(Date.now() - 2 * 3600 * 1000) },
          { createdAt: new Date(Date.now() - 36 * 3600 * 1000) },
        ]),
      },
      message: {
        create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'msg_1', ...data })),
      },
    };

    mockTenantRunner = {
      runWithTenant: vi.fn().mockImplementation((orgId, callback) => callback(mockTx)),
    };

    socialService = new SocialService(mockTenantRunner);
    pulseService = new PulseService(mockTenantRunner);
  });

  describe('Social Media Engagement & Moderation', () => {
    it('1. retrieves seeded Instagram feed and ad comments with filter support', async () => {
      const allComments = await socialService.getComments('org-1');
      expect(allComments.length).toBeGreaterThanOrEqual(4);

      const pendingComments = await socialService.getComments('org-1', { status: 'PENDING' });
      expect(pendingComments.every((c) => c.status === 'PENDING')).toBe(true);

      const toxicComments = await socialService.getComments('org-1', { sentiment: 'TOXIC' });
      expect(toxicComments.length).toBeGreaterThanOrEqual(1);
      expect(toxicComments[0].status).toBe('HIDDEN');
    });

    it('2. posts public reply and updates status to REPLIED', async () => {
      const updated = await socialService.postPublicReply(
        'org-1',
        'soc_cmt_101',
        'We recommend true to size for daily training!',
        'HUMAN'
      );

      expect(updated.status).toBe('REPLIED');
      expect(updated.publicReply).toBeDefined();
      expect(updated.publicReply?.content).toContain('true to size');
      expect(updated.publicReply?.repliedBy).toBe('HUMAN');
    });

    it('3. converts public comment into a private DM conversation in master inbox', async () => {
      const result = await socialService.initiateDm(
        'org-1',
        'soc_cmt_102',
        'Hi Charlotte! We found your order and are checking tracking right now.'
      );

      expect(result.conversationId).toBe('conv_dm_101');
      expect(result.comment.status).toBe('ESCALATED_TO_DM');
      expect(result.comment.dmConversationId).toBe('conv_dm_101');

      // Verified customer profile creation
      expect(mockTx.customer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: '@charlotte_b' }),
        })
      );

      // Verified conversation creation in tenant inbox
      expect(mockTx.conversation.create).toHaveBeenCalled();
      expect(mockTx.message.create).toHaveBeenCalledTimes(2); // Inbound comment context + outgoing DM message
    });

    it('4. executes moderation actions: HIDE, UNHIDE, and DELETE', async () => {
      const hidden = await socialService.moderateComment('org-1', 'soc_cmt_101', 'HIDE');
      expect(hidden.status).toBe('HIDDEN');

      const unhidden = await socialService.moderateComment('org-1', 'soc_cmt_101', 'UNHIDE');
      expect(unhidden.status).toBe('PENDING');

      const deleted = await socialService.moderateComment('org-1', 'soc_cmt_101', 'DELETE');
      expect(deleted.status).toBe('DELETED');
    });
  });

  describe('Pulse AI Conversational Support BI (AC-B5)', () => {
    it('5. answers natural language question for ticket age breakdown with interactive bar chart (AC-B5)', async () => {
      const response = await pulseService.querySupportData(
        'org-1',
        'Break down open tickets by how long they have been open'
      );

      expect(response.answer).toBeDefined();
      expect(response.chart).toBeDefined();
      expect(response.chart?.type).toBe('BAR');
      expect(response.chart?.labels).toEqual(['0-24h', '1-2d', '1w-1m', 'Over 1m']);
      expect(response.chart?.series[0].data.length).toBe(4);
      expect(response.executionTimeMs).toBeLessThan(3500); // Meets < 3.5s requirement
      expect(response.suggestedNextQuestions?.length).toBeGreaterThan(0);
    });

    it('6. answers channel volume inquiry with donut chart', async () => {
      const response = await pulseService.querySupportData(
        'org-1',
        'Which channels drove the most tickets this week?'
      );

      expect(response.chart?.type).toBe('DONUT');
      expect(response.chart?.labels).toContain('WhatsApp Official');
      expect(response.answer).toContain('WhatsApp Official');
    });

    it('7. analyzes uploaded CSV and generates aggregate chart and data table in under 5 seconds', async () => {
      const sampleCsv = `Product,Returns,Category
Aero Runner Pro,45,Footwear
Trail Waterproof Shell,18,Apparel
Tactical Backpack 25L,12,Accessories
Merino Crew Socks,8,Apparel`;

      const response = await pulseService.analyzeUploadedCsv(
        'org-1',
        sampleCsv,
        'november_returns.csv',
        'Show returns by category'
      );

      expect(response.answer).toContain('november_returns.csv');
      expect(response.chart?.type).toBe('BAR');
      expect(response.chart?.rawTable?.length).toBe(4);
      expect(response.executionTimeMs).toBeLessThan(5000);
    });
  });
});
