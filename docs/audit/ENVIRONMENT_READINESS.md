# Project Orbit — Environment & Configuration Readiness Audit
## Comprehensive Configuration Audit, Secret Analysis & Infrastructure Guide

**Document ID:** `AUDIT-ENV-20261119-01`  
**Execution Date:** `2026-11-19`  
**Governance Runtime:** `Gravitas Core Skill Mode`  
**Target Repository:** `HarshParyani33/orbit`  
**Working Branch:** `main` (Commit `6a04803b0ec37301b46ec5a3b662f41a57925269`)

---

## 1. Executive Summary & Configuration Posture

Project Orbit's environment architecture is governed by `@orbit/config` (`packages/config/src/index.ts`) utilizing Zod schemas for startup validation, fail-fast production guards, and cryptographic key length checks.

However, an in-depth audit of the configuration layer reveals **four critical operational and security anomalies**:
1. **Unregistered External Provider Keys (`OPENAI_API_KEY`):** The primary AI provider key (`OPENAI_API_KEY`) is read directly via `process.env.OPENAI_API_KEY` in `apps/api/src/ai/ai.service.ts` and `packages/integrations/src/ai/openai-provider.ts`, but is **completely omitted from `envSchema`** in `@orbit/config`. Consequently, invalid or missing OpenAI keys are not validated at startup and do not trigger a fail-fast error.
2. **Silent Insecure Fallback in Embeddings:** `OpenAiEmbeddingProvider` (`packages/integrations/src/embeddings/openai-embedding.provider.ts:24`) contains logic that silently falls back to `MockEmbeddingProvider` if `apiKey` is empty or unset (`if (!this.apiKey || this.apiKey === 'mock-key') return this.fallbackMock...`). In production, this can cause real customer knowledge embeddings to be indexed with deterministic fake vectors without operator notification.
3. **Hardcoded Mock Provider in Knowledge Service:** In `KnowledgeService` (`apps/api/src/knowledge/knowledge.service.ts:74`), the constructor explicitly initializes `this.embeddingProvider = new MockEmbeddingProvider(1536)`. It is never wired to `OpenAiEmbeddingProvider` in NestJS dependency injection, regardless of what environment variables are supplied.
4. **Ingress Role Fallback:** When `INGRESS_DATABASE_URL` is omitted, `IngressDatabaseService` falls back to `DATABASE_URL` (`apps/api/src/webhooks/ingress-database.service.ts:18`), collapsing the intended three-tier least-privilege PostgreSQL role separation (`orbit_ingress` vs `orbit_app`).

---

## 2. Exhaustive Environment Variable Inventory

| Environment Variable | Target Application(s) | Purpose | Required / Optional | Environments Needed | Current State & Default Behavior | Secret Exposure Risk |
|---|---|---|:---:|:---:|---|:---:|
| `NODE_ENV` | All Workspaces | Runtime mode selector (`development`, `test`, `production`) | Required | Dev, Test, Staging, Prod | Defaults to `development`. Enforces strict secret length in `production`. | None |
| `PORT` | `@orbit/api` | API HTTP listener port | Optional | Dev, Staging, Prod | Defaults to `4000`. Sole authoritative port source. | None |
| `FRONTEND_URL` | `@orbit/api` | Whitelisted CORS origin for dashboard | Required | Dev, Staging, Prod | Defaults to `http://localhost:5173`. Used by CORS and CSRF guards. | None |
| `POSTGRES_PASSWORD` | Docker Compose / Database | PostgreSQL container superuser password | Required | Dev, Docker Staging | **Required** in `docker-compose.yml:11` (`:?`). No default permitted. | High (Superuser) |
| `ORBIT_APP_PASSWORD` | Docker / API | Password for `orbit_app` runtime role (DML only, NOBYPASSRLS) | Required in Prod | Dev, Staging, Prod | Dev default: `orbit_app_pass`. In production, must be strong random secret. | High (DML access) |
| `ORBIT_MIGRATOR_PASSWORD` | Docker / Migrations | Password for `orbit_migrator` DDL role (BYPASSRLS) | Required in Prod | Dev, Staging, Prod | Dev default: `orbit_migrator_pass`. Used exclusively for migrations. | Critical (DDL owner) |
| `ORBIT_INGRESS_PASSWORD` | Docker / Ingress | Password for `orbit_ingress` pre-tenant role (0 table grants) | Required in Prod | Dev, Staging, Prod | Dev default: `orbit_ingress_pass`. Executes security-definer lookup. | Medium (Ingress lookup) |
| `DATABASE_URL` | `@orbit/api`, `@orbit/worker` | PostgreSQL connection string for application runtime (`orbit_app`) | **Required** | Dev, Test, Staging, Prod | Formatted as `postgresql://orbit_app:...@host:5432/orbit_db?schema=public`. | High |
| `MIGRATION_DATABASE_URL` | Prisma Migrations | PostgreSQL connection string for DDL owner (`orbit_migrator`) | Optional | Dev, CI, Staging, Prod | Formatted as `postgresql://orbit_migrator:...@host:5432/orbit_db?schema=public`. | Critical |
| `INGRESS_DATABASE_URL` | `@orbit/api` (Webhooks) | PostgreSQL connection string for pre-tenant routing (`orbit_ingress`) | Optional | Staging, Prod | Defaults to `DATABASE_URL` if omitted. Should connect as `orbit_ingress`. | Medium |
| `REDIS_URL` | `@orbit/api`, `@orbit/worker` | Redis cache and queue connection string | Optional | Dev, Test, Staging, Prod | Defaults to `redis://localhost:6379`. | Medium |
| `JWT_SECRET` | `@orbit/api`, `@orbit/web` | Cryptographic secret for signing access tokens | Required in Prod | Dev, Test, Staging, Prod | Dev default assigned if omitted in non-prod. In prod, must be >= 32 chars and not match dev list. | Critical |
| `COOKIE_SECRET` | `@orbit/api` | Secret for signed HTTP-only cookies (`cookie-parser`) | Required in Prod | Dev, Test, Staging, Prod | Dev default assigned in non-prod. In prod, must be >= 32 chars. | Critical |
| `WIDGET_JWT_SECRET` | `@orbit/api`, `@orbit/widget` | Secret for signing chat widget visitor sessions | Optional | Dev, Staging, Prod | Defaults to `JWT_SECRET` if unset. In prod, >= 32 chars if set. | High |
| `OPENAI_API_KEY` | `@orbit/api`, `@orbit/integrations` | OpenAI API authentication key (`sk-...`) | **Conditionally Required** | Staging, Prod | **MISSING FROM CONFIG SCHEMA**. Read directly from `process.env`. | Critical (Billing/API) |
| `META_APP_SECRET` | `@orbit/api` | App secret for Meta WhatsApp/Instagram webhook HMAC verification | Required for Meta | Staging, Prod | In dev/test: defaults to `dev_meta_app_secret_32_characters_long`. In prod, >= 16 chars. | High |
| `META_WEBHOOK_VERIFY_TOKEN` | `@orbit/api` | Challenge handshake verification token (`hub.verify_token`) | Required for Meta | Staging, Prod | In dev/test: defaults to `dev_meta_verify_token`. | Medium |
| `STRIPE_WEBHOOK_SECRET` | `@orbit/api` | Stripe webhook signing secret (`whsec_...`) | Required for Stripe | Staging, Prod | In dev/test: defaults to `whsec_test_secret_32_characters_minimum_testing`. | High |
| `STORAGE_BASE_DIR` | `@orbit/api` | Local filesystem directory for message attachments | Optional | Dev, Test, Staging | Defaults to `./uploads` relative to project root. | Low |

---

## 3. Required External Accounts & Credentials for Production Pilot

Before a real business can pilot Orbit with external communication and live AI:

### Tier 1: Core AI & Grounding
1. **OpenAI Platform Account:**
   - Account with active payment method and API credit quota.
   - API Key (`sk-proj-...`) with access to `gpt-4o-mini` and `text-embedding-3-small`.
   - Setup order: **Step 1** (Essential for AI Assistant and pgvector Knowledge Base).

### Tier 2: Meta Cloud API (WhatsApp & Instagram)
2. **Meta for Developers Account & Business Manager:**
   - Verified Meta Business Account.
   - Registered Meta App (Type: *Business*).
   - WhatsApp Cloud API: Provisioned Phone Number ID and System User Permanent Access Token with `whatsapp_business_messaging` and `whatsapp_business_management`.
   - Instagram Graph API: Connected Facebook Page and Instagram Professional Account with `instagram_basic` and `instagram_manage_messages`.
   - Setup order: **Step 2** (Required for real social messaging ingress/dispatch).

### Tier 3: Stripe Commercial Billing
3. **Stripe Developer Account:**
   - Stripe Account (Test mode initially, then Live).
   - Webhook Endpoint configured pointing to `https://<your-domain>/api/webhooks/stripe` listening for `customer.subscription.*` and `invoice.payment_*`.
   - Webhook Signing Secret (`whsec_...`).
   - Setup order: **Step 3** (Required for automated subscription lifecycle management).

---

## 4. Dangerous Defaults, Fallbacks & Anti-Patterns Detected

> [!WARNING]
> ### 1. Silent Mock Fallback in `OpenAiEmbeddingProvider`
> **File:** `packages/integrations/src/embeddings/openai-embedding.provider.ts:24-26`
> ```typescript
> if (!this.apiKey || this.apiKey.trim() === '' || this.apiKey === 'mock-key') {
>   return this.fallbackMock.generateEmbeddings(texts);
> }
> ```
> If a developer deploys with a misconfigured or missing `OPENAI_API_KEY`, the application **does not fail**. Instead, it silently indexes real business documents with synthetic mock vectors. Searches against these documents using real query embeddings will return zero similarity matches, causing silent RAG breakdown.

> [!WARNING]
> ### 2. Hardcoded Mock Provider in `KnowledgeService`
> **File:** `apps/api/src/knowledge/knowledge.service.ts:74`
> ```typescript
> this.embeddingProvider = new MockEmbeddingProvider(1536);
> ```
> `KnowledgeService` never checks `process.env.OPENAI_API_KEY` or `OpenAiEmbeddingProvider`. It hardcodes `MockEmbeddingProvider(1536)` in its constructor. Without manual code wiring, live OpenAI vector embeddings cannot be used in production.

> [!CAUTION]
> ### 3. Ingress Database Role Collapses to DML Role
> **File:** `apps/api/src/webhooks/ingress-database.service.ts:18`
> ```typescript
> const connStr = config.INGRESS_DATABASE_URL || config.DATABASE_URL;
> ```
> If `INGRESS_DATABASE_URL` is omitted, the webhook ingress service connects to PostgreSQL as `orbit_app` (the standard application role with wide DML permissions), defeating the security boundary intended for `orbit_ingress` (which has 0 table access and only executes the `resolve_channel_routing` function).

> [!NOTE]
> ### 4. Missing `OPENAI_API_KEY` in Configuration Schema
> **File:** `packages/config/src/index.ts:19-42`
> `envSchema` validates `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, and `STRIPE_WEBHOOK_SECRET`, but omits `OPENAI_API_KEY`. It should be added with conditional production enforcement.

---

## 5. Recommended Configuration Sequence

```
  ┌─────────────────────────────────────────────────────────────┐
  │ 1. LOCAL INFRASTRUCTURE                                     │
  │    Configure POSTGRES_PASSWORD, ORBIT_APP_PASSWORD,        │
  │    ORBIT_MIGRATOR_PASSWORD, ORBIT_INGRESS_PASSWORD.         │
  └──────────────────────────────┬──────────────────────────────┘
                                 │
                                 ▼
  ┌─────────────────────────────────────────────────────────────┐
  │ 2. APPLICATION SECRETS                                      │
  │    Generate 32-byte cryptographic random hex for:           │
  │    JWT_SECRET, COOKIE_SECRET, WIDGET_JWT_SECRET.             │
  └──────────────────────────────┬──────────────────────────────┘
                                 │
                                 ▼
  ┌─────────────────────────────────────────────────────────────┐
  │ 3. CORE AI CREDENTIALS                                      │
  │    Obtain OpenAI API Key (sk-proj-...)                      │
  │    Configure OPENAI_API_KEY in .env                         │
  └──────────────────────────────┬──────────────────────────────┘
                                 │
                                 ▼
  ┌─────────────────────────────────────────────────────────────┐
  │ 4. WEBHOOK VERIFICATION SECRETS                             │
  │    Configure META_APP_SECRET & META_WEBHOOK_VERIFY_TOKEN    │
  │    Configure STRIPE_WEBHOOK_SECRET                          │
  └─────────────────────────────────────────────────────────────┘
```

---

## 6. Provider Verification Checklist

### 6.1 Safe Verification of PostgreSQL Role Separation
Run without modifying application code:
```bash
# 1. Verify orbit_app cannot execute DDL
psql "postgresql://orbit_app:orbit_app_pass@127.0.0.1:5432/orbit_db" -c "CREATE TABLE test_table(id INT);"
# Expected output: ERROR: permission denied for schema public

# 2. Verify orbit_ingress cannot query business tables
psql "postgresql://orbit_ingress:orbit_ingress_pass@127.0.0.1:5432/orbit_db" -c "SELECT * FROM users;"
# Expected output: ERROR: permission denied for table users

# 3. Verify orbit_ingress can execute resolve_channel_routing
psql "postgresql://orbit_ingress:orbit_ingress_pass@127.0.0.1:5432/orbit_db" -c "SELECT * FROM resolve_channel_routing('WEB_CHAT', 'test');"
# Expected output: 0 rows (valid query execution)
```

### 6.2 Safe Verification of OpenAI API Key
```bash
# Verify credentials directly without incurring model completion charges
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
# Expected output: 200 OK with model list including gpt-4o-mini and text-embedding-3-small
```

### 6.3 Safe Verification of Meta Webhook Handshake
```bash
curl -i "http://localhost:4000/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=$META_WEBHOOK_VERIFY_TOKEN&hub.challenge=11559955"
# Expected output: HTTP 200 OK with body: 11559955
```

---

## 7. Minimal Setup Checklists

### Minimal Local-Development Setup Checklist
- [ ] Docker Desktop running with PostgreSQL 16 (pgvector) and Redis 7 containers (`docker compose up -d`).
- [ ] Run role provisioning script (`docker/postgres/init-roles.sql`).
- [ ] Copy `.env.example` to `.env`.
- [ ] Run `npx prisma migrate deploy` using `MIGRATION_DATABASE_URL`.
- [ ] Run `npm run db:seed` using `tsx prisma/seed.ts` to populate default tenant (`acme`).
- [ ] Run `npm run dev` to start Vite frontend (5173) and NestJS backend (4000).

### Production Deployment Setup Checklist
- [ ] Generate 32-character cryptographically random secrets for `JWT_SECRET`, `COOKIE_SECRET`, and `WIDGET_JWT_SECRET`.
- [ ] Enforce separate strong passwords for `orbit_app`, `orbit_migrator`, and `orbit_ingress` database roles.
- [ ] Set `NODE_ENV=production` (triggers Zod production validation for weak secrets).
- [ ] Set explicit `FRONTEND_URL` matching the production domain with HTTPS (enforces CORS and secure cookies).
- [ ] Provide valid `OPENAI_API_KEY` for live AI suggestions and vector embeddings.
- [ ] Set `META_APP_SECRET` and `META_WEBHOOK_VERIFY_TOKEN` matching registered Meta App settings.
- [ ] Set `STRIPE_WEBHOOK_SECRET` matching the registered Stripe webhook signing secret.
- [ ] Verify that `INGRESS_DATABASE_URL` connects strictly as `orbit_ingress`.
