import { Controller, Get, UseGuards, Inject } from '@nestjs/common';
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
}
