import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { TenantTransactionRunner } from '../tenancy/tenant-transaction-runner';

export const PLAN_TIERS = {
  FREE: {
    planTier: 'FREE',
    seatLimit: 2,
    aiTokenAllowance: 25000,
  },
  STARTER: {
    planTier: 'STARTER',
    seatLimit: 5,
    aiTokenAllowance: 100000,
  },
  PRO: {
    planTier: 'PRO',
    seatLimit: 15,
    aiTokenAllowance: 500000,
  },
  ENTERPRISE: {
    planTier: 'ENTERPRISE',
    seatLimit: 100,
    aiTokenAllowance: 5000000,
  },
} as const;

export type PlanTierKey = keyof typeof PLAN_TIERS;

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @Inject(TenantTransactionRunner)
    private readonly tenantRunner: TenantTransactionRunner
  ) {}

  /**
   * Retrieve active subscription for tenant organization.
   * If not found, initializes default FREE subscription tier.
   */
  async getSubscription(organizationId: string) {
    return this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      let sub = await tx.subscription.findUnique({
        where: { organizationId },
      });

      if (!sub) {
        const defaultTier = PLAN_TIERS.FREE;
        const now = new Date();
        const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        sub = await tx.subscription.create({
          data: {
            organizationId,
            planTier: defaultTier.planTier,
            status: 'ACTIVE',
            seatLimit: defaultTier.seatLimit,
            aiTokenAllowance: defaultTier.aiTokenAllowance,
            currentPeriodStart: now,
            currentPeriodEnd: end,
            cancelAtPeriodEnd: false,
          },
        });
      }

      return sub;
    });
  }

  /**
   * Update subscription plan tier directly within tenant context.
   */
  async updateSubscriptionPlan(organizationId: string, planTier: PlanTierKey) {
    const tierConfig = PLAN_TIERS[planTier];
    if (!tierConfig) {
      throw new BadRequestException(`Invalid plan tier: ${planTier}`);
    }

    return this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      const existing = await tx.subscription.findUnique({
        where: { organizationId },
      });

      if (existing) {
        return tx.subscription.update({
          where: { organizationId },
          data: {
            planTier: tierConfig.planTier,
            seatLimit: tierConfig.seatLimit,
            aiTokenAllowance: tierConfig.aiTokenAllowance,
            status: 'ACTIVE',
            updatedAt: new Date(),
          },
        });
      }

      const now = new Date();
      const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      return tx.subscription.create({
        data: {
          organizationId,
          planTier: tierConfig.planTier,
          status: 'ACTIVE',
          seatLimit: tierConfig.seatLimit,
          aiTokenAllowance: tierConfig.aiTokenAllowance,
          currentPeriodStart: now,
          currentPeriodEnd: end,
        },
      });
    });
  }

  /**
   * Synchronize Stripe subscription state within tenant context.
   */
  async upsertStripeSubscription(
    organizationId: string,
    data: {
      stripeCustomerId?: string;
      stripeSubscriptionId?: string;
      planTier?: string;
      status?: string;
      currentPeriodStart?: Date;
      currentPeriodEnd?: Date;
      cancelAtPeriodEnd?: boolean;
    }
  ) {
    const tierKey = (data.planTier?.toUpperCase() as PlanTierKey) || 'FREE';
    const tierLimits = PLAN_TIERS[tierKey] || PLAN_TIERS.FREE;

    return this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      const existing = await tx.subscription.findUnique({
        where: { organizationId },
      });

      if (existing) {
        return tx.subscription.update({
          where: { organizationId },
          data: {
            stripeCustomerId: data.stripeCustomerId || existing.stripeCustomerId,
            stripeSubscriptionId: data.stripeSubscriptionId || existing.stripeSubscriptionId,
            planTier: tierLimits.planTier,
            seatLimit: tierLimits.seatLimit,
            aiTokenAllowance: tierLimits.aiTokenAllowance,
            status: data.status || existing.status,
            currentPeriodStart: data.currentPeriodStart || existing.currentPeriodStart,
            currentPeriodEnd: data.currentPeriodEnd || existing.currentPeriodEnd,
            cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? existing.cancelAtPeriodEnd,
            updatedAt: new Date(),
          },
        });
      }

      const now = data.currentPeriodStart || new Date();
      const end = data.currentPeriodEnd || new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      return tx.subscription.create({
        data: {
          organizationId,
          stripeCustomerId: data.stripeCustomerId,
          stripeSubscriptionId: data.stripeSubscriptionId,
          planTier: tierLimits.planTier,
          seatLimit: tierLimits.seatLimit,
          aiTokenAllowance: tierLimits.aiTokenAllowance,
          status: data.status || 'ACTIVE',
          currentPeriodStart: now,
          currentPeriodEnd: end,
          cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? false,
        },
      });
    });
  }
}
