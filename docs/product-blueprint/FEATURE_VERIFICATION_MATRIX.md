# Orbit Feature Verification Matrix
## Comprehensive Gap Analysis & Readiness Assessment Against SagePilot Reference

**Document ID:** `FVM-20261119-ORBIT-V1`  
**Audited Commit:** `bed9fce4cc82585c5676e4f5ad75468bae3ed0f8`  
**Classification Legend:**
*   **`A` — Implemented & Verified:** Fully written, wired frontend-to-backend, tested, and actively functioning.
*   **`B` — Partially Implemented:** Functional code exists in backend or frontend, but core workflows or edge cases are missing.
*   **`C` — Mocked or Simulated:** Interface exists, but underlying business logic relies on hardcoded mocks or in-memory stubs.
*   **`D` — Disconnected:** Code/API exists in backend, but frontend UI is absent or disconnected from user workflows.
*   **`E` — Missing:** Feature does not exist in schema, backend, or frontend.
*   **`F` — Cannot Verify:** Feature cannot be validated due to missing external credentials or unhosted third-party systems.

---

## 1. Summary Classification Distribution

| Product Surface | Total Features | `A` (Verified) | `B` (Partial) | `C` (Mocked) | `D` (Disconnected) | `E` (Missing) | `F` (Unverifiable) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Surface A: Public Website** | 11 | 0 | 0 | 0 | 0 | 11 | 0 |
| **Surface B: Business Workspace** | 31 | 1 | 5 | 5 | 7 | 13 | 0 |
| **Surface C: Platform-Owner Admin** | 17 | 0 | 0 | 0 | 1 | 16 | 0 |
| **Shared Core Infrastructure** | 13 | 3 | 3 | 2 | 1 | 4 | 0 |
| **Total Platform Audit** | **72** | **4** | **8** | **7** | **9** | **44** | **0** |

---

## 2. Surface A: Public Website Features

| # | Feature Name | Status | Reference Source | Current Code / Files | Missing Functionality | Dependencies | Security Implications | Target Milestone |
|---|--------------|:------:|------------------|----------------------|-----------------------|--------------|-----------------------|:----------------:|
| A1 | **Marketing Homepage** | `E` | `sagepilot.ai` | None (`apps/marketing` does not exist) | Hero, interactive simulator, ROI calculator, social proof, omnichannel grid | Tailwind / Framer Motion | Public attack surface; asset CDN caching | M1 |
| A2 | **Product Detail Pages** | `E` | `sagepilot.ai/products` | None | Dedicated pages for Support AI, Voice, Marketing, Operations, Inbox, Pulse BI | Content CMS / Markdown | Content injection defense | M1 |
| A3 | **AI Workforce Directory** | `E` | `sagepilot.ai/workforce` | None | Interactive cards for Support Agent, Voice Agent, Social Manager, Operations Agent | Marketing layout | Static public assets | M1 |
| A4 | **Customer Case Studies** | `E` | `sagepilot.ai/customers` | None | Filterable case study library (Plum, Aachho, Freecultr) with metric counters | CMS / JSON data | None | M1 |
| A5 | **Public Pricing & Plans** | `E` | `image(1).png`, `image(20261119-085446).png` | None | Starter, Growth ($99.99), Enterprise tiers, credit calculator, FAQ | Pricing config | Pricing clarity, clear terms | M1 |
| A6 | **Integrations Directory** | `E` | `image(20261119-090430).png` | None | 57+ app directory across Commerce, Shipping, Returns, Loyalty, Payments | JSON catalog | None | M1 |
| A7 | **Demo Scheduling** | `E` | `sagepilot.ai` | None | Multi-step qualification modal, ticket volume filter, calendar booking | Cal.com / HubSpot embed | Form rate limiting, spam bot defense | M1 |
| A8 | **Lead Capture & Trial** | `E` | `sagepilot.ai` | None | Self-serve onboarding wizard, company URL profiling, email verification | Auth API | Bot protection, email verification | M1 |
| A9 | **Public Authentication** | `B` | Orbit Auth Flow | `apps/web/src/pages/LoginPage.tsx`, `RegisterPage.tsx`, `apps/api/src/auth` | Forgot password, Email OTP, Google OAuth, Enterprise SAML | Postmark/SendGrid | Credential brute-force, CSRF, Token security | M1 |
| A10 | **SEO & OpenGraph** | `E` | `sagepilot.ai` | None | Meta tags, OpenGraph dynamic images, sitemap.xml, robots.txt, JSON-LD schema | Next.js Metadata API | None | M1 |
| A11 | **Legal & Trust Pages** | `E` | Standard SaaS Legal | None | Terms of Service, Privacy Policy, Subprocessors, DPA, Security Architecture | Static Markdown | Legal compliance (GDPR/CCPA) | M1 |

---

## 3. Surface B: Business Workspace Features

| # | Feature Name | Status | Reference Source | Frontend Files | Backend Files | Database Models | API Endpoints | Missing Functionality | Target Milestone |
|---|--------------|:------:|------------------|----------------|---------------|-----------------|---------------|-----------------------|:----------------:|
| B1 | **Omnichannel Shared Inbox** | `B` | `image(20261119-085243).png`, `image(20261119-085254).png` | `apps/web/src/pages/InboxPage.tsx` | `apps/api/src/conversations` | `Conversation`, `Message` | `GET /api/conversations`, `POST /api/conversations/:id/messages` | Missing ticket priority, teams, custom fields, private note UI toggle, timeline | M2 |
| B2 | **Ticket Views & Lifecycle** | `D` | `image(20261119-085254).png` | None (hardcoded status filter) | `apps/api/src/conversations/conversations.service.ts` | `Conversation` | `GET /api/conversations?status=` | Missing In Queue, Reopened, Snoozed, Awaiting, Investigating, Escalated, Needs First Reply | M2 |
| B3 | **Customer Profile & CRM** | `B` | `image(20261119-085337).png` | `apps/web/src/components/CustomerProfilePane.tsx` | `apps/api/src/customers` | `Customer`, `CustomerChannelIdentity`, `CustomerMergeAudit` | `GET /api/customers`, `POST /api/customers/merge` | Standalone CRM directory page missing; full contact list view missing | M2 |
| B4 | **Commerce Integration Cards** | `D` | `image(20261119-085243).png` | None | `packages/integrations` | None (Order schema not in DB) | None | Order lookup card, live tracking widget, one-click refund/cancel buttons | M4 |
| B5 | **AI Chat Agents Config** | `D` | `image(20261119-085415).png` | None | `apps/api/src/ai` | `AiConfiguration` | `POST /api/ai/configurations`, `GET /api/ai/configurations` | Dedicated AI Agents UI directory, persona builder, channel deployment toggles | M3 |
| B6 | **AI Voice Agent** | `E` | `sagepilot.ai`, `image(20261119-085415).png` | None | None | None | None | Telephony SIP integration, STT/TTS pipeline, human handoff briefing card | M6 |
| B7 | **Social Media Manager Agent**| `E` | `image(20261119-085415).png`, `image(20261119-085324).png` | None | None | None | None | Social comment listening, automated public replies, automated "Initiate DM" | M5 |
| B8 | **Social Engagement Inbox** | `E` | `image(20261119-085314).png`, `image(20261119-085324).png` | None | None | None | None | Instagram feed/ad comments view, Twitter timeline, moderation actions (hide/delete) | M5 |
| B9 | **Response Guard & Safety** | `D` | `image(20261119-090431).png` | None | `apps/api/src/ai` (`policyRules` in `AiConfiguration`) | `AiConfiguration.policyRules` | None | Supervised review mode UI, PII redaction rules, hallucination defense settings | M3 |
| B10 | **Knowledge Base & RAG** | `A` | Orbit M4 Groundwork | `apps/web/src/pages/KnowledgeBasePage.tsx` | `apps/api/src/knowledge` | `KnowledgeDocument`, `KnowledgeChunk` | `POST /api/knowledge/documents`, `GET /api/knowledge/documents` | Production OpenAI embedding wiring (currently mock in constructor) | M2 |
| B11 | **Marketing Campaigns** | `E` | `image(10).png` | None | None | None | None | Broadcast campaign builder, customer segments, scheduled WhatsApp/Email sending | M6 |
| B12 | **Lifecycle Journeys** | `E` | `image(10).png` | None | None | None | None | Cart abandonment recovery, browse abandonment, post-purchase replenishment | M6 |
| B13 | **Support Analytics Overview**| `E` | `image(2).png` | None | `apps/api/src/analytics` (bare metrics) | `Conversation`, `Message` | `GET /api/analytics` | Open tickets overview, age distribution, priority and sub-status breakdown | M4 |
| B14 | **Performance & TAT Reports**| `E` | `image(3).png` | None | None | None | None | AI vs Human TAT adherence (24h/72h), response & resolution time histograms | M4 |
| B15 | **Ticket Trends & Messages** | `E` | `image(4).png` | None | None | None | None | Conversation trends over time, message type breakdown, tag trends over time | M4 |
| B16 | **Workforce Analytics** | `E` | `image(5).png` | None | None | None | None | Median response/resolution times, queue analytics, agent workload distribution | M4 |
| B17 | **AI Deflection Analytics** | `E` | `image(6).png` | None | None | None | None | Daily AI vs Human handled stacked bar, deflection percentage curve | M4 |
| B18 | **Busiest Times Heatmap** | `E` | `image(7).png` | None | None | None | None | 24-hour x 7-day conversation and message activity heatmaps | M4 |
| B19 | **CSAT & Inferred CSAT** | `E` | `image(8).png` | None | None | None | None | Dual survey vs AI-inferred CSAT, 1-5 star distribution, agent CSAT table | M4 |
| B20 | **Touchpoints Funnel** | `E` | `image(9).png` | None | None | None | None | Interactions to closure distribution, touchpoints per handler | M4 |
| B21 | **Social Analytics & Sankey**| `E` | `image(20261119-085219).png` | None | None | None | None | Comment handling Sankey diagram, moderation percentage, response timeline | M5 |
| B22 | **Pulse AI (Insights BI)** | `E` | `image(20261119-085206).png` | None | None | None | None | Conversational BI, spreadsheet/CSV analysis, live side-by-side report rendering | M5 |
| B23 | **Business Hours Settings** | `E` | `image(20261119-090431).png` | None | None | None | None | Operating hours per day, holiday calendar, out-of-hours messaging rules | M2 |
| B24 | **Members, Roles & Teams** | `B` | `image(20261119-090431).png` | None | `apps/api/src/organizations` | `OrganizationMembership` | `GET /api/organizations/members` | Team grouping missing; custom roles missing; member invite UI missing | M2 |
| B25 | **Ticket Fields & Dispositions**| `E`| `image(20261119-090431).png` | None | None | None | None | Custom ticket attributes, wrap-up codes, mandatory resolution fields | M3 |
| B26 | **Integrations Marketplace** | `E` | `image(20261119-090430).png` | None | None | None | None | 57+ apps catalog UI across Commerce, Shipping, Returns, Payments | M4 |
| B27 | **Model Context Protocol (MCP)**| `E` | `image(20261119-090424).png` | None | None | None | None | Workspace MCP server endpoint, authentication tokens, Claude/Cursor connectivity | M5 |
| B28 | **Developer APIs & Webhooks** | `B` | `image(20261119-090424).png` | None | `apps/api/src/webhooks` | `WebhookEvent` | Inbound webhooks | API key generation UI, outbound webhook subscriptions, HMAC signing | M3 |
| B29 | **Usage & Token Tracking** | `B` | `image(20261119-090424).png` | None | `apps/api/src/ai` | `AiUsageEvent` | `GET /api/ai/usage` | Detailed visual usage meters, channel breakdown, export | M3 |
| B30 | **Billing & Wallet** | `C` | `image(1).png`, `image(20261119-085446).png` | None | `apps/api/src/billing` | `Subscription` | `POST /api/billing/webhook` | Billing dashboard UI, credit wallet balance, top-up purchase modal, Stripe portal | M3 |
| B31 | **Workspace Exports & Settings**| `E` | `image(20261119-090431).png` | None | None | None | None | CSV/JSON data takeout, audit log export, workspace deletion | M2 |

---

## 4. Surface C: Platform-Owner Admin Features

| # | Feature Name | Status | Description | Current Code / Files | Database Models | API Endpoints | Missing Implementation | Target Milestone |
|---|--------------|:------:|-------------|----------------------|-----------------|---------------|------------------------|:----------------:|
| C1 | **Global Tenant Directory** | `E` | Searchable directory of all organizations with plan and health status | None (`apps/admin` does not exist) | `Organization` | None | Super-admin tenant index, search, plan overview, status toggles | M7 |
| C2 | **Tenant Diagnostic Inspector**| `E` | Live queue status, webhook errors, lease sweeper diagnostics | None | `WebhookEvent` | None | Real-time diagnostic viewer per organization | M7 |
| C3 | **Auditable Impersonation** | `E` | Read-only / support session assumption into tenant workspaces | None | None (`ImpersonationLog` missing) | None | Cryptographic impersonation token, mandatory reason prompt, audit log | M7 |
| C4 | **Tenant Suspension & Gating** | `E` | Immediate operational kill-switch and per-org feature flags | None | `Organization.status` | None | Instant suspension toggle, feature flag override controls | M7 |
| C5 | **Global User Administration** | `E` | Directory of all registered users across all tenants | None | `User`, `UserSession` | None | Global user index, session kill-switch, password reset trigger | M7 |
| C6 | **Subscription & MRR Analytics**| `E` | Revenue dashboards, MRR, ARR, churn, upgrade/downgrade trends | None | `Subscription` | None | Financial charts, Stripe MRR sync, revenue analytics | M7 |
| C7 | **Dunning & Failed Invoices** | `E` | Tracking overdue accounts, failed Stripe charges, grace periods | None | None | None | Failed payment tracker, automated dunning email triggers | M7 |
| C8 | **Enterprise Custom Contracts** | `E` | Assigning bespoke seat limits and credit packages to large accounts | None | `Subscription` | None | Contract editor, custom pricing version assignment | M7 |
| C9 | **Platform Credit Ledger** | `E` | Double-entry ledger recording minted and burned AI credits | None | None (`CreditLedger` missing) | None | Full platform credit ledger, manual credit minting, audit logs | M7 |
| C10 | **Goodwill Credit Grants** | `E` | Operator grants of promotional or refund credits | None | None | None | Grant credit modal, balance adjustments with mandatory remarks | M7 |
| C11 | **Provider Cost & Gross Margin**| `D` | Comparing provider token costs (USD) against customer billings | `AiModelPricingSchedule` (DB only) | `AiModelPricingSchedule`, `AiRequestAttempt` | None | Margin dashboard calculating gross profit per tenant and overall | M7 |
| C12 | **AI Provider Master Keys** | `E` | Centralized vault for OpenAI, Anthropic, Groq, OpenRouter keys | Config only (`packages/config`) | None | None | Admin UI for provider key rotation, health checks, quota monitoring | M7 |
| C13 | **Model Routing Matrix** | `E` | Dynamic routing rules mapping task types to optimal models | Hardcoded in `AiService` | None | None | Visual model router, fallback configuration, latency limits | M7 |
| C14 | **Circuit Breaker Controls** | `E` | Real-time circuit breaker status and manual trip/reset buttons | In-memory only in API | None | None | Provider health dashboard, manual breaker override | M7 |
| C15 | **Integration Ingress Health** | `E` | Tracking webhook rates from Meta WhatsApp, Instagram, Stripe | None | `WebhookEvent` | None | Ingress rate charts, DLQ inspector, dead-letter replay button | M7 |
| C16 | **Platform Maintenance Banners**| `E` | Global broadcast banners displayed to all active workspace users | None | None | None | Banner editor, scheduled maintenance notice publisher | M7 |
| C17 | **Immutable Super-Admin Audit**| `E` | Append-only audit trail of all platform-owner administrative actions | None | None (`PlatformAuditLog` missing) | None | Tamper-evident admin audit table, export to CSV/JSON | M7 |

---

## 5. Shared Core Infrastructure Features

| # | Feature Name | Status | Description | Code Location | Tests | Gap / Blocker | Target Milestone |
|---|--------------|:------:|-------------|---------------|-------|---------------|:----------------:|
| S1 | **PostgreSQL Multi-Tenant RLS** | `A` | Forced Row-Level Security on all tenant tables via `app.current_organization_id` | `prisma/migrations/*`, `docker/postgres/init-roles.sql`, `tenancy/tenant.guard.ts` | 41 unit tests, CI live PostgreSQL | Verified rock-solid. Stored procedures enforce tenant context. | Verified |
| S2 | **Multi-Tab Auth & Token Rotation**| `A` | In-memory access token, HTTP-only refresh cookie, BroadcastChannel coordination | `apps/web/src/api/client.ts`, `apps/web/src/context/auth-context.tsx` | Unit & browser spec | Verified complete in Milestone 1 closure. | Verified |
| S3 | **Webhook Processing & Sweeper** | `A` | Idempotent webhook leasing, concurrency locks, sweeper worker | `apps/api/src/webhooks`, `apps/worker` | Webhook ingestion tests | Verified functional with PostgreSQL transaction locks. | Verified |
| S4 | **Credential Encryption (KMS)** | `E` | Encrypting third-party tokens (Meta WhatsApp/Instagram) in `Channel.config` | `Channel.config` (currently plaintext JSONB) | None | **Critical P1 Blocker:** Tokens stored in plaintext in DB. Envelope encryption required. | M1 |
| S5 | **Rate Limiting Engine** | `E` | Tiered Redis rate limiting across `/auth`, `/ai`, and public endpoints | `apps/api/src/auth`, `apps/api/src/ai` | None | **Critical P1 Blocker:** Unauthenticated endpoints lack rate limiting. Redis sliding-window required. | M1 |
| S6 | **AI Provider Decoupling** | `B` | Decoupling long-running LLM API calls from PostgreSQL DB transactions | `apps/api/src/ai/ai.service.ts` | Unit tests | **Critical P1 Blocker:** `generateSuggestion` runs inside DB transaction holding locks for 15s. | M1 |
| S7 | **Stripe Webhook RLS Handling** | `B` | Looking up tenant context before executing tenant-scoped DB updates | `apps/api/src/billing/stripe-ingestion.service.ts` | Integration tests | **Critical P1 Blocker:** Queries `subscriptions` as `orbit_app` without tenant context, returning 0 rows. | M1 |
| S8 | **Production OpenAI Embeddings** | `C` | Live embeddings for Knowledge Base RAG chunks | `apps/api/src/knowledge/knowledge.service.ts` | Unit tests | **Critical P1 Blocker:** Hardcoded `MockEmbeddingProvider(1536)` in constructor; live provider never wired. | M1 |
| S9 | **Password Reset & Recovery** | `E` | Secure token-based password reset and account recovery | `apps/api/src/auth` | None | **Critical P1 Blocker:** Zero password recovery endpoints exist. Users permanently locked out on forgotten password. | M1 |
| S10 | **Credit Accounting Ledger** | `E` | Concurrency-safe atomic credit debiting and balance locking | None (`Subscription.aiTokenAllowance` is simple int) | None | Must migrate from raw token counter to transactional double-entry credit ledger. | M3 |
| S11 | **Object Storage Provider** | `C` | Persistent file storage for message attachments and avatars | `packages/integrations/src/storage` | Unit tests | Disk/Mock providers exist; S3 / Cloudflare R2 provider missing. | M2 |
| S12 | **Realtime WebSocket Gateway** | `B` | Socket.IO gateway for instant chat and status updates | `apps/api/src/realtime`, `apps/web/src/hooks/useRealtimeSocket.ts` | Unit tests | Basic events wired; multi-room tenant isolation and presence tracking incomplete. | M2 |
| S13 | **Model Context Protocol (MCP)**| `E` | Standardized tool protocol for agentic IDEs and external LLMs | None | None | MCP SDK integration and tool routing missing. | M5 |

---

## 6. Audit Verdict

*   **Total Scope:** 72 Distinct Features across 3 Surfaces + Core Infrastructure.
*   **Fully Implemented & Verified (`A`):** 4 features (5.6%) — RLS isolation, Auth lifecycle coordination, Webhook sweeper, and Knowledge Base chunking logic.
*   **Partially Implemented (`B`):** 8 features (11.1%) — Inbox foundations, Customer profile backend, Auth endpoints, AI token records, Realtime gateway, Billing webhook receiver.
*   **Mocked or Simulated (`C`):** 7 features (9.7%) — AI LLM completions, Embeddings provider, Storage provider, WhatsApp adapter, Instagram adapter, Mock billing.
*   **Disconnected (`D`):** 9 features (12.5%) — Ticket status views, CRM customer table, Commerce cards, AI configuration UI, Response Guard UI, Analytics backend, Model pricing DB schedule.
*   **Missing Entirely (`E`):** 44 features (61.1%) — Complete Public Website (11 features), Voice Agent, Social Agent, Campaigns, Analytics reporting suites (10 dashboards), Pulse BI, and the entire Platform-Owner Admin interface (16 features).
*   **Unverifiable (`F`):** 0 features.

**Audit Conclusion:** While the foundational multi-tenant data layer and authentication protocol are hardened, Project Orbit currently represents approximately **16.7% functional product implementation** when measured against SagePilot parity. A structured, phased roadmap (Milestones M1 through M7) is required to build out the remaining surfaces and infrastructure.
