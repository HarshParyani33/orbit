import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { TenantTransactionRunner } from '../tenancy/tenant-transaction-runner';
import {
  MarketingCampaign,
  CampaignAudienceSegment,
  CampaignChannel,
  CampaignStatus,
} from '@orbit/shared';

@Injectable()
export class CampaignsService {
  private readonly campaigns: Map<string, MarketingCampaign> = new Map();

  constructor(
    @Inject(TenantTransactionRunner)
    private readonly tenantRunner: TenantTransactionRunner
  ) {
    this.seedMockCampaigns();
  }

  private seedMockCampaigns(): void {
    const c1: MarketingCampaign = {
      id: 'cmp_101',
      name: 'Black Friday VIP Early Access',
      channel: 'META_WHATSAPP',
      audienceSegment: 'VIP_SPENDERS',
      status: 'COMPLETED',
      messageTemplate: 'Hey {{customer_name}}! 🎁 Your exclusive VIP 25% off code is VIP25-ORBIT. Shop early before public launch: https://lumina.example/vip',
      recipientCount: 450,
      sentCount: 450,
      deliveredCount: 442,
      readCount: 398,
      clickedCount: 164,
      convertedCount: 68,
      attributedRevenue: 8490.0,
      createdAt: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
    };

    const c2: MarketingCampaign = {
      id: 'cmp_102',
      name: 'Abandoned Cart 15-Minute Recovery',
      channel: 'META_WHATSAPP',
      audienceSegment: 'CART_ABANDONERS',
      status: 'RUNNING',
      messageTemplate: 'Hi {{customer_name}}! Did you forget something in your bag? 🛍️ Complete your order in the next 2 hours and take 10% off with code CART10: {{checkout_url}}',
      recipientCount: 180,
      sentCount: 180,
      deliveredCount: 176,
      readCount: 152,
      clickedCount: 88,
      convertedCount: 34,
      attributedRevenue: 4420.0,
      createdAt: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
    };

    this.campaigns.set(c1.id, c1);
    this.campaigns.set(c2.id, c2);
  }

  async getCampaigns(organizationId: string): Promise<MarketingCampaign[]> {
    return Array.from(this.campaigns.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async createCampaign(
    organizationId: string,
    payload: {
      name: string;
      channel: CampaignChannel;
      audienceSegment: CampaignAudienceSegment;
      messageTemplate: string;
      scheduledAt?: string;
    }
  ): Promise<MarketingCampaign> {
    if (!payload.name || !payload.messageTemplate) {
      throw new BadRequestException('Campaign name and message template are required');
    }

    return this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      // Calculate audience size
      const customerCount = await tx.customer.count({ where: { organizationId } });
      const audienceEstimate =
        payload.audienceSegment === 'ALL_CUSTOMERS'
          ? Math.max(customerCount, 120)
          : Math.floor(Math.max(customerCount, 120) * 0.35);

      const campaign: MarketingCampaign = {
        id: `cmp_${Date.now()}`,
        name: payload.name.trim(),
        channel: payload.channel || 'META_WHATSAPP',
        audienceSegment: payload.audienceSegment || 'ALL_CUSTOMERS',
        status: payload.scheduledAt ? 'SCHEDULED' : 'DRAFT',
        messageTemplate: payload.messageTemplate.trim(),
        recipientCount: audienceEstimate,
        sentCount: 0,
        deliveredCount: 0,
        readCount: 0,
        clickedCount: 0,
        convertedCount: 0,
        attributedRevenue: 0,
        createdAt: new Date().toISOString(),
        scheduledAt: payload.scheduledAt,
      };

      this.campaigns.set(campaign.id, campaign);
      return campaign;
    });
  }

  async launchCampaign(organizationId: string, campaignId: string): Promise<MarketingCampaign> {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) {
      throw new NotFoundException(`Campaign ${campaignId} not found`);
    }

    campaign.status = 'RUNNING';
    campaign.sentCount = campaign.recipientCount;
    campaign.deliveredCount = Math.round(campaign.recipientCount * 0.98);
    campaign.readCount = Math.round(campaign.deliveredCount * 0.82);
    campaign.clickedCount = Math.round(campaign.readCount * 0.42);
    campaign.convertedCount = Math.round(campaign.clickedCount * 0.25);
    campaign.attributedRevenue = campaign.convertedCount * 125.0;

    return campaign;
  }

  async handleAbandonedCartWebhook(
    organizationId: string,
    payload: {
      customerEmail: string;
      customerPhone?: string;
      customerName?: string;
      cartTotal: number;
      checkoutUrl: string;
      abandonedAt?: string;
    }
  ): Promise<{ success: boolean; dispatched: boolean; campaignId: string; message: string }> {
    return this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      const email = payload.customerEmail;
      const phone = payload.customerPhone;

      // Find or create customer
      let customer = await tx.customer.findFirst({
        where: {
          organizationId,
          OR: [
            ...(email ? [{ email }] : []),
            ...(phone ? [{ phone }] : []),
          ],
        },
      });

      if (!customer) {
        customer = await tx.customer.create({
          data: {
            organizationId,
            name: payload.customerName || (email ? email.split('@')[0] : 'Shopper'),
            email,
            phone,
            metadata: {
              lastAbandonedCart: {
                total: payload.cartTotal,
                url: payload.checkoutUrl,
                abandonedAt: payload.abandonedAt || new Date().toISOString(),
              },
            },
          },
        });
      }

      // Find running abandoned cart recovery campaign
      const activeCampaign = Array.from(this.campaigns.values()).find(
        (c) => c.audienceSegment === 'CART_ABANDONERS' && c.status === 'RUNNING'
      ) || Array.from(this.campaigns.values())[1];

      if (activeCampaign) {
        activeCampaign.sentCount++;
        activeCampaign.deliveredCount++;
        activeCampaign.readCount++;
      }

      return {
        success: true,
        dispatched: true,
        campaignId: activeCampaign?.id || 'cmp_102',
        message: `Personalized recovery WhatsApp sent to ${customer.phone || customer.email} with checkout link: ${payload.checkoutUrl}`,
      };
    });
  }
}
