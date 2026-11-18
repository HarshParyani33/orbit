import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantTransactionRunner } from '../tenancy/tenant-transaction-runner';
import * as crypto from 'crypto';

export interface RecordedWebhookEventResult {
  event: any;
  isDuplicate: boolean;
}

@Injectable()
export class WebhookOutboxService {
  private readonly logger = new Logger(WebhookOutboxService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TenantTransactionRunner) private readonly tenantRunner: TenantTransactionRunner
  ) {}

  /**
   * Persists an incoming webhook event into the transactional outbox table (`webhook_events`).
   * Executes within TenantTransactionRunner under PostgreSQL Row-Level Security (RLS).
   * Idempotent by `(organization_id, channel_id, provider, idempotency_key)`.
   */
  async recordEvent(
    organizationId: string,
    channelId: string,
    provider: string,
    idempotencyKey: string,
    payload: any
  ): Promise<RecordedWebhookEventResult> {
    return this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      // 1. Check for existing event (Idempotent Deduplication)
      const existing = await tx.webhookEvent.findUnique({
        where: {
          uq_webhook_provider_event: {
            organizationId,
            channelId,
            provider,
            idempotencyKey,
          },
        },
      });

      if (existing) {
        this.logger.debug(
          `Duplicate webhook event ignored: provider=${provider}, idempotencyKey=${idempotencyKey}`
        );
        return { event: existing, isDuplicate: true };
      }

      // 2. Insert new event with 30s dispatch lease
      const dispatchToken = crypto.randomUUID();
      const dispatchExpiresAt = new Date(Date.now() + 30000);

      const event = await tx.webhookEvent.create({
        data: {
          organizationId,
          channelId,
          provider,
          idempotencyKey,
          payload,
          dispatchStatus: 'PENDING_DISPATCH',
          dispatchToken,
          dispatchExpiresAt,
          processingStatus: 'UNCLAIMED',
          attemptCount: 0,
          maxAttempts: 5,
        },
      });

      return { event, isDuplicate: false };
    });
  }

  /**
   * Acknowledges that the webhook event was successfully placed onto the delivery queue.
   */
  async markDispatched(
    organizationId: string,
    eventId: string,
    dispatchToken?: string
  ): Promise<boolean> {
    return this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      const updateResult = await tx.webhookEvent.updateMany({
        where: {
          id: eventId,
          organizationId,
          ...(dispatchToken ? { dispatchToken } : {}),
        },
        data: {
          dispatchStatus: 'DISPATCHED',
          dispatchToken: null,
          dispatchExpiresAt: null,
          updatedAt: new Date(),
        },
      });

      return updateResult.count > 0;
    });
  }

  /**
   * Atomically acquires a processing lease for a worker.
   * Fenced by `leaseToken` and `leaseExpiresAt`.
   */
  async claimWorkerLease(
    organizationId: string,
    eventId: string,
    workerLeaseToken: string,
    leaseDurationSeconds = 60
  ): Promise<boolean> {
    return this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + leaseDurationSeconds * 1000);

      const updateResult = await tx.webhookEvent.updateMany({
        where: {
          id: eventId,
          organizationId,
          OR: [
            { processingStatus: 'UNCLAIMED' },
            {
              processingStatus: 'PROCESSING',
              leaseExpiresAt: { lt: now },
            },
          ],
          AND: [
            {
              OR: [
                { nextRetryAt: null },
                { nextRetryAt: { lte: now } },
              ],
            },
          ],
        },
        data: {
          processingStatus: 'PROCESSING',
          leaseToken: workerLeaseToken,
          leaseExpiresAt: expiresAt,
          attemptCount: { increment: 1 },
          updatedAt: now,
        },
      });

      return updateResult.count > 0;
    });
  }

  /**
   * Renews worker lease heartbeat during prolonged processing.
   */
  async renewWorkerLease(
    organizationId: string,
    eventId: string,
    workerLeaseToken: string,
    leaseDurationSeconds = 60
  ): Promise<boolean> {
    return this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + leaseDurationSeconds * 1000);

      const updateResult = await tx.webhookEvent.updateMany({
        where: {
          id: eventId,
          organizationId,
          leaseToken: workerLeaseToken,
        },
        data: {
          leaseExpiresAt: expiresAt,
          updatedAt: now,
        },
      });

      return updateResult.count > 0;
    });
  }

  /**
   * Marks a webhook event as successfully processed conditioned on holding the lease token.
   */
  async markProcessed(
    organizationId: string,
    eventId: string,
    workerLeaseToken: string
  ): Promise<boolean> {
    return this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      const now = new Date();
      const updateResult = await tx.webhookEvent.updateMany({
        where: {
          id: eventId,
          organizationId,
          leaseToken: workerLeaseToken,
        },
        data: {
          processingStatus: 'PROCESSED',
          leaseToken: null,
          leaseExpiresAt: null,
          processedAt: now,
          updatedAt: now,
        },
      });

      return updateResult.count > 0;
    });
  }

  /**
   * Records a processing failure with exponential backoff or marks DEAD_LETTER if max attempts exceeded.
   */
  async markFailed(
    organizationId: string,
    eventId: string,
    workerLeaseToken: string,
    errorMessage: string,
    retryDelaySeconds = 30
  ): Promise<boolean> {
    return this.tenantRunner.runWithTenant(organizationId, async (tx) => {
      const event = await tx.webhookEvent.findFirst({
        where: { id: eventId, organizationId, leaseToken: workerLeaseToken },
      });

      if (!event) {
        return false;
      }

      const isDeadLetter = event.attemptCount >= event.maxAttempts;
      const now = new Date();
      const nextRetry = isDeadLetter ? null : new Date(now.getTime() + retryDelaySeconds * 1000);

      const updateResult = await tx.webhookEvent.updateMany({
        where: {
          id: eventId,
          organizationId,
          leaseToken: workerLeaseToken,
        },
        data: {
          processingStatus: isDeadLetter ? 'DEAD_LETTER' : 'UNCLAIMED',
          leaseToken: null,
          leaseExpiresAt: null,
          lastError: errorMessage,
          nextRetryAt: nextRetry,
          updatedAt: now,
        },
      });

      return updateResult.count > 0;
    });
  }
}
