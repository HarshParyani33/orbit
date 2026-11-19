import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CampaignsService } from '../../apps/api/src/campaigns/campaigns.service';

describe('Marketing Campaigns & Lifecycle Journeys (M6)', () => {
  let campaignsService: CampaignsService;
  let mockTenantRunner: any;
  let mockTx: any;

  beforeEach(() => {
    mockTx = {
      customer: {
        count: vi.fn().mockResolvedValue(320),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'cust_cart_1', ...data })),
      },
    };

    mockTenantRunner = {
      runWithTenant: vi.fn().mockImplementation((orgId, callback) => callback(mockTx)),
    };

    campaignsService = new CampaignsService(mockTenantRunner);
  });

  it('1. lists active marketing campaigns with attributed revenue and conversion statistics', async () => {
    const list = await campaignsService.getCampaigns('org-1');
    expect(list.length).toBeGreaterThanOrEqual(2);

    const vipCampaign = list.find((c) => c.name.includes('VIP'));
    expect(vipCampaign?.status).toBe('COMPLETED');
    expect(vipCampaign?.attributedRevenue).toBe(8490.0);
    expect(vipCampaign?.readCount).toBe(398);
  });

  it('2. creates marketing campaign with dynamic audience segmentation estimate', async () => {
    const campaign = await campaignsService.createCampaign('org-1', {
      name: 'Spring Flash Sale 2027',
      channel: 'META_WHATSAPP',
      audienceSegment: 'VIP_SPENDERS',
      messageTemplate: 'Hi {{customer_name}}, enjoy 20% off all trail gear this weekend only!',
    });

    expect(campaign.id).toBeDefined();
    expect(campaign.status).toBe('DRAFT');
    expect(campaign.recipientCount).toBeGreaterThan(0);
    expect(campaign.channel).toBe('META_WHATSAPP');
  });

  it('3. launches campaign and updates delivery, read, and conversion metrics', async () => {
    const campaign = await campaignsService.createCampaign('org-1', {
      name: 'Winter Clearance',
      channel: 'META_WHATSAPP',
      audienceSegment: 'ALL_CUSTOMERS',
      messageTemplate: 'Last chance for 40% off winter coats!',
    });

    const launched = await campaignsService.launchCampaign('org-1', campaign.id);
    expect(launched.status).toBe('RUNNING');
    expect(launched.sentCount).toBe(campaign.recipientCount);
    expect(launched.deliveredCount).toBeGreaterThan(0);
    expect(launched.readCount).toBeGreaterThan(0);
    expect(launched.convertedCount).toBeGreaterThan(0);
    expect(launched.attributedRevenue).toBeGreaterThan(0);
  });

  it('4. ingests abandoned cart webhook and dispatches automated personalized recovery WhatsApp', async () => {
    const webhookResult = await campaignsService.handleAbandonedCartWebhook('org-1', {
      customerEmail: 'alex.shopper@example.com',
      customerPhone: '+15550192834',
      customerName: 'Alex Shopper',
      cartTotal: 189.50,
      checkoutUrl: 'https://lumina.example/checkouts/cn_998124018',
      abandonedAt: new Date().toISOString(),
    });

    expect(webhookResult.success).toBe(true);
    expect(webhookResult.dispatched).toBe(true);
    expect(webhookResult.message).toContain('Personalized recovery WhatsApp sent');
    expect(webhookResult.message).toContain('https://lumina.example/checkouts/cn_998124018');

    // Customer profile was created/tagged with abandoned cart metadata
    expect(mockTx.customer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'alex.shopper@example.com',
          metadata: expect.objectContaining({
            lastAbandonedCart: expect.objectContaining({ total: 189.50 }),
          }),
        }),
      })
    );
  });
});
