import { Injectable, Inject, Logger, BadRequestException } from '@nestjs/common';
import { WebhookOutboxService } from './webhook-outbox.service';
import { BillingService, PlanTierKey } from '../billing/billing.service';
import { TenantTransactionRunner } from '../tenancy/tenant-transaction-runner';
import { PrismaService } from '../prisma/prisma.service';

export interface StripeEvent {
  id: string;
  type: string;
  data: {
    object: Record<string, any>;
  };
  created: number;
}

@Injectable()
export class StripeIngestionService {
  private readonly logger = new Logger(StripeIngestionService.name);

  constructor(
    @Inject(WebhookOutboxService)
    private readonly outboxService: WebhookOutboxService,
    @Inject(BillingService)
    private readonly billingService: BillingService,
    @Inject(TenantTransactionRunner)
    private readonly tenantRunner: TenantTransactionRunner,
    @Inject(PrismaService)
    private readonly prisma: PrismaService
  ) {}

  /**
   * Resolve organization ID associated with Stripe event.
   * Examines metadata, subscription ID, or customer ID.
   */
  async resolveOrganizationId(event: StripeEvent): Promise<string | null> {
    const obj = event.data.object;

    // 1. Check direct metadata on object or child lines
    if (obj.metadata && typeof obj.metadata.organization_id === 'string') {
      return obj.metadata.organization_id;
    }
    if (typeof obj.client_reference_id === 'string' && obj.client_reference_id) {
      return obj.client_reference_id;
    }
    if (obj.lines?.data?.[0]?.metadata?.organization_id) {
      return obj.lines.data[0].metadata.organization_id;
    }

    // 2. Query existing subscription by stripeSubscriptionId or stripeCustomerId
    const subId = obj.id && typeof obj.id === 'string' && obj.id.startsWith('sub_')
      ? obj.id
      : (typeof obj.subscription === 'string' ? obj.subscription : null);

    const customerId = typeof obj.customer === 'string' ? obj.customer : null;

    if (subId || customerId) {
      // 2.1 First check Category B ChannelRoutingLookup (unaffected by tenant RLS)
      const routingLookup = await this.prisma.channelRoutingLookup.findFirst({
        where: {
          provider: 'STRIPE',
          externalAccountId: { in: [subId, customerId].filter(Boolean) as string[] },
          status: 'ACTIVE',
        },
        select: { organizationId: true },
      });

      if (routingLookup) {
        return routingLookup.organizationId;
      }

      // 2.2 Fallback query for subscriptions using direct Prisma query
      const match = await this.prisma.subscription.findFirst({
        where: {
          OR: [
            subId ? { stripeSubscriptionId: subId } : undefined,
            customerId ? { stripeCustomerId: customerId } : undefined,
          ].filter(Boolean) as any[],
        },
        select: { organizationId: true },
      });

      if (match) {
        return match.organizationId;
      }
    }

    return null;
  }


  /**
   * Ingest and process an inbound Stripe webhook event.
   */
  async handleStripeEvent(event: StripeEvent): Promise<{ handled: boolean; eventId: string }> {
    if (!event || !event.id || !event.type) {
      throw new BadRequestException('Invalid Stripe event structure');
    }

    const orgId = await this.resolveOrganizationId(event);
    if (!orgId) {
      this.logger.warn(
        `Unable to resolve organization for Stripe event ${event.id} (${event.type}). Skipping.`
      );
      return { handled: false, eventId: event.id };
    }

    // 1. Resolve or create a channel for the organization within tenant context
    const channelId = await this.tenantRunner.runWithTenant(orgId, async (tx) => {
      let ch = await tx.channel.findFirst({
        where: { organizationId: orgId },
        select: { id: true },
      });

      if (!ch) {
        ch = await tx.channel.create({
          data: {
            organizationId: orgId,
            provider: 'STRIPE',
            name: 'Stripe Billing Channel',
            status: 'ACTIVE',
          },
          select: { id: true },
        });
      }

      return ch.id;
    });

    // 2. Record event in transactional outbox
    const { event: recordedEvent, isDuplicate } = await this.outboxService.recordEvent(
      orgId,
      channelId,
      'STRIPE',
      event.id,
      event
    );

    await this.outboxService.markDispatched(orgId, recordedEvent.id, recordedEvent.dispatchToken);

    if (isDuplicate) {
      return { handled: true, eventId: event.id };
    }

    const obj = event.data.object;

    // 2. Process specific event types
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const stripeSubId = obj.id;
        const stripeCustId = obj.customer;
        const status = (obj.status || 'ACTIVE').toUpperCase();
        const planTier = (obj.metadata?.plan_tier || 'STARTER').toUpperCase() as PlanTierKey;

        const periodStart = obj.current_period_start
          ? new Date(obj.current_period_start * 1000)
          : new Date();
        const periodEnd = obj.current_period_end
          ? new Date(obj.current_period_end * 1000)
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        await this.billingService.upsertStripeSubscription(orgId, {
          stripeSubscriptionId: stripeSubId,
          stripeCustomerId: stripeCustId,
          planTier,
          status,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: Boolean(obj.cancel_at_period_end),
        });

        // Persist Category B channel routing lookup so subsequent events without metadata resolve cleanly
        if (stripeSubId) {
          await this.prisma.channelRoutingLookup.upsert({
            where: {
              uq_channel_routing_provider_ext: {
                provider: 'STRIPE',
                externalAccountId: stripeSubId,
              },
            },
            create: {
              provider: 'STRIPE',
              externalAccountId: stripeSubId,
              channelId,
              organizationId: orgId,
              status: 'ACTIVE',
            },
            update: {
              channelId,
              organizationId: orgId,
              status: 'ACTIVE',
            },
          });
        }
        if (stripeCustId) {
          await this.prisma.channelRoutingLookup.upsert({
            where: {
              uq_channel_routing_provider_ext: {
                provider: 'STRIPE',
                externalAccountId: stripeCustId,
              },
            },
            create: {
              provider: 'STRIPE',
              externalAccountId: stripeCustId,
              channelId,
              organizationId: orgId,
              status: 'ACTIVE',
            },
            update: {
              channelId,
              organizationId: orgId,
              status: 'ACTIVE',
            },
          });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const stripeSubId = obj.id;
        await this.billingService.upsertStripeSubscription(orgId, {
          stripeSubscriptionId: stripeSubId,
          planTier: 'FREE',
          status: 'CANCELED',
          cancelAtPeriodEnd: false,
        });
        break;
      }

      case 'invoice.payment_failed': {
        const stripeSubId = obj.subscription;
        if (stripeSubId) {
          await this.billingService.upsertStripeSubscription(orgId, {
            stripeSubscriptionId: stripeSubId,
            status: 'PAST_DUE',
          });
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const stripeSubId = obj.subscription;
        if (stripeSubId) {
          await this.billingService.upsertStripeSubscription(orgId, {
            stripeSubscriptionId: stripeSubId,
            status: 'ACTIVE',
          });
        }
        break;
      }

      default:
        this.logger.debug(`Unhandled Stripe event type: ${event.type}`);
    }

    return { handled: true, eventId: event.id };
  }
}
