import { Controller, Get, Query, UseGuards, Inject } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { TenantGuard } from '../tenancy/tenant.guard';
import { CurrentTenant } from '../tenancy/tenant-context.decorator';
import { TenantContext } from '@orbit/shared';

@Controller('api/analytics')
@UseGuards(JwtAuthGuard, TenantGuard)
export class AnalyticsController {
  constructor(
    @Inject(AnalyticsService)
    private readonly analyticsService: AnalyticsService
  ) {}

  @Get('overview')
  async getOverview(@CurrentTenant() tenant: TenantContext) {
    const data = await this.analyticsService.getOverview(tenant.orgId);
    return { success: true, data };
  }

  @Get('open-tickets')
  async getOpenTickets(@CurrentTenant() tenant: TenantContext) {
    const data = await this.analyticsService.getOpenTickets(tenant.orgId);
    return { success: true, data };
  }

  @Get('performance-tat')
  async getPerformanceTat(@CurrentTenant() tenant: TenantContext) {
    const data = await this.analyticsService.getPerformanceTat(tenant.orgId);
    return { success: true, data };
  }

  @Get('ticket-trends')
  async getTicketTrends(
    @CurrentTenant() tenant: TenantContext,
    @Query('days') days?: string
  ) {
    const daysNum = days ? parseInt(days, 10) : 7;
    const data = await this.analyticsService.getTicketTrends(tenant.orgId, daysNum);
    return { success: true, data };
  }

  @Get('workforce')
  async getWorkforce(@CurrentTenant() tenant: TenantContext) {
    const data = await this.analyticsService.getWorkforce(tenant.orgId);
    return { success: true, data };
  }

  @Get('deflection')
  async getDeflection(@CurrentTenant() tenant: TenantContext) {
    const data = await this.analyticsService.getDeflection(tenant.orgId);
    return { success: true, data };
  }

  @Get('busiest-heatmap')
  async getBusiestHeatmap(@CurrentTenant() tenant: TenantContext) {
    const data = await this.analyticsService.getBusiestHeatmap(tenant.orgId);
    return { success: true, data };
  }

  @Get('csat')
  async getCsat(@CurrentTenant() tenant: TenantContext) {
    const data = await this.analyticsService.getCsat(tenant.orgId);
    return { success: true, data };
  }

  @Get('touchpoints')
  async getTouchpoints(@CurrentTenant() tenant: TenantContext) {
    const data = await this.analyticsService.getTouchpoints(tenant.orgId);
    return { success: true, data };
  }

  @Get('social')
  async getSocial(@CurrentTenant() tenant: TenantContext) {
    const data = await this.analyticsService.getSocial(tenant.orgId);
    return { success: true, data };
  }

  @Get('campaigns')
  async getCampaigns(@CurrentTenant() tenant: TenantContext) {
    const data = await this.analyticsService.getCampaigns(tenant.orgId);
    return { success: true, data };
  }
}
