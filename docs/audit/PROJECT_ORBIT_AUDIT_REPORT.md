# Project Orbit — Comprehensive Engineering, Security & Product Readiness Audit Report
## Definitive Architectural Assessment, Multi-Tenant Boundary Review & Pilot Readiness Evaluation

**Document ID:** `AUDIT-REPORT-20261119-01`  
**Execution Date:** `2026-11-19`  
**Governance Runtime:** `Gravitas Core Skill Mode (6 Invariants Enforced)`  
**Repository:** `https://github.com/HarshParyani33/orbit`  
**Working Branch:** `main`  
**Commit SHA:** `6a04803b0ec37301b46ec5a3b662f41a57925269`  
**Auditor:** Principal Security & Software Architecture Reviewer (Antigravity Agent)

---

## 1. Executive Summary & Verdict

### Is Project Orbit Ready for a Real Customer Pilot?
**Verdict:** **`CONDITIONAL — NOT READY FOR UNRESTRICTED PRODUCTION PILOT`**

Project Orbit possesses a **robust, verified architectural foundation** in its core domains:
- PostgreSQL Row-Level Security (RLS) is strictly enforced with `FORCE ROW LEVEL SECURITY` across tenant tables.
- Cross-tab authentication refresh concurrency is rigorously solved using the Web Locks API (`orbit_refresh_token_lock`) with family replay theft revocation and session-epoch isolation.
- Vector retrieval utilizing PostgreSQL 16 `pgvector` with HNSW cosine distance indexing (`vector_cosine_ops`) is implemented with strict multi-tenant isolation.
- AI assistant suggestions utilize deterministic extractive citation and numerical fact verification (`CitationValidator`), preventing hallucinations from reaching users.

However, **six critical P1 blockers and operational deficiencies must be resolved before onboarded businesses can safely pilot the platform**:
1. **Unprotected Core Endpoints & Absence of Distributed Rate Limiting (`FINDING-01`):** `/api/auth/login`, `/api/auth/register`, and `/api/ai/*` have zero rate limiting. Attackers can brute-force passwords, flood registrations, or exhaust OpenAI token budgets with infinite requests.
2. **Plaintext Channel Credentials in Database (`FINDING-02`):** Meta system user tokens, WhatsApp phone IDs, and channel secrets in `channels.config` are stored in unencrypted JSONB in PostgreSQL.
3. **Database Transaction Coupling with External LLM Calls (`FINDING-03`):** `AiService.generateSuggestion` executes external HTTP calls to OpenAI *inside* a PostgreSQL transaction (`this.tenantRunner.runWithTenant`). A 15-second LLM completion holds database connections and locks open; provider timeouts roll back the transaction, destroying all durable failure and billing records.
4. **Stripe Webhook RLS Lookup Deadlock (`FINDING-04`):** When Stripe sends subscription events without `metadata.organization_id`, `StripeIngestionService` queries `subscriptions` as `orbit_app` without an active tenant context. Because `subscriptions` has `FORCE ROW LEVEL SECURITY`, PostgreSQL returns 0 rows, silently dropping valid billing webhooks.
5. **Hardcoded Mock Embeddings & Silent Fallback (`FINDING-05`):** `KnowledgeService` hardcodes `MockEmbeddingProvider(1536)` in its constructor. Live OpenAI embeddings are never wired in production, and `OpenAiEmbeddingProvider` silently falls back to mock mode if keys are missing.
6. **Complete Absence of Password Reset (`FINDING-06`):** Users locked out of accounts have no recovery mechanism.

---

## 2. Repository Baseline & Architecture Discovered

```
  ┌────────────────────────────────────────────────────────────────────────┐
  │                           PROJECT ORBIT                                │
  │                      Modular Monolith Architecture                     │
  └───────────────────────────────────┬────────────────────────────────────┘
                                      │
         ┌────────────────────────────┼────────────────────────────┐
         ▼                            ▼                            ▼
  [APPLICATIONS]                [LIBRARIES]                 [INFRASTRUCTURE]
  • apps/api (NestJS 10)        • packages/shared           • Docker (PostgreSQL 16
  • apps/web (React/Vite)       • packages/validation         with pgvector, Redis 7)
  • apps/widget (Vanilla TS)    • packages/config           • Role Separation
  • apps/worker (Stub/Proc)     • packages/integrations       (orbit_app, orbit_migrator,
                                • packages/ui                 orbit_ingress)
```

- **Runtime Architecture:** NestJS modular monolith (`apps/api`), single-page React frontend with TailwindCSS and TanStack Query (`apps/web`), zero-dependency embeddable chat script (`apps/widget`), and background processor stub (`apps/worker`).
- **Database Engine:** PostgreSQL 16 with `pgvector` extension.
- **ORM & Migrations:** Prisma 5.22 with 7 applied migrations (`20261118000001_initial_schema` through `20261118000007_knowledge_base`).
- **Cache & Queue:** Redis 7 container configured in `docker-compose.yml`, but background worker and widget rate limiters operate via in-memory data structures rather than BullMQ/Redis connections.

---

## 3. Milestone 1–4 Verification Audit

Do not accept documented claims without independent verification:

| Milestone & Scope | Documented Claim | Audit Verification Finding | Actual State |
|---|---|---|:---:|
| **Milestone 1:** Foundation, Security, Multi-Tenant RLS & Web Locks Concurrency | 17/17 CI steps green; Web Locks mutex serializes refresh; RLS isolates tables. | Independently verified. Web Locks mutex, memory fallback, fail-closed missing lock, family token theft revocation, and session epoch guards are genuinely implemented and verified across 18 unit tests and 8 Playwright browser tests. | **VERIFIED** |
| **Milestone 2:** Conversation & Channel Foundation, Agent Inbox, Realtime WebSockets, Customer CRM, AI Assistant Foundation, Website Widget | Complete omnichannel inbox with customer identity, AI assist, automations. | **Partially Verified / Disconnected:** Core inbox, realtime WebSockets, customer identities, and chat widget work end-to-end. However: **agent assignment, conversation priority, internal notes, unread counters, and AI configuration UI do not exist in the codebase**. | **PARTIALLY VERIFIED** |
| **Milestone 3:** Omnichannel Ingress, Transactional Outbox, WhatsApp & Instagram Adapters, Message Media Attachments, Stripe Billing | Outbox event delivery, Meta WhatsApp/IG adapters, Stripe billing. | **Simulated / Mocked:** Webhook signature guards (`MetaSignatureGuard`, `StripeSignatureGuard`) and outbox deduplication are verified. However: **Meta WhatsApp and Instagram outbound dispatch use in-memory mock adapters (`MockWhatsAppAdapter`, `MockInstagramAdapter`) with zero Meta Graph API calls. Stripe SDK is not installed, and Stripe webhook lookup suffers an RLS deadlock**. | **SIMULATED / MOCKED** |
| **Milestone 4:** Knowledge Base Embeddings, pgvector, Vector RAG Pipeline & Multi-Tenant Retrieval | pgvector semantic search, natural boundary chunking, citation validation, KB UI. | **Partially Verified:** pgvector schema, HNSW indexing, chunking engine, citation validator (`CitationValidator`), and frontend KB page are verified. However: **embeddings in production default to `MockEmbeddingProvider` (OpenAI embeddings are not wired to `KnowledgeService`), and PDF/binary file upload does not exist (raw text paste only)**. | **PARTIALLY VERIFIED** |

---

## 4. End-to-End User Journey Audit

Tracing 12 critical user journeys from frontend through backend, database, and background processing:

### Journey 1: Business Registration & Organization Creation
- **Trace:** User visits `RegisterPage.tsx`, inputs name, email, password, and org name. Dispatches `POST /api/auth/register`. `AuthService` executes interactive transaction: creates user (Argon2id hash), creates organization, creates `OWNER` membership, provisions initial session, and sets dual HTTP-only cookies (`access_token`, `refresh_token`).
- **Verdict:** **VERIFIED & WORKING END-TO-END**.

### Journey 2: Business Configures AI Assistant
- **Trace:** User attempts to navigate to an AI settings screen to provide business instructions, policies, and select a model.
- **Finding:** **NO FRONTEND UI EXISTS**. There is no route or page for AI configuration in `apps/web`. The backend endpoints (`POST /api/ai/configurations`, `POST /api/ai/configurations/:id/activate`) exist and work via API calls, but a customer cannot configure the AI assistant in the web application.
- **Verdict:** **INCOMPLETE / DISCONNECTED (BACKEND ONLY)**.

### Journey 3: Business Uploads FAQs & Knowledge
- **Trace:** User opens "Knowledge Base" tab in `Navbar.tsx`, clicks "Add Document", enters title, selects `FAQ`, and enters content. Dispatches `POST /api/knowledge/documents`.
- **Finding:** Form accepts raw text input up to 100,000 characters. Binary document upload (PDF, DOCX, TXT) is **not supported**; users must manually extract and paste text.
- **Verdict:** **VERIFIED FOR RAW TEXT / MISSING FILE PARSING**.

### Journey 4: Knowledge Ingestion & pgvector Indexing
- **Trace:** `KnowledgeService.createDocument` runs `ChunkingEngine.chunkText`, generating ~500-token chunks with 50-token overlap. Computes embeddings and writes to `knowledge_chunks` with `vector(1536)` under RLS.
- **Finding:** Because `KnowledgeService` hardcodes `MockEmbeddingProvider`, synthetic unit vectors are generated. In production, live OpenAI embeddings are never called.
- **Verdict:** **VERIFIED WITH SYNTHETIC MOCK EMBEDDINGS**.

### Journey 5: Website Visitor Opens Widget
- **Trace:** Visitor loads website containing `OrbitChatWidget`. Script checks `localStorage` for existing visitor ID and dispatches `POST /api/widget/session/init`.
- **Finding:** `WidgetService.resolveChannel` executes security-definer function `resolve_widget_channel`, validates allowed domains against Origin header, verifies rate limit (50/min), and issues signed visitor JWT. Floating launcher renders in DOM.
- **Verdict:** **VERIFIED & WORKING END-TO-END**.

### Journey 6: Visitor Sends Message
- **Trace:** Visitor types message and clicks send. Script dispatches `POST /api/widget/message` with Bearer token.
- **Finding:** `WidgetGuard` authenticates visitor. `ConversationsService.createMessage` writes message, updates conversation `updatedAt`, and triggers `RealtimeService.emitMessageCreated`.
- **Verdict:** **VERIFIED & WORKING END-TO-END**.

### Journey 7: Conversation Appears in Agent Inbox
- **Trace:** Agent is viewing `InboxPage.tsx`. WebSocket client is connected to `RealtimeGateway`.
- **Finding:** Gateway receives `message:created` event for active tenant room and invalidates React Query cache. Conversation appears immediately at top of list.
- **Verdict:** **VERIFIED & WORKING END-TO-END**.

### Journey 8: AI Generates Grounded Answer
- **Trace:** Agent selects conversation in `InboxPage.tsx` and clicks "AI Assist". Dispatches `POST /api/ai/conversations/:id/suggest`.
- **Finding:** If no AI configuration was pre-seeded via API, request fails with `BadRequestException: No active AI configuration found for this organization`. If configured: retrieves similar chunks via pgvector, injects `<verified_knowledge>`, validates citations via `CitationValidator`, and returns drafted suggestion.
- **Verdict:** **PARTIALLY VERIFIED (FAILS FOR NEW ORGS WITHOUT API-SEEDED CONFIG)**.

### Journey 9: Agent Takes Over & Replies
- **Trace:** Agent edits drafted suggestion in `InboxPage.tsx` and clicks "Send Reply". Dispatches `POST /api/conversations/:id/messages` (`senderType: AGENT`).
- **Finding:** Message is saved, conversation `updatedAt` is updated, and WebSocket broadcast fires. Chat widget polls update within 4 seconds and displays agent response.
- **Verdict:** **VERIFIED & WORKING END-TO-END**.

### Journey 10: Conversation is Resolved
- **Trace:** Agent changes status dropdown in `InboxPage.tsx` from `OPEN` to `RESOLVED`.
- **Finding:** Calls `PATCH /api/conversations/:id/status`. Triggers `RealtimeService.emitConversationStatusChanged` and evaluates automations (`CONVERSATION_RESOLVED`). If customer replies subsequently, thread auto-reopens to `OPEN`.
- **Verdict:** **VERIFIED & WORKING END-TO-END**.

### Journey 11: Analytics Reflect Conversation
- **Trace:** Platform calculates message volume, status distribution, and First Response Time (FRT).
- **Finding:** `AnalyticsService` computes accurate aggregations in backend tests. However, **no analytics dashboard or chart component exists in `apps/web`**.
- **Verdict:** **BACKEND ONLY / NO USER INTERFACE**.

### Journey 12: Business Views Usage & Billing
- **Trace:** Business owner checks plan limits and AI token usage.
- **Finding:** `BillingController` has `GET /api/billing/subscription`. However, **no billing page or subscription management view exists in `apps/web`**.
- **Verdict:** **BACKEND ONLY / NO USER INTERFACE**.

---

## 5. Security & Multi-Tenant Boundary Review

### 5.1 Row-Level Security (RLS) Enforcement
- **Posture:** **STRONG**. 12 business tables have `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`.
- **Tenant Context:** Established via `SET LOCAL app.current_org_id` in `TenantTransactionRunner.runWithTenant(organizationId)`.
- **Fail-Closed Behavior:** Verified. Queries on unauthenticated connections evaluate `organization_id = NULLIF('', '')::UUID` which returns 0 rows on SELECT and throws a policy check error on INSERT/UPDATE.

### 5.2 Direct Prisma Access Patterns
- All tenant-scoped domain queries execute inside `this.tenantRunner.runWithTenant(...)`.
- The only direct `this.prisma` calls occur on global tables (`users`, `user_sessions`, `organizations`, `organization_memberships`) or inside security-definer helpers, with one critical defect: `StripeIngestionService:55` attempts a direct query on `subscriptions`, which hits the RLS wall and fails closed.

### 5.3 Web Locks & Cross-Tab Security
- Verified in Playwright Chromium browser tests. Multiple tabs attempting simultaneous refresh serialize to exactly 1 network call.
- If an access token expires while another tab has refreshed, the sibling tab reuses ambient cookies without rotating.
- Replaying an expired refresh token revokes all sibling sessions in the token family.
- Missing Web Locks fails closed safely.

### 5.4 Injection Defenses
- **SQL Injection:** Zero dynamic string concatenations into SQL queries. Raw vector queries use parameterized `${vectorStr}::vector` bindings.
- **Prompt Injection:** Customer messages are wrapped in `<customer_message>`. However, unescaped `</customer_message>` tags in customer messages can break out of the framing context.

---

## 6. Mock vs. Real Integration Inventory

| External Integration | Target Provider | Implementation Status | Real API Calls Implemented? | Production Ready? |
|---|---|:---:|:---:|:---:|
| **LLM Completions** | OpenAI (`gpt-4o-mini`) | Partial Adapter (`OpenAiProvider`) | Yes (`fetch` to `api.openai.com`) | Conditional (Needs Key) |
| **Vector Embeddings** | OpenAI (`text-embedding-3-small`) | Mock / Staged Adapter | Yes in adapter, but unused by `KnowledgeService` | **No** (Defaults to Mock) |
| **WhatsApp Messaging** | Meta WhatsApp Cloud API | Mock Adapter (`MockWhatsAppAdapter`) | **No** (In-memory array only) | **No** (Requires Graph API) |
| **Instagram Messaging** | Meta Instagram Graph API | Mock Adapter (`MockInstagramAdapter`) | **No** (In-memory array only) | **No** (Requires Graph API) |
| **Payment & Billing** | Stripe | Webhook Ingestion & Signature Guard | **No** (`stripe` SDK not installed) | **No** (Requires Checkout) |
| **Object Storage** | AWS S3 / Cloudflare R2 | Local Disk Adapter (`DiskStorageProvider`) | **No** (Local filesystem only) | **No** (Requires S3 Adapter) |
| **Background Queue** | Redis / BullMQ | In-Memory Stub (`OrbitWorkerProcessor`) | **No** (Local in-memory `Set`) | **No** (Requires BullMQ) |

---

## 7. Test Execution Results & Verification Ledger

### 7.1 Local Session Execution
- **TypeScript Typecheck (`tsc --build`):** **Exit Code 0** (All 9 workspaces clean).
- **ESLint Code Quality (`eslint .`):** **Exit Code 0** (Zero errors/warnings).
- **Production Build (`npm run build`):** **Exit Code 0** (Vite SPA and all 9 packages compiled successfully).
- **Unit Tests (`vitest run tests/unit`):** **41 / 41 passed** across 5 test files:
  - `tests/unit/cross-tab-refresh.spec.ts` (18 passed)
  - `tests/unit/client-refresh.spec.ts` (6 passed)
  - `tests/unit/knowledge-client.spec.ts` (6 passed)
  - `tests/unit/config-jwt.spec.ts` (8 passed)
  - `tests/integration/bootstrap.spec.ts` (3 passed)
- **Local Integration Tests:** **Blocked** due to host Docker Desktop daemon being offline during this audit session (`Can't reach database server at 172.28.46.91:5432`).

### 7.2 Authoritative CI Pipeline Verification (GitHub Actions)
On commit `6a04803` and previous commit `3f24546`, all 17 CI steps executed against live PostgreSQL 16 and Redis service containers:
- **CI Run #44349163259:** **SUCCESS** across all 17 workflow steps.
- **CI Run #44348456990:** **SUCCESS** (300 / 300 tests passing across 27 test files).

---

## 8. Prioritized Audit Findings

### FINDING-01 (P1): Unprotected Authentication & AI Endpoints (Missing Rate Limiting)
- **Files:** `apps/api/src/auth/auth.controller.ts`, `apps/api/src/ai/ai.controller.ts`
- **Issue:** No rate limiting on login, registration, or AI generation endpoints.
- **Impact:** Brute-force credential stuffing, spam registration, and financial DoS via unlimited OpenAI generation requests.
- **Evidence:** Inspection of `apps/api/src/app.config.ts` confirms absence of `@nestjs/throttler` or global rate limiter.

### FINDING-02 (P1): Plaintext Channel Credentials in Database
- **Files:** `apps/api/src/channels/channels.service.ts`, `prisma/schema.prisma:103`
- **Issue:** `Channel.config` stores third-party API tokens and secrets in unencrypted JSONB.
- **Impact:** Any database dump or read-access vulnerability exposes customer Meta WhatsApp/Instagram access tokens.
- **Evidence:** `channels.service.ts` writes raw configuration directly to `tx.channel.create({ data: { config: ... } })`.

### FINDING-03 (P1): External LLM Calls Inside PostgreSQL Transactions
- **Files:** `apps/api/src/ai/ai.service.ts:296-302`
- **Issue:** `provider.generateResponse()` is executed inside `this.tenantRunner.runWithTenant(...)`.
- **Impact:** DB transaction is held open for 15+ seconds during LLM generation. Provider timeouts roll back the transaction, deleting the `aiRequest` attempt and preventing durable failure logging.
- **Evidence:** Lines 296–302 inside transaction callback.

### FINDING-04 (P1): Stripe Webhook RLS Lookup Deadlock
- **Files:** `apps/api/src/webhooks/stripe-ingestion.service.ts:55`
- **Issue:** Direct Prisma query on `subscriptions` without active tenant context.
- **Impact:** Inbound Stripe webhooks without `metadata.organization_id` return 0 rows under RLS, dropping subscription lifecycle events.
- **Evidence:** `subscriptions` table has `FORCE ROW LEVEL SECURITY`. Query has no `SET LOCAL app.current_org_id`.

### FINDING-05 (P1): Hardcoded Mock Embedding Provider & Silent Fallback
- **Files:** `apps/api/src/knowledge/knowledge.service.ts:74`, `packages/integrations/src/embeddings/openai-embedding.provider.ts:24`
- **Issue:** `KnowledgeService` hardcodes `MockEmbeddingProvider(1536)` in constructor. `OpenAiEmbeddingProvider` silently falls back to mock mode if keys are missing.
- **Impact:** Real business knowledge is indexed with synthetic fake vectors without operator notification.
- **Evidence:** Constructor initialization at line 74.

### FINDING-06 (P1): Complete Absence of Password Reset & Account Recovery
- **Files:** `apps/api/src/auth/`
- **Issue:** Zero password reset endpoints, tokens, or email workflows exist.
- **Impact:** Users who forget passwords are permanently locked out without administrator database intervention.
- **Evidence:** Grep for `reset_password` or `forgot_password` returns 0 results in `apps/api`.

---

## 9. What Cannot Be Verified / Disclosures

In adherence to Gravitas Invariant 6 (*Say what cannot be verified*):
1. **Live Meta WhatsApp / Instagram Outbound Delivery:** Cannot be verified because outbound adapters are mocks (`MockWhatsAppAdapter`, `MockInstagramAdapter`). Real delivery requires Meta Developer App credentials and verified phone numbers.
2. **Live Stripe Payment Processing:** Cannot be verified because the `stripe` SDK is not installed and no live Stripe API keys are configured.
3. **Live OpenAI Production Completions:** Unit and integration tests run against `MockAiProvider` and `MockEmbeddingProvider`. Verified with mock vectors; live completions require a paid OpenAI key.
4. **Local Host Database Integration Tests:** Cannot be executed in this local session due to Docker Desktop being stopped on the host. Verified authoritative evidence is provided by GitHub Actions CI Run #44349163259.
5. **Multi-Node Cluster Replication:** pgvector RLS was tested on a single PostgreSQL instance. Cross-region or multi-node replication behavior is unverified.

---

## 10. Final Assessment & Next Steps

Project Orbit is an **exceptionally well-engineered foundation** with industry-grade multi-tenant RLS, concurrency-safe Web Locks authentication, and rigorous AI grounding verification.

To advance from the current prototype stage to a **genuine customer pilot**, the engineering team must follow the prioritized plan in [`docs/audit/REMEDIATION_ROADMAP.md`](file:///h:/orbit-saas/docs/audit/REMEDIATION_ROADMAP.md):
1. Execute **Phase 1 Remediation Tasks** (`REM-01` through `REM-06`) to close critical security and concurrency vulnerabilities.
2. Implement **Phase 2 UI and Operational Features** (`REM-07` through `REM-11`) to make the web app self-serve for business owners.
3. Wire **Phase 3 Live Provider Adapters** (`REM-12` through `REM-14`) for real Meta and Stripe connectivity.
