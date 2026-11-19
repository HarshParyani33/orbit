import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Inject,
  BadRequestException,
} from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { TenantGuard } from '../tenancy/tenant.guard';
import { CurrentTenant } from '../tenancy/tenant-context.decorator';
import { TenantContext, CampaignAudienceSegment, CampaignChannel } from '@orbit/shared';

@Controller('api/campaigns')
export class CampaignsController {
  constructor(
    @Inject(CampaignsService)
    private readonly campaignsService: CampaignsService
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard, TenantGuard)
  async getCampaigns(@CurrentTenant() tenant: TenantContext) {
    const list = await this.campaignsService.getCampaigns(tenant.orgId);
    return { success: true, data: list };
  }

  @Post()
  @UseGuards(JwtAuthGuard, TenantGuard)
  async createCampaign(
    @CurrentTenant() tenant: TenantContext,
    @Body()
    body: {
      name: string;
      channel: CampaignChannel;
      audienceSegment: CampaignAudienceSegment;
      messageTemplate: string;
      scheduledAt?: string;
    }
  ) {
    const campaign = await this.campaignsService.createCampaign(tenant.orgId, body);
    return { success: true, data: campaign };
  }

  @Post(':id/launch')
  @UseGuards(JwtAuthGuard, TenantGuard)
  async launchCampaign(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') campaignId: string
  ) {
    const campaign = await this.campaignsService.launchCampaign(tenant.orgId, campaignId);
    return { success: true, data: campaign };
  }

  @Post('webhooks/abandoned-cart')
  async handleAbandonedCartWebhook(
    @Body()
    body: {
      organizationId?: string;
      customerEmail: string;
      customerPhone?: string;
      customerName?: string;
      cartTotal: number;
      checkoutUrl: string;
      abandonedAt?: string;
    }
  ) {
    const orgId = body.organizationId || '00000000-0000-0000-0000-000000000001';
    if (!body.customerEmail && !body.customerPhone) {
      throw new BadRequestException('customerEmail or customerPhone is required');
    }
    const result = await this.campaignsService.handleAbandonedCartWebhook(orgId, body);
    return result;
  }
}
