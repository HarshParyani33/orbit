import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaService } from '../../apps/api/src/prisma/prisma.service';
import { TenantTransactionRunner } from '../../apps/api/src/tenancy/tenant-transaction-runner';
import { ChannelsService } from '../../apps/api/src/channels/channels.service';
import { IngressDatabaseService } from '../../apps/api/src/webhooks/ingress-database.service';
import { WebhookOutboxService } from '../../apps/api/src/webhooks/webhook-outbox.service';
import { WebhooksController } from '../../apps/api/src/webhooks/webhooks.controller';
import { MetaSignatureGuard } from '../../apps/api/src/webhooks/guards/meta-signature.guard';
import { getConfig } from '@orbit/config';
import {
  ForbiddenException,
  UnauthorizedException,
  NotFoundException,
  ExecutionContext,
} from '@nestjs/common';
import * as crypto from 'crypto';

describe('Milestone 3 Slice 3.1 — Webhook Ingress Architecture & Transactional Outbox Tests', () => {
  let prisma: PrismaService;
  let runner: TenantTransactionRunner;
  let channelsService: ChannelsService;
  let ingressDb: IngressDatabaseService;
  let outboxService: WebhookOutboxService;
  let controller: WebhooksController;
  let signatureGuard: MetaSignatureGuard;

  let orgAId: string;
  let orgBId: string;
  let whatsAppChannelAId: string;
  let instagramChannelAId: string;

  const testPhoneNumberId = '109876543210987';
  const testInstagramAccountId = 'instagram_biz_page_999';

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    runner = new TenantTransactionRunner(prisma);
    channelsService = new ChannelsService(runner);

    ingressDb = new IngressDatabaseService();
    ingressDb.onModuleInit();

    outboxService = new WebhookOutboxService(prisma, runner);
    controller = new WebhooksController(ingressDb, outboxService);
    signatureGuard = new MetaSignatureGuard();

    const orgA = await prisma.organization.findUniqueOrThrow({ where: { slug: 'acme' } });
    const orgB = await prisma.organization.findUniqueOrThrow({ where: { slug: 'beta' } });
    orgAId = orgA.id;
    orgBId = orgB.id;

    // 1. Create WhatsApp channel for Org A
    const waChan = await channelsService.createChannel(orgAId, {
      name: 'Acme Official WhatsApp',
      provider: 'META_WHATSAPP',
      config: { phoneNumberId: testPhoneNumberId },
    });
    whatsAppChannelAId = waChan.id;

    // Register routing lookup using database security definer function register_channel_routing
    await runner.runWithTenant(orgAId, async (tx) => {
      await tx.$executeRaw`SELECT register_channel_routing(${whatsAppChannelAId}::uuid, 'META_WHATSAPP', ${testPhoneNumberId})`;
    });

    // 2. Create Instagram channel for Org A
    const igChan = await channelsService.createChannel(orgAId, {
      name: 'Acme Instagram Direct',
      provider: 'META_INSTAGRAM',
      config: { accountId: testInstagramAccountId },
    });
    instagramChannelAId = igChan.id;

    await runner.runWithTenant(orgAId, async (tx) => {
      await tx.$executeRaw`SELECT register_channel_routing(${instagramChannelAId}::uuid, 'META_INSTAGRAM', ${testInstagramAccountId})`;
    });
  });

  afterAll(async () => {
    await ingressDb.onModuleDestroy();
    await prisma.$disconnect();
  });

  // Helper function to create mock ExecutionContext with rawBody
  function createMockExecutionContext(
    headers: Record<string, string>,
    body: any,
    rawBody?: Buffer
  ): ExecutionContext {
    const rawBuffer = rawBody || Buffer.from(typeof body === 'string' ? body : JSON.stringify(body), 'utf8');
    const req = {
      headers: { ...headers },
      body,
      rawBody: rawBuffer,
    };
    return {
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => ({}),
        getNext: () => ({}),
      }),
    } as unknown as ExecutionContext;
  }

  // --------------------------------------------------------------------------
  // 1. META CHALLENGE HANDSHAKE VERIFICATION (GET)
  // --------------------------------------------------------------------------
  describe('1. Meta Webhook Subscription Challenge Handshake (GET)', () => {
    it('successfully responds with hub.challenge when hub.verify_token and mode match', () => {
      const config = getConfig();
      const challengeToken = '1158201444';
      const result = controller.verifyWhatsAppWebhook(
        'subscribe',
        config.META_WEBHOOK_VERIFY_TOKEN,
        challengeToken
      );

      expect(result).toBe(challengeToken);

      const igResult = controller.verifyInstagramWebhook(
        'subscribe',
        config.META_WEBHOOK_VERIFY_TOKEN,
        challengeToken
      );
      expect(igResult).toBe(challengeToken);
    });

    it('rejects handshake with 403 Forbidden when verify_token is invalid', () => {
      expect(() => {
        controller.verifyWhatsAppWebhook('subscribe', 'invalid_token_attempt', '12345');
      }).toThrow(ForbiddenException);

      expect(() => {
        controller.verifyInstagramWebhook('subscribe', 'wrong_token', '12345');
      }).toThrow(ForbiddenException);
    });

    it('rejects handshake with 403 Forbidden when mode is not subscribe', () => {
      const config = getConfig();
      expect(() => {
        controller.verifyWhatsAppWebhook('unsubscribe', config.META_WEBHOOK_VERIFY_TOKEN, '12345');
      }).toThrow(ForbiddenException);
    });
  });

  // --------------------------------------------------------------------------
  // 2. META HMAC-SHA256 SIGNATURE VERIFICATION (POST)
  // --------------------------------------------------------------------------
  describe('2. Meta HMAC-SHA256 Signature Verification Guard', () => {
    it('accepts valid HMAC-SHA256 signature calculated over raw request body', () => {
      const config = getConfig();
      const payload = { entry: [{ id: 'test_entry' }] };
      const rawBody = Buffer.from(JSON.stringify(payload), 'utf8');
      const signature = crypto
        .createHmac('sha256', config.META_APP_SECRET)
        .update(rawBody)
        .digest('hex');

      const ctx = createMockExecutionContext(
        { 'x-hub-signature-256': `sha256=${signature}` },
        payload,
        rawBody
      );

      const canActivate = signatureGuard.canActivate(ctx);
      expect(canActivate).toBe(true);
    });

    it('rejects request with 401 Unauthorized when X-Hub-Signature-256 header is missing', () => {
      const payload = { entry: [{ id: 'test_entry' }] };
      const ctx = createMockExecutionContext({}, payload);

      expect(() => signatureGuard.canActivate(ctx)).toThrow(UnauthorizedException);
    });

    it('rejects forged request with 401 Unauthorized when signature does not match payload', () => {
      const payload = { entry: [{ id: 'legit_entry' }] };
      const rawBody = Buffer.from(JSON.stringify(payload), 'utf8');
      const forgedSignature = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

      const ctx = createMockExecutionContext(
        { 'x-hub-signature-256': `sha256=${forgedSignature}` },
        payload,
        rawBody
      );

      expect(() => signatureGuard.canActivate(ctx)).toThrow(UnauthorizedException);
    });

    it('rejects request with 401 Unauthorized when signature format is invalid (not sha256=)', () => {
      const payload = { entry: [] };
      const ctx = createMockExecutionContext(
        { 'x-hub-signature-256': 'md5=invalid_prefix' },
        payload
      );

      expect(() => signatureGuard.canActivate(ctx)).toThrow(UnauthorizedException);
    });
  });

  // --------------------------------------------------------------------------
  // 3. PRE-TENANT INGRESS ROUTING RESOLUTION (orbit_ingress role)
  // --------------------------------------------------------------------------
  describe('3. Pre-Tenant Ingress Routing Resolution', () => {
    it('resolves active WhatsApp channel and organization via orbit_ingress role', async () => {
      const routing = await ingressDb.resolveChannelRouting('META_WHATSAPP', testPhoneNumberId);

      expect(routing).not.toBeNull();
      expect(routing?.channel_id).toBe(whatsAppChannelAId);
      expect(routing?.organization_id).toBe(orgAId);
      expect(routing?.status).toBe('ACTIVE');
    });

    it('resolves active Instagram channel and organization via orbit_ingress role', async () => {
      const routing = await ingressDb.resolveChannelRouting('META_INSTAGRAM', testInstagramAccountId);

      expect(routing).not.toBeNull();
      expect(routing?.channel_id).toBe(instagramChannelAId);
      expect(routing?.organization_id).toBe(orgAId);
      expect(routing?.status).toBe('ACTIVE');
    });

    it('returns null when querying unregistered external identifier', async () => {
      const routing = await ingressDb.resolveChannelRouting('META_WHATSAPP', 'unknown_phone_999999');
      expect(routing).toBeNull();
    });

    it('inbound webhook for unknown account throws 404 NotFoundException', async () => {
      const unmappedPayload = {
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: 'unknown_phone_999999' },
                  messages: [{ id: 'wamid.unknown' }],
                },
              },
            ],
          },
        ],
      };

      await expect(controller.handleWhatsAppWebhook(unmappedPayload)).rejects.toThrow(NotFoundException);
    });
  });

  // --------------------------------------------------------------------------
  // 4. TRANSACTIONAL OUTBOX & IDEMPOTENCY GUARANTEES
  // --------------------------------------------------------------------------
  describe('4. Transactional Outbox & Idempotency Guarantees', () => {
    it('persists incoming WhatsApp webhook message to webhook_events outbox table', async () => {
      const messageId = `wamid.test_${Date.now()}_001`;
      const webhookPayload = {
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: testPhoneNumberId },
                  messages: [
                    {
                      id: messageId,
                      from: '+15559876543',
                      text: { body: 'Hello from WhatsApp integration test' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const result = await controller.handleWhatsAppWebhook(webhookPayload);
      expect(result.status).toBe('success');
      expect(result.received).toBe(true);

      // Verify event in database outbox under tenant context
      const event = await runner.runWithTenant(orgAId, async (tx) => {
        return tx.webhookEvent.findFirstOrThrow({
          where: {
            channelId: whatsAppChannelAId,
            provider: 'META_WHATSAPP',
            idempotencyKey: messageId,
          },
        });
      });

      expect(event.organizationId).toBe(orgAId);
      expect(event.channelId).toBe(whatsAppChannelAId);
      expect(event.dispatchStatus).toBe('DISPATCHED');
      expect(event.processingStatus).toBe('UNCLAIMED');
    });

    it('idempotently deduplicates identical webhook redelivery without creating new outbox rows', async () => {
      const duplicateKey = `wamid.dup_${Date.now()}`;
      const payload = { test: 'duplicate delivery payload' };

      // First delivery: creates new event
      const firstResult = await outboxService.recordEvent(
        orgAId,
        whatsAppChannelAId,
        'META_WHATSAPP',
        duplicateKey,
        payload
      );
      expect(firstResult.isDuplicate).toBe(false);

      // Second delivery with identical idempotencyKey: returns existing event, isDuplicate = true
      const secondResult = await outboxService.recordEvent(
        orgAId,
        whatsAppChannelAId,
        'META_WHATSAPP',
        duplicateKey,
        payload
      );
      expect(secondResult.isDuplicate).toBe(true);
      expect(secondResult.event.id).toBe(firstResult.event.id);

      // Verify row count in database: exactly 1 row exists
      const count = await runner.runWithTenant(orgAId, async (tx) => {
        return tx.webhookEvent.count({
          where: {
            channelId: whatsAppChannelAId,
            idempotencyKey: duplicateKey,
          },
        });
      });
      expect(count).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // 5. WORKER PROCESSING LEASE LIFECYCLE & FENCING
  // --------------------------------------------------------------------------
  describe('5. Worker Processing Lease Lifecycle & Fencing Tokens', () => {
    it('worker claims processing lease with fencing token and marks PROCESSING', async () => {
      const idempotencyKey = `wamid.worker_test_${Date.now()}`;
      const { event } = await outboxService.recordEvent(
        orgAId,
        whatsAppChannelAId,
        'META_WHATSAPP',
        idempotencyKey,
        { text: 'Worker processing test' }
      );

      const workerToken1 = crypto.randomUUID();
      const claimed = await outboxService.claimWorkerLease(orgAId, event.id, workerToken1, 60);
      expect(claimed).toBe(true);

      // Concurrent worker attempt with different token must fail (0 rows updated)
      const workerToken2 = crypto.randomUUID();
      const concurrentClaim = await outboxService.claimWorkerLease(orgAId, event.id, workerToken2, 60);
      expect(concurrentClaim).toBe(false);

      // Worker completes processing successfully
      const processed = await outboxService.markProcessed(orgAId, event.id, workerToken1);
      expect(processed).toBe(true);

      // Verify event state
      const updated = await runner.runWithTenant(orgAId, async (tx) => {
        return tx.webhookEvent.findUniqueOrThrow({ where: { id: event.id } });
      });
      expect(updated.processingStatus).toBe('PROCESSED');
      expect(updated.processedAt).not.toBeNull();
    });

    it('worker handles failure with retry scheduling and transitions to DEAD_LETTER after max attempts', async () => {
      const idempotencyKey = `wamid.fail_test_${Date.now()}`;
      const { event } = await outboxService.recordEvent(
        orgAId,
        whatsAppChannelAId,
        'META_WHATSAPP',
        idempotencyKey,
        { text: 'Failing worker test' }
      );

      // Simulate 5 consecutive failures
      for (let attempt = 1; attempt <= 5; attempt++) {
        const leaseToken = crypto.randomUUID();
        const claimed = await outboxService.claimWorkerLease(orgAId, event.id, leaseToken, 60);
        expect(claimed).toBe(true);

        const failed = await outboxService.markFailed(
          orgAId,
          event.id,
          leaseToken,
          `Simulated error on attempt ${attempt}`,
          0 // 0s delay for test
        );
        expect(failed).toBe(true);
      }

      // 5th attempt must reach DEAD_LETTER
      const deadLetterEvent = await runner.runWithTenant(orgAId, async (tx) => {
        return tx.webhookEvent.findUniqueOrThrow({ where: { id: event.id } });
      });

      expect(deadLetterEvent.processingStatus).toBe('DEAD_LETTER');
      expect(deadLetterEvent.attemptCount).toBe(5);
      expect(deadLetterEvent.lastError).toContain('Simulated error on attempt 5');
    });
  });

  // --------------------------------------------------------------------------
  // 6. MULTI-TENANT ROW LEVEL SECURITY (RLS) ISOLATION
  // --------------------------------------------------------------------------
  describe('6. PostgreSQL Row Level Security (RLS) Isolation', () => {
    it('Tenant B cannot access or view webhook events belonging to Tenant A', async () => {
      const testKey = `wamid.rls_test_${Date.now()}`;
      const { event } = await outboxService.recordEvent(
        orgAId,
        whatsAppChannelAId,
        'META_WHATSAPP',
        testKey,
        { data: 'tenant A secret' }
      );

      // Tenant A can see it
      const eventInTenantA = await runner.runWithTenant(orgAId, async (tx) => {
        return tx.webhookEvent.findUnique({ where: { id: event.id } });
      });
      expect(eventInTenantA).not.toBeNull();
      expect(eventInTenantA?.id).toBe(event.id);

      // Tenant B querying for the exact same event ID receives null (RLS blocks access)
      const eventInTenantB = await runner.runWithTenant(orgBId, async (tx) => {
        return tx.webhookEvent.findUnique({ where: { id: event.id } });
      });
      expect(eventInTenantB).toBeNull();
    });
  });
});
