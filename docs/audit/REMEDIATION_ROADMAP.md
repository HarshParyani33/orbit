# Project Orbit — Remediation Roadmap
## Prioritized Remediation Plan, Implementation Specifications & Acceptance Contracts

**Document ID:** `AUDIT-REMEDIATION-20261119-01`  
**Execution Date:** `2026-11-19`  
**Governance Runtime:** `Gravitas Core Skill Mode`  
**Target Repository:** `HarshParyani33/orbit`  
**Commit SHA:** `6a04803b0ec37301b46ec5a3b662f41a57925269`

---

## 1. Remediation Sequencing Overview

```
  ┌─────────────────────────────────────────────────────────────┐
  │ PHASE 1: PILOT BLOCKERS (P1 Security & Concurrency)        │
  │ • REM-01: API Rate Limiting on Auth & AI Endpoints          │
  │ • REM-02: Envelope Encryption for Channel Credentials       │
  │ • REM-03: Decouple External LLM Calls from DB Transactions │
  │ • REM-04: Resolve Stripe Webhook RLS Lookup Deadlock       │
  │ • REM-05: Wire Live OpenAI Embedding Provider in Ingestion │
  │ • REM-06: Implement Password Reset & Account Recovery       │
  └──────────────────────────────┬──────────────────────────────┘
                                 │
                                 ▼
  ┌─────────────────────────────────────────────────────────────┐
  │ PHASE 2: CORE FUNCTIONAL & RELIABILITY GAPS (P2)            │
  │ • REM-07: Build Frontend Management UIs (AI, Billing, Team)│
  │ • REM-08: Add Agent Assignment & Priority to Conversations  │
  │ • REM-09: Migrate Rate Limiter & Worker to Redis / BullMQ   │
  │ • REM-10: Escape Customer Prompt XML Framing Tags           │
  │ • REM-11: Implement Health Check & HTTP Security Headers    │
  └──────────────────────────────┬──────────────────────────────┘
                                 │
                                 ▼
  ┌─────────────────────────────────────────────────────────────┐
  │ PHASE 3: LIVE VENDOR INTEGRATIONS (Meta & Stripe)           │
  │ • REM-12: Implement Live Meta WhatsApp Cloud API Client     │
  │ • REM-13: Implement Live Meta Instagram Graph API Client    │
  │ • REM-14: Integrate Stripe SDK for Checkout & Customer     │
  │           Billing Portal Sessions                           │
  └─────────────────────────────────────────────────────────────┘
```

---

## 2. Phase 1 — Critical Pilot Blockers (P1 Severity)

### REM-01: Implement Distributed Rate Limiting on Core Auth & AI Endpoints
- **Finding Reference:** `FINDING-01`
- **Severity:** **P1**
- **Files Affected:** `apps/api/src/auth/auth.controller.ts`, `apps/api/src/ai/ai.controller.ts`, `apps/api/src/app.module.ts`
- **What is Wrong:** `/api/auth/login`, `/api/auth/register`, and `/api/ai/conversations/:id/suggest` have zero rate limiting. Attackers can brute-force passwords, flood registrations, or exhaust OpenAI token budgets with infinite requests.
- **Dependencies:** Redis connection (`REDIS_URL`).
- **Implementation Specification:**
  1. Register `@nestjs/throttler` with `ThrottlerStorageRedisService`.
  2. Apply `@Throttle({ default: { limit: 5, ttl: 60000 } })` to `/api/auth/login`.
  3. Apply `@Throttle({ default: { limit: 3, ttl: 3600000 } })` to `/api/auth/register`.
  4. Apply `@Throttle({ default: { limit: 10, ttl: 60000 } })` to `/api/ai/*`.
- **Acceptance Criteria:**
  - Exceeding 5 failed login attempts in 1 minute returns `429 Too Many Requests`.
  - Rate limit counters persist in Redis across application restarts and cluster instances.
- **Required Regression Test:** `tests/integration/auth-ratelimit.spec.ts` sending 6 concurrent login attempts and asserting the 6th receives HTTP 429.

---

### REM-02: Application-Level Envelope Encryption for Channel Credentials
- **Finding Reference:** `FINDING-02`
- **Severity:** **P1**
- **Files Affected:** `apps/api/src/channels/channels.service.ts`, `packages/config/src/index.ts`
- **What is Wrong:** Meta system user tokens, WhatsApp phone IDs, and Instagram credentials in `Channel.config` are stored in plaintext JSONB in PostgreSQL. Database compromise or SQL inspection exposes live customer communication channels.
- **Dependencies:** New `ENCRYPTION_KEY` (32 bytes hex) in `@orbit/config`.
- **Implementation Specification:**
  1. Add `ENCRYPTION_KEY` to `envSchema` in `@orbit/config`.
  2. Implement `EncryptionService` in `@orbit/integrations` using `aes-256-gcm` with authenticated ciphertext format: `enc:v1:<iv>:<authTag>:<ciphertext>`.
  3. Encrypt sensitive fields (`accessToken`, `clientSecret`) before writing to `channels.config`.
  4. Decrypt in memory only when establishing channel client sessions.
- **Acceptance Criteria:**
  - Raw database inspect on `channels.config` shows encrypted ciphertext.
  - Decryption with an invalid key throws a cryptographic integrity error.
- **Required Regression Test:** `tests/unit/credentials-encryption.spec.ts` asserting plaintext never appears in database queries.

---

### REM-03: Decouple External LLM Provider Calls from PostgreSQL Transactions
- **Finding Reference:** `FINDING-03`
- **Severity:** **P1**
- **Files Affected:** `apps/api/src/ai/ai.service.ts`
- **What is Wrong:** `provider.generateResponse()` is invoked inside `this.tenantRunner.runWithTenant(...)` (lines 296–302). A 15-second OpenAI completion holds a PostgreSQL connection pool slot and database locks open. Furthermore, if OpenAI throws an error (429/timeout), the database transaction rolls back, destroying the `aiRequest` and preventing durable audit logging of provider failures.
- **Dependencies:** None.
- **Implementation Specification:**
  1. Split `generateSuggestion` into three sequential phases:
     - **Phase 1 (Pre-flight Transaction):** In tenant transaction, verify human takeover, resolve active config and pricing, count knowledge docs, search similar chunks, create `aiRequest` with status `PENDING`, and commit.
     - **Phase 2 (Out-of-Transaction Provider Execution):** Outside any database transaction, execute `provider.generateResponse()`. Wrap in `try/catch`.
     - **Phase 3 (Post-flight Transaction):** In a second tenant transaction:
       - On success: validate citations, record `aiRequestAttempt` (status: `SUCCESS`), record `aiUsageEvent`, update `aiRequest` (status: `COMPLETED`).
       - On failure: record `aiRequestAttempt` (status: `FAILED`, error details), update `aiRequest` (status: `FAILED`).
- **Acceptance Criteria:**
  - No database transaction remains open while waiting for external OpenAI HTTP responses.
  - If OpenAI throws a network error, `ai_request_attempts` durably records the failure with provider error details.
- **Required Regression Test:** `tests/integration/ai-resilience.spec.ts` mocking provider timeout and verifying durable failure record in PostgreSQL.

---

### REM-04: Resolve Stripe Webhook RLS Lookup Deadlock via Security-Definer Function
- **Finding Reference:** `FINDING-04`
- **Severity:** **P1**
- **Files Affected:** `apps/api/src/webhooks/stripe-ingestion.service.ts`, PostgreSQL migrations.
- **What is Wrong:** When an inbound Stripe webhook lacks `metadata.organization_id`, `stripe-ingestion.service.ts:55` queries `this.prisma.subscription.findFirst(...)` as `orbit_app`. Because `subscriptions` enforces `FORCE ROW LEVEL SECURITY` and no tenant context is established, PostgreSQL silently returns 0 rows, dropping valid Stripe lifecycle webhooks.
- **Dependencies:** PostgreSQL migration.
- **Implementation Specification:**
  1. Create a migration adding security-definer function:
     ```sql
     CREATE OR REPLACE FUNCTION resolve_stripe_subscription_organization(
       p_stripe_subscription_id VARCHAR,
       p_stripe_customer_id VARCHAR
     )
     RETURNS UUID
     LANGUAGE plpgsql
     SECURITY DEFINER
     SET search_path = public
     AS $$
     DECLARE
       v_org_id UUID;
     BEGIN
       SELECT organization_id INTO v_org_id
       FROM subscriptions
       WHERE (p_stripe_subscription_id IS NOT NULL AND stripe_subscription_id = p_stripe_subscription_id)
          OR (p_stripe_customer_id IS NOT NULL AND stripe_customer_id = p_stripe_customer_id)
       LIMIT 1;
       RETURN v_org_id;
     END;
     $$;
     GRANT EXECUTE ON FUNCTION resolve_stripe_subscription_organization TO orbit_ingress, orbit_app;
     ```
  2. Update `stripe-ingestion.service.ts` to call `resolve_stripe_subscription_organization` via `IngressDatabaseService`.
- **Acceptance Criteria:**
  - Inbound `customer.subscription.updated` events without `metadata.organization_id` successfully resolve tenant organization and update subscription state.
- **Required Regression Test:** `tests/integration/stripe-rls-resolution.spec.ts` sending payload with only `id: 'sub_123'` and asserting successful subscription synchronization.

---

### REM-05: Wire Live OpenAI Embedding Provider in Knowledge Service
- **Finding Reference:** `FINDING-05`
- **Severity:** **P1**
- **Files Affected:** `apps/api/src/knowledge/knowledge.service.ts`, `packages/config/src/index.ts`
- **What is Wrong:** `KnowledgeService` constructor hardcodes `new MockEmbeddingProvider(1536)`. It never instantiates `OpenAiEmbeddingProvider`, forcing all knowledge documents to use synthetic embeddings. Additionally, `OpenAiEmbeddingProvider` contains a silent fallback to mock mode instead of failing closed when keys are missing.
- **Dependencies:** `OPENAI_API_KEY` in `@orbit/config`.
- **Implementation Specification:**
  1. Add `OPENAI_API_KEY: z.string().optional()` to `@orbit/config`.
  2. Update `OpenAiEmbeddingProvider` to remove silent fallback: throw `ConfigurationError` if key is missing when OpenAI provider is selected.
  3. In `KnowledgeService` constructor or NestJS factory, initialize `OpenAiEmbeddingProvider(config.OPENAI_API_KEY)` when `NODE_ENV === 'production'` or `OPENAI_API_KEY` is present.
- **Acceptance Criteria:**
  - Ingestion computes real 1536-dimensional embeddings when `OPENAI_API_KEY` is set.
  - Missing key when OpenAI is selected fails closed with a clear error.
- **Required Regression Test:** `tests/integration/knowledge-provider-selection.spec.ts`.

---

### REM-06: Implement Password Reset & Secure Account Recovery
- **Finding Reference:** `FINDING-06`
- **Severity:** **P1**
- **Files Affected:** `apps/api/src/auth/auth.controller.ts`, `apps/api/src/auth/auth.service.ts`, Prisma schema, `apps/web/src/pages/`
- **What is Wrong:** There is no mechanism for users to recover accounts or reset forgotten passwords.
- **Dependencies:** Email service abstraction (e.g. Resend / SendGrid / SMTP).
- **Implementation Specification:**
  1. Add `PasswordResetToken` model to `schema.prisma`:
     - `id`, `userId`, `tokenHash` (SHA-256), `expiresAt` (15 minutes), `usedAt`.
  2. Endpoints:
     - `POST /api/auth/forgot-password`: Generates random 32-byte token, stores hash, dispatches email (or logs in dev). Always returns 200 OK to prevent email enumeration.
     - `POST /api/auth/reset-password`: Validates token, hashes new password with Argon2id, invalidates all existing sessions in `user_sessions`, and marks token used.
  3. Frontend: `ForgotPasswordPage.tsx` and `ResetPasswordPage.tsx` in `apps/web`.
- **Acceptance Criteria:**
  - Resetting password invalidates all existing active sessions.
  - Expired or reused tokens are rejected with HTTP 400.
- **Required Regression Test:** `tests/integration/password-reset.spec.ts`.

---

## 3. Phase 2 — Core Functional & Operational Gaps (P2 Severity)

### REM-07: Build Frontend Management Dashboards (AI, Billing, Team)
- **Finding Reference:** `FINDING-07`
- **Severity:** **P2**
- **Files Affected:** `apps/web/src/pages/`, `apps/web/src/components/Navbar.tsx`
- **Implementation Specification:**
  1. **AI Configuration Page (`apps/web/src/pages/AiSettingsPage.tsx`):**
     - Form to edit system instructions and policy rules.
     - Model selector (`gpt-4o-mini`, `gpt-4o`) and temperature slider.
     - Draft -> Test -> Approve -> Activate workflow controls.
  2. **Billing & Subscription Page (`apps/web/src/pages/BillingPage.tsx`):**
     - Displays current tier (`FREE`, `STARTER`, `PRO`), renewal date, seat usage, and AI token usage bar.
  3. **Team Members Page (`apps/web/src/pages/TeamPage.tsx`):**
     - Member table with role badges (`OWNER`, `ADMIN`, `MEMBER`).
     - Invite modal with email and role selection.
- **Acceptance Criteria:**
  - Registered business owners can configure their AI assistant, view billing quotas, and invite teammates without using Postman or raw SQL.

---

### REM-08: Add Agent Assignment & Priority Controls to Conversations
- **Finding Reference:** `FINDING-08`
- **Severity:** **P2**
- **Files Affected:** `prisma/schema.prisma`, `apps/api/src/conversations/`, `apps/web/src/pages/InboxPage.tsx`
- **Implementation Specification:**
  1. Add `assignedToUserId` (UUID nullable) and `priority` (`LOW`, `MEDIUM`, `URGENT` default `MEDIUM`) to `Conversation` model in Prisma.
  2. Add `PATCH /api/conversations/:id/assign` and `PATCH /api/conversations/:id/priority` in `ConversationsController`.
  3. Update `InboxPage.tsx` with assignment dropdown (listing active organization members) and priority selector.
  4. Emit WebSocket events `conversation:assigned` and `conversation:priority_changed`.
- **Acceptance Criteria:**
  - Agents can filter inbox by assigned agent and priority level.

---

### REM-09: Connect Background Worker and Rate Limiting to Redis & BullMQ
- **Finding Reference:** `FINDING-09`
- **Severity:** **P2**
- **Files Affected:** `apps/worker/src/index.ts`, `apps/api/src/widget/widget.service.ts`, `docker-compose.yml`
- **Implementation Specification:**
  1. Add `bullmq` and `ioredis` to `@orbit/worker` and `@orbit/api`.
  2. Replace in-memory `Set` in `OrbitWorkerProcessor` with BullMQ `Worker` connected to `REDIS_URL`.
  3. Migrate `WidgetService.checkRateLimit` to Redis atomic sliding window (`INCR` + `EXPIRE`).
  4. Add worker service definition to `docker-compose.yml`.
- **Acceptance Criteria:**
  - Background jobs survive API process restarts and execute with distributed locks.
  - Rate limits are enforced uniformly across multiple API replicas.

---

### REM-10: Escape Customer Prompt XML Framing Tags
- **Finding Reference:** `FINDING-10`
- **Severity:** **P2**
- **Files Affected:** `apps/api/src/ai/ai.service.ts`
- **Implementation Specification:**
  1. Sanitize customer message content before XML wrapping:
     ```typescript
     function escapeXmlTags(content: string): string {
       return content
         .replace(/<\/customer_message>/gi, '[escaped_tag]')
         .replace(/<verified_knowledge>/gi, '[escaped_tag]')
         .replace(/<\/verified_knowledge>/gi, '[escaped_tag]');
     }
     ```
- **Acceptance Criteria:**
  - Customer messages containing `</customer_message>` cannot close the framing context.

---

### REM-11: Add Production Health Checks & HTTP Security Headers
- **Finding Reference:** `FINDING-11`
- **Severity:** **P2**
- **Files Affected:** `apps/api/src/app.config.ts`, `apps/api/src/health/health.controller.ts`
- **Implementation Specification:**
  1. Add `helmet` in `configureApp`:
     - Configure CSP, HSTS, `nosniff`, `no-referrer`, `frameguard`.
  2. Implement `HealthController` with `GET /health` checking PostgreSQL and Redis connectivity.
- **Acceptance Criteria:**
  - `GET /health` returns `{ status: 'ok', database: 'up', redis: 'up' }`.
  - HTTP responses include `X-Content-Type-Options: nosniff`.

---

## 4. Phase 3 — Live Vendor Integrations (Production Prerequisites)

### REM-12: Implement Live Meta WhatsApp Cloud API Client
- **Finding Reference:** `FINDING-12`
- **Files Affected:** `packages/integrations/src/whatsapp/whatsapp.adapter.ts`
- **Implementation Specification:**
  1. Implement `WhatsAppAdapter` sending HTTP POST to `https://graph.facebook.com/v20.0/{phoneNumberId}/messages`.
  2. Include `Authorization: Bearer {channelAccessToken}`.
  3. Handle rate limits (HTTP 429) with exponential backoff.
- **Acceptance Criteria:**
  - Agent reply in `InboxPage.tsx` successfully delivers real WhatsApp message to customer phone.

---

### REM-13: Implement Live Meta Instagram Graph API Client
- **Finding Reference:** `FINDING-13`
- **Files Affected:** `packages/integrations/src/instagram/instagram.adapter.ts`
- **Implementation Specification:**
  1. Implement `InstagramAdapter` sending HTTP POST to `https://graph.facebook.com/v20.0/{pageId}/messages` targeting `recipient: { id: igsid }`.
- **Acceptance Criteria:**
  - Agent reply in `InboxPage.tsx` successfully delivers real Instagram DM.

---

### REM-14: Integrate Stripe SDK for Checkout & Customer Billing Portal
- **Finding Reference:** `FINDING-14`
- **Files Affected:** `apps/api/src/billing/billing.controller.ts`, `apps/api/src/billing/billing.service.ts`
- **Implementation Specification:**
  1. Install `stripe` package in `@orbit/api`.
  2. Endpoint `POST /api/billing/checkout-session`: creates Stripe Checkout Session for plan upgrade.
  3. Endpoint `POST /api/billing/portal-session`: creates Stripe Customer Portal Session for card management and cancellation.
- **Acceptance Criteria:**
  - Clicking "Upgrade to Pro" redirects to hosted Stripe Checkout and provisions tier upon webhook confirmation.
