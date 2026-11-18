import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Inject,
  BadRequestException,
} from '@nestjs/common';
import { BillingService, PLAN_TIERS, PlanTierKey } from './billing.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { TenantGuard } from '../tenancy/tenant.guard';
import { CurrentTenant } from '../tenancy/tenant-context.decorator';
import { TenantContext, ApiResponse } from '@orbit/shared';

@Controller('api/billing')
@UseGuards(JwtAuthGuard, TenantGuard)
export class BillingController {
  constructor(
    @Inject(BillingService)
    private readonly billingService: BillingService
  ) {}

  @Get('subscription')
  async getSubscription(@CurrentTenant() tenant: TenantContext): Promise<ApiResponse> {
    const subscription = await this.billingService.getSubscription(tenant.orgId);
    return {
      success: true,
      data: subscription,
    };
  }

  @Post('subscription/plan')
  async updatePlan(
    @CurrentTenant() tenant: TenantContext,
    @Body('planTier') planTier: string
  ): Promise<ApiResponse> {
    if (!planTier || !Object.keys(PLAN_TIERS).includes(planTier.toUpperCase())) {
      throw new BadRequestException(
        `Invalid plan tier. Allowed: ${Object.keys(PLAN_TIERS).join(', ')}`
      );
    }

    const updated = await this.billingService.updateSubscriptionPlan(
      tenant.orgId,
      planTier.toUpperCase() as PlanTierKey
    );

    return {
      success: true,
      data: updated,
    };
  }
}
