import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as crypto from 'crypto';
import { NestFactory } from '@nestjs/core';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/app.config';
import { AuthService } from '../../apps/api/src/auth/auth.service';
import { PrismaService } from '../../apps/api/src/prisma/prisma.service';
import { BillingService, PLAN_TIERS } from '../../apps/api/src/billing/billing.service';
import { TenantTransactionRunner } from '../../apps/api/src/tenancy/tenant-transaction-runner';
import { getConfig } from '@orbit/config';

describe('Milestone 3 Slice 3.5 — Commercial Billing Foundation & Stripe Webhooks Tests', () => {
  let app: INestApplication;
  let baseUrl: string;
  let authService: AuthService;
  let prisma: PrismaService;
  let billingService: BillingService;
  let tenantRunner: TenantTransactionRunner;
  let webhookSecret: string;

  // Tenant A Credentials
  let tenantAToken: string;
  let tenantAOrgId: string;
  let tenantAStripeCustId: string;
  let tenantAStripeSubId: string;

  // Tenant B Credentials
  let tenantBToken: string;
  let tenantBOrgId: string;

  function createSignedHeaders(payload: string, secret: string, timestamp?: number) {
    const t = timestamp !== undefined ? timestamp : Math.floor(Date.now() / 1000);
    const signature = crypto
      .createHmac('sha256', secret)
      .update(`${t}.${payload}`)
      .digest('hex');

    return {
      'Content-Type': 'application/json',
      'Stripe-Signature': `t=${t},v1=${signature}`,
      'X-Requested-With': 'XMLHttpRequest',
    };
  }

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { rawBody: true, logger: false });
    configureApp(app);
    await app.listen(0);

    baseUrl = await app.getUrl();
    authService = app.get(AuthService);
    prisma = app.get(PrismaService);
    billingService = app.get(BillingService);
    tenantRunner = app.get(TenantTransactionRunner);

    const config = getConfig();
    webhookSecret = config.STRIPE_WEBHOOK_SECRET;

    tenantAStripeCustId = `cus_test_${Date.now()}`;
    tenantAStripeSubId = `sub_test_${Date.now()}`;

    // 1. Register Tenant A
    const emailA = `stripe_tenant_a_${Date.now()}@example.com`;
    const regA = await authService.register({
      name: 'Stripe Tester A',
      email: emailA,
      password: 'Password123!',
      organizationName: `Stripe Org A ${Date.now()}`,
    });
    tenantAToken = regA.accessToken;
    tenantAOrgId = regA.response.organizations[0].id;

    // Initialize Tenant A subscription with Stripe IDs
    await billingService.upsertStripeSubscription(tenantAOrgId, {
      stripeCustomerId: tenantAStripeCustId,
      stripeSubscriptionId: tenantAStripeSubId,
      planTier: 'STARTER',
      status: 'ACTIVE',
    });

    // 2. Register Tenant B
    const emailB = `stripe_tenant_b_${Date.now()}@example.com`;
    const regB = await authService.register({
      name: 'Stripe Tester B',
      email: emailB,
      password: 'Password123!',
      organizationName: `Stripe Org B ${Date.now()}`,
    });
    tenantBToken = regB.accessToken;
    tenantBOrgId = regB.response.organizations[0].id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  // ============================================================================
  // SECTION 1: Stripe Signature Verification & Replay Protection
  // ============================================================================
  describe('1. Stripe Signature Verification & Replay Protection', () => {
    it('accepts legitimate Stripe webhook payload with valid HMAC-SHA256 signature', async () => {
      const payloadObj = {
        id: `evt_valid_${Date.now()}`,
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: tenantAStripeSubId,
            customer: tenantAStripeCustId,
            status: 'active',
            metadata: { organization_id: tenantAOrgId, plan_tier: 'PRO' },
          },
        },
        created: Math.floor(Date.now() / 1000),
      };
      const rawPayload = JSON.stringify(payloadObj);
      const headers = createSignedHeaders(rawPayload, webhookSecret);

      const response = await fetch(`${baseUrl}/api/webhooks/stripe`, {
        method: 'POST',
        headers,
        body: rawPayload,
      });

      if (response.status !== 200) {
        console.error('Response status:', response.status, await response.text());
      }

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.status).toBe('success');
      expect(json.handled).toBe(true);
    });

    it('rejects inbound Stripe webhook missing Stripe-Signature header with 401', async () => {
      const rawPayload = JSON.stringify({ id: 'evt_no_sig' });
      const response = await fetch(`${baseUrl}/api/webhooks/stripe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: rawPayload,
      });

      expect(response.status).toBe(401);
    });

    it('rejects forged Stripe webhook signature with 401', async () => {
      const rawPayload = JSON.stringify({ id: `evt_forged_${Date.now()}` });
      const headers = createSignedHeaders(rawPayload, 'wrong_secret_attacker');

      const response = await fetch(`${baseUrl}/api/webhooks/stripe`, {
        method: 'POST',
        headers,
        body: rawPayload,
      });

      expect(response.status).toBe(401);
    });

    it('rejects replayed webhook with expired timestamp outside 300s tolerance window with 401', async () => {
      const rawPayload = JSON.stringify({ id: `evt_replay_${Date.now()}` });
      const tenMinutesAgo = Math.floor(Date.now() / 1000) - 600; // 600s in past
      const headers = createSignedHeaders(rawPayload, webhookSecret, tenMinutesAgo);

      const response = await fetch(`${baseUrl}/api/webhooks/stripe`, {
        method: 'POST',
        headers,
        body: rawPayload,
      });

      expect(response.status).toBe(401);
    });
  });

  // ============================================================================
  // SECTION 2: Idempotent Event Ingestion & Outbox Recording
  // ============================================================================
  describe('2. Idempotent Ingestion & Transactional Outbox', () => {
    it('idempotently handles duplicate Stripe event deliveries without duplicate processing', async () => {
      const eventId = `evt_idemp_${Date.now()}`;
      const payloadObj = {
        id: eventId,
        type: 'invoice.payment_succeeded',
        data: {
          object: {
            id: `in_test_${Date.now()}`,
            subscription: tenantAStripeSubId,
            customer: tenantAStripeCustId,
            metadata: { organization_id: tenantAOrgId },
          },
        },
        created: Math.floor(Date.now() / 1000),
      };
      const rawPayload = JSON.stringify(payloadObj);
      const headers = createSignedHeaders(rawPayload, webhookSecret);

      // 1. First Delivery
      const res1 = await fetch(`${baseUrl}/api/webhooks/stripe`, {
        method: 'POST',
        headers,
        body: rawPayload,
      });
      expect(res1.status).toBe(200);

      // 2. Duplicate Delivery (same eventId)
      const res2 = await fetch(`${baseUrl}/api/webhooks/stripe`, {
        method: 'POST',
        headers,
        body: rawPayload,
      });
      expect(res2.status).toBe(200);
      const json2 = await responseJson(res2);
      expect(json2.status).toBe('success');
      expect(json2.handled).toBe(true);

      // Verify exactly ONE outbox record exists within tenant context
      const outboxRecords = await tenantRunner.runWithTenant(tenantAOrgId, async (tx) => {
        return tx.webhookEvent.findMany({
          where: {
            organizationId: tenantAOrgId,
            provider: 'STRIPE',
            idempotencyKey: eventId,
          },
        });
      });
      expect(outboxRecords).toHaveLength(1);
    });
  });

  // ============================================================================
  // SECTION 3: Subscription Lifecycle & Plan Quotas
  // ============================================================================
  describe('3. Subscription Lifecycle & Plan Quotas', () => {
    it('upgrades subscription to PRO plan tier with updated seat limits and AI token allowances', async () => {
      const payloadObj = {
        id: `evt_upgrade_${Date.now()}`,
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: tenantAStripeSubId,
            customer: tenantAStripeCustId,
            status: 'active',
            metadata: { organization_id: tenantAOrgId, plan_tier: 'PRO' },
          },
        },
        created: Math.floor(Date.now() / 1000),
      };
      const rawPayload = JSON.stringify(payloadObj);
      const headers = createSignedHeaders(rawPayload, webhookSecret);

      const response = await fetch(`${baseUrl}/api/webhooks/stripe`, {
        method: 'POST',
        headers,
        body: rawPayload,
      });
      expect(response.status).toBe(200);

      const sub = await billingService.getSubscription(tenantAOrgId);
      expect(sub.planTier).toBe('PRO');
      expect(sub.seatLimit).toBe(PLAN_TIERS.PRO.seatLimit);
      expect(sub.aiTokenAllowance).toBe(PLAN_TIERS.PRO.aiTokenAllowance);
      expect(sub.status).toBe('ACTIVE');
    });

    it('handles payment failure (invoice.payment_failed) by transitioning status to PAST_DUE', async () => {
      const payloadObj = {
        id: `evt_fail_${Date.now()}`,
        type: 'invoice.payment_failed',
        data: {
          object: {
            id: `in_fail_${Date.now()}`,
            subscription: tenantAStripeSubId,
            customer: tenantAStripeCustId,
            metadata: { organization_id: tenantAOrgId },
          },
        },
        created: Math.floor(Date.now() / 1000),
      };
      const rawPayload = JSON.stringify(payloadObj);
      const headers = createSignedHeaders(rawPayload, webhookSecret);

      const response = await fetch(`${baseUrl}/api/webhooks/stripe`, {
        method: 'POST',
        headers,
        body: rawPayload,
      });
      expect(response.status).toBe(200);

      const sub = await billingService.getSubscription(tenantAOrgId);
      expect(sub.status).toBe('PAST_DUE');
    });

    it('handles subscription cancellation (customer.subscription.deleted) by reverting to FREE tier limits', async () => {
      const payloadObj = {
        id: `evt_del_${Date.now()}`,
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: tenantAStripeSubId,
            customer: tenantAStripeCustId,
            status: 'canceled',
            metadata: { organization_id: tenantAOrgId },
          },
        },
        created: Math.floor(Date.now() / 1000),
      };
      const rawPayload = JSON.stringify(payloadObj);
      const headers = createSignedHeaders(rawPayload, webhookSecret);

      const response = await fetch(`${baseUrl}/api/webhooks/stripe`, {
        method: 'POST',
        headers,
        body: rawPayload,
      });
      expect(response.status).toBe(200);

      const sub = await billingService.getSubscription(tenantAOrgId);
      expect(sub.planTier).toBe('FREE');
      expect(sub.seatLimit).toBe(PLAN_TIERS.FREE.seatLimit);
      expect(sub.aiTokenAllowance).toBe(PLAN_TIERS.FREE.aiTokenAllowance);
      expect(sub.status).toBe('CANCELED');
    });
  });

  // ============================================================================
  // SECTION 4: Billing API & Multi-Tenant RLS Isolation
  // ============================================================================
  describe('4. Billing API & Multi-Tenant RLS Isolation', () => {
    it('Tenant A retrieves its own subscription via GET /api/billing/subscription', async () => {
      const response = await fetch(`${baseUrl}/api/billing/subscription`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${tenantAToken}`,
        },
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.organizationId).toBe(tenantAOrgId);
      expect(json.data.stripeCustomerId).toBe(tenantAStripeCustId);
    });

    it('Tenant B receives its own default subscription via GET /api/billing/subscription (never Tenant A)', async () => {
      const response = await fetch(`${baseUrl}/api/billing/subscription`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${tenantBToken}`,
        },
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.organizationId).toBe(tenantBOrgId);
      expect(json.data.planTier).toBe('FREE');
      expect(json.data.stripeCustomerId).toBeNull();
    });

    it('Direct database query in PostgreSQL under Tenant B context returns 0 rows for Tenant A subscription (RLS enforced)', async () => {
      const subs = await tenantRunner.runWithTenant(tenantBOrgId, async (tx) => {
        return tx.subscription.findMany({
          where: { organizationId: tenantAOrgId },
        });
      });

      expect(subs).toHaveLength(0);
    });
  });
});

async function responseJson(res: Response): Promise<any> {
  return res.json();
}
