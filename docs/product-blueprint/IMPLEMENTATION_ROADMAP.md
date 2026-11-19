# Orbit Master Implementation Roadmap
## Dependency-Aware Phased Delivery Plan (Milestones M1 through M7)

**Document ID:** `ROADMAP-20261119-ORBIT-V1`  
**Status:** Approved Architectural Blueprint  
**Sequencing Strategy:** Security & Foundation First -> Core SaaS Cockpit -> Integrations -> Advanced AI & Voice -> Platform Administration

---

## 1. Master Milestone Overview

```mermaid
gantt
    title Orbit Master Phased Engineering Delivery
    dateFormat  YYYY-MM-DD
    section Phase 1: Foundation
    M1: P1 Fixes & Public Website Scaffolding    :m1, 2026-11-20, 10d
    section Phase 2: Helpdesk Cockpit
    M2: Omnichannel Inbox, CRM & Settings       :m2, after m1, 14d
    section Phase 3: AI & Credits
    M3: AI Studio, Response Guard & Ledger      :m3, after m2, 12d
    section Phase 4: Integrations & BI
    M4: Commerce Cards & 10 Analytics Dashboards :m4, after m3, 14d
    section Phase 5: Social & Pulse BI
    M5: Social Engagement, Pulse AI & MCP       :m5, after m4, 12d
    section Phase 6: Voice & Campaigns
    M6: AI Voice Telephony & Marketing Journeys :m6, after m5, 14d
    section Phase 7: Platform Admin
    M7: Platform Super-Admin & Global Gateway   :m7, after m6, 14d
```

---

## 2. Milestone 1 (M1): P1 Security Blockers & Public Website Scaffolding

### Objective
Eliminate all 6 critical security/reliability blockers identified in the baseline audit and establish the public-facing marketing and acquisition surface.

### Scope & Technical Deliverables
1.  **Tiered Redis Rate Limiting Engine:**
    *   Deploy sliding-window rate limiting via Redis on unauthenticated routes (`/api/auth/login`, `/api/auth/register`, `/api/ai/*`).
2.  **Channel Credential Envelope Encryption:**
    *   Implement AES-256-GCM envelope encryption in `packages/integrations` with tenant data keys.
    *   Migrate existing plaintext credentials in `Channel.config` to encrypted payloads.
3.  **AI Provider Call Decoupling:**
    *   Refactor `AiService.generateSuggestion` into pre-flight, external LLM call, and post-flight scoped database transaction.
4.  **Stripe Webhook Tenant RLS Resolution:**
    *   Map Stripe customer metadata to tenant context prior to opening tenant-scoped RLS transactions.
5.  **Production OpenAI Embeddings Wiring:**
    *   Replace hardcoded `MockEmbeddingProvider(1536)` in `KnowledgeService` with live `OpenAiEmbeddingProvider`.
6.  **Password Reset & Recovery Flow:**
    *   Implement cryptographically secure password reset tokens with time-limited expiry and transactional email dispatch.
7.  **Public Website Scaffolding (`apps/marketing`):**
    *   Scaffold Next.js 14 marketing app: Homepage, ROI Calculator, Pricing, Case Studies, Demo Booking.

### Verification & Exit Criteria
*   Automated regression test proving rate-limiting triggers HTTP 429 on brute-force attempts.
*   Database dump confirms channel tokens are ciphertext (`enc:v1:...`).
*   Load test verifying AI timeouts do not lock database connections.
*   All 300 existing CI tests + new security tests pass on GitHub Actions.

---

## 3. Milestone 2 (M2): Core Helpdesk, Omnichannel Inbox & CRM

### Objective
Deliver the complete, multi-tenant Business Workspace helpdesk console with full ticket lifecycle, customer CRM, and business hours.

### Scope & Technical Deliverables
1.  **Master 3-Column Shared Inbox UI (`apps/web`):**
    *   Left ticket navigation: In Queue, Open, Reopened, Snoozed, Awaiting, Escalated, Needs First Reply.
    *   Center conversation stream: Public messages, rich media, AI attribution badges, and Private Team Notes.
    *   Right context drawer: Status, priority, team, assignee, timeline, customer properties.
2.  **Unified Customer CRM Directory (`apps/web/src/pages/CustomersPage.tsx`):**
    *   Searchable customer database across names, emails, phones, and channels.
    *   Customer profile detail page with multi-channel identity graph and interaction history.
    *   Customer merge workflow with audit trail.
3.  **Business Hours Engine:**
    *   Configurable operating hours per day, holiday calendar, out-of-hours auto-responses, and routing queues.
4.  **Workspace Settings & Member Management:**
    *   Team definitions (Customer Support, Escalations, Sales).
    *   Member invitations, role assignments (`OWNER`, `ADMIN`, `MEMBER`, `AGENT`), and seat cap enforcement.
5.  **Production Object Storage:**
    *   S3 / Cloudflare R2 storage provider in `packages/integrations` for image/document attachments.

### Verification & Exit Criteria
*   End-to-end browser test: Customer message arrives -> Agent views in Inbox -> Adds Private Note -> Replies -> Resolves.
*   Customer merge test verifying past conversation pointers update without RLS violations.

---

## 4. Milestone 3 (M3): AI Workforce Studio, Response Guard & Credit Ledger

### Objective
Provide workspace administrators with complete control over their AI workforce, safety guardrails, and usage billing.

### Scope & Technical Deliverables
1.  **AI Agents Directory UI (`apps/web/src/pages/AiAgentsPage.tsx`):**
    *   Agent cards for Chat, Voice, and Social personas.
    *   Persona prompt builder, system instructions, temperature, and channel deployment toggles.
2.  **Response Guard & Trust Studio:**
    *   Supervised review mode toggle.
    *   Confidence threshold slider (e.g., 85%).
    *   PII auto-masking rules, competitor blacklists, and hallucination defense filters.
3.  **Double-Entry Credit Ledger & Wallet:**
    *   Prisma migration for `CreditLedger` table.
    *   Atomic Redis pre-auth check and post-flight transactional debiting.
    *   Credit meter UI ("7,304 of 7,500 credits remaining").
    *   Stripe Customer Portal integration and credit top-up purchase modal.
4.  **Developer API Keys & Outbound Webhooks:**
    *   Workspace API key generation with scoped permissions.
    *   Outbound webhook subscription manager with HMAC SHA-256 signing.

### Verification & Exit Criteria
*   Zero-credit test: AI requests automatically degrade to human queue when wallet reaches 0 credits.
*   Response Guard test: Blacklisted competitor names trigger human review queue.

---

## 5. Milestone 4 (M4): E-Commerce Connectors & Support Analytics Suite

### Objective
Integrate deep commerce context and provide the full 10-dashboard support business intelligence suite demonstrated in SagePilot.

### Scope & Technical Deliverables
1.  **Commerce & Logistics Connectors:**
    *   Shopify OAuth connector: Live order context, fulfillment status, one-click refund/cancel action cards in Inbox.
    *   Shiprocket & Courier connectors: Live AWB tracking and NDR re-attempt scheduling.
2.  **10 Analytics Dashboards (`apps/web/src/pages/AnalyticsPage.tsx`):**
    *   *Dashboard 1: Open Tickets Overview* (backlog, sub-status, priority, age distribution).
    *   *Dashboard 2: Performance & TAT* (AI vs Human TAT adherence, response time histograms).
    *   *Dashboard 3: Ticket Trends* (volume over time, message type breakdown, tag trends).
    *   *Dashboard 4: Workforce Analytics* (median response/resolution times, queue analytics, agent workload).
    *   *Dashboard 5: AI Deflection Trends* (daily AI vs Human stacked bars, deflection % curve).
    *   *Dashboard 6: Busiest Times Heatmap* (24h x 7d heatmap for conversations and messages).
    *   *Dashboard 7: CSAT Analytics* (dual survey vs AI-inferred CSAT, 1-5 star distribution, agent CSAT table).
    *   *Dashboard 8: Touchpoints Funnel* (interactions to closure distribution, touchpoints per handler).
    *   *Dashboard 9: Social Analytics* (comment handling Sankey diagram, moderation percentage).
    *   *Dashboard 10: Journey & Campaign Status* (stacked message delivery status).

### Verification & Exit Criteria
*   Simulated Shopify webhook updates order card in Inbox in real time.
*   All 10 analytics dashboards query aggregated database rollups with query latency under 250ms.

---

## 6. Milestone 5 (M5): Social Media Agent, Pulse AI & MCP Server

### Objective
Automate public social engagement, launch conversational support BI, and provide developer agentic IDE connectivity.

### Scope & Technical Deliverables
1.  **Social Media Engagement & Moderation:**
    *   Instagram Feed Comments & Ad Comments listening engine.
    *   Automated public replies and automated "Initiate DM" workflow.
    *   Moderation actions (Hide, Delete, Unhide) with audit history.
2.  **Pulse AI (Insights AI Assistant):**
    *   Split-view conversational BI interface beside tickets.
    *   Support data natural language querying (e.g., "Which channels drove the most tickets this week?").
    *   Spreadsheet / CSV upload analyzer (inventory, sales reports) with live chart rendering.
3.  **Model Context Protocol (MCP) Server:**
    *   Standardized MCP endpoint (`/api/mcp`) supporting Claude Desktop, Cursor, and ChatGPT.

### Verification & Exit Criteria
*   Social comment test: Negative comment triggers automated moderation hide action.
*   Pulse AI test: Uploaded CSV produces valid aggregate chart in under 5 seconds.

---

## 7. Milestone 6 (M6): AI Voice Telephony & Marketing Automation

### Objective
Expand into omnichannel phone support and automated revenue retention marketing.

### Scope & Technical Deliverables
1.  **AI Voice Telephony Platform:**
    *   Twilio Voice / SIP trunk integration on a single brand telephone line.
    *   Real-time streaming pipeline: Groq Whisper STT -> LLM -> Cartesia TTS.
    *   Automated human transfer: Generates written briefing card in Inbox upon transfer request.
2.  **Marketing Campaigns & Lifecycle Journeys:**
    *   Customer segmentation engine.
    *   Abandoned cart and browse abandonment recovery journeys via WhatsApp and Email.
    *   Post-purchase win-back broadcast campaigns with revenue attribution.

### Verification & Exit Criteria
*   Voice test: Speech turnaround latency under 1,200ms with natural interruption handling.
*   Campaign test: Abandoned checkout webhook dispatches personalized WhatsApp message within 15 minutes.

---

## 8. Milestone 7 (M7): Platform-Owner Super-Admin Control Plane

### Objective
Deliver the dedicated super-administrative application (`apps/admin`) governing multi-tenant health, global AI providers, and platform finances.

### Scope & Technical Deliverables
1.  **Platform Control Plane (`apps/admin`):**
    *   Global tenant directory with operational status toggles (`ACTIVE`, `SUSPENDED`).
    *   Live tenant diagnostic inspector (queue status, dead-letter webhooks, lease health).
    *   Hardware-MFA protected super-admin authentication.
2.  **Auditable Tenant Impersonation Engine:**
    *   Short-lived, cryptographically signed impersonation JWTs with mandatory reason prompt and immutable audit logging.
3.  **Global AI Gateway & Model Routing Matrix:**
    *   Master API key vault for OpenAI, Anthropic, Groq, OpenRouter.
    *   Visual model routing matrix, timeout thresholds, and manual circuit breaker controls.
4.  **Financial & Gross Margin Dashboards:**
    *   MRR, ARR, churn tracking, and Stripe synchronization.
    *   Unit economics dashboard calculating true provider token costs vs customer credit billings.

### Verification & Exit Criteria
*   Impersonation audit test: Super-admin actions during impersonation appear in `platform_audit_logs`.
*   Circuit breaker test: Simulated OpenAI 500 error trips breaker and routes traffic to Groq in under 50ms.
