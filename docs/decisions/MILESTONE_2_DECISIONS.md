# Project Orbit — Milestone 2 Architectural Decision Records

This document records the architectural and engineering decisions for **Milestone 2: Unified Communications & Agent Inbox**.

---

## Decision 23: Milestone 2 Architecture & Slice 2.1 — Conversation & Channel Domain Model

- **Status:** APPROVED & IMPLEMENTED
- **Date:** 2026-11-18
- **Context:**
  Milestone 2 builds the core SaaS multi-channel messaging platform. Slice 2.1 introduces the foundational data and API layer for Channels, Conversations, and Messages.
  In Orbit's multi-tenant security architecture:
  1. Every conversation and message is a Category A tenant-domain entity strictly governed by PostgreSQL Row-Level Security (RLS).
  2. Direct queries must execute exclusively through `TenantTransactionRunner.runWithTenant(organizationId, ...)`.
  3. Composite keys (`[id, organizationId]`) on `channels` and `conversations` enforce cross-table tenant integrity at the database foreign key level, preventing cross-tenant conversation or message injection even if application-level checks were bypassed.
  4. Querying a non-existent conversation or a conversation belonging to another tenant must return HTTP 404 (or fail closed) without revealing the existence of resources in other organizations.

- **Decision:**
  - **23.1 Shared Types & Zod Validation:**
    - Define domain types in `@orbit/shared`: `ConversationSummary`, `MessageSummary`, `ConversationStatus` (`OPEN`, `RESOLVED`, `SNOOZED`), `SenderType` (`CUSTOMER`, `AGENT`, `AI`, `SYSTEM`), `ChannelProvider` (`META_WHATSAPP`, `META_INSTAGRAM`, `WEB_CHAT`).
    - Define validation schemas in `@orbit/validation`: `createChannelSchema`, `createConversationSchema`, `updateConversationStatusSchema`, `createMessageSchema`, `listConversationsQuerySchema`.
  - **23.2 Channels Domain Service & Controller:**
    - Extend `ChannelsService` and `ChannelsController` in `apps/api` with channel detail, update, and soft-delete (`deletedAt`) operations.
    - Protect endpoints with `JwtAuthGuard` and `TenantGuard`.
  - **23.3 Conversations & Messages Domain Service & Controller:**
    - Implement `ConversationsService` and `ConversationsController` in `apps/api/src/conversations`:
      - `listConversations`: filters by `status`, `channelId`, with pagination.
      - `getConversation`: retrieves conversation details with associated channel metadata and ordered messages.
      - `createConversation`: creates conversation within active tenant and verifies channel ownership.
      - `updateConversationStatus`: validates status transitions (`OPEN`, `RESOLVED`, `SNOOZED`).
      - `listMessages`: lists chronological messages for a conversation.
      - `createMessage`: appends message to conversation (`AGENT`, `CUSTOMER`, `SYSTEM`), updates conversation `updatedAt` timestamp.
  - **23.4 Automated Integration Verification:**
    - Author `tests/integration/conversations.spec.ts` verifying:
      - Channel creation, retrieval, filtering, and soft delete.
      - Conversation creation and message exchange.
      - Strict tenant isolation: Tenant A attempting to read, update, or post messages in Tenant B's conversation fails closed (404 / 0 rows / RLS violation).
      - Status lifecycle transitions (`OPEN` -> `SNOOZED` -> `RESOLVED` -> `OPEN`).
      - Foreign key tenant boundary verification: attempting to create a conversation referencing a channel from another tenant fails with foreign key / RLS violation.

---

## Decision 24: Agent Inbox UI Architecture & Real-Time Sync Foundation (Slice 2.2)

- **Status:** APPROVED & IMPLEMENTED
- **Date:** 2026-11-18
- **Context:**
  Support agents require a unified, responsive, split-pane dashboard to triage, filter, view, and reply to customer inquiries across multi-tenant channels without page reloads or layout shift.
  The inbox must satisfy:
  1. Split-pane layout: Master conversation list on the left (with real-time status chips, channel indicators, last message preview, search, status filter, and channel filter) and detail/thread viewer on the right.
  2. Message thread viewer: Chronological messages displaying sender types (`CUSTOMER`, `AGENT`, `AI`, `SYSTEM`) with distinct visual treatments.
  3. Action controls: Agent reply composer (with Enter-to-send or button), status toggle (`OPEN`, `SNOOZED`, `RESOLVED`), and refresh.
  4. State handling: Full support for loading spinners, error banners, empty search states, and 'no conversation selected' empty states.
  5. Multi-Tenant isolation: Queries and mutations automatically carry active `X-Organization-ID` via `apiRequest`. When switching organizations in the top navbar, the inbox queries invalidate and immediately reload conversations for the new tenant.

- **Decision:**
  - **24.1 Component Architecture:**
    - `InboxPage.tsx`: Top-level inbox container orchestrating selected conversation ID, search filter, status filter, and channel filter.
    - Master pane: Real-time search by conversation title or customer message, filter pills for `ALL`, `OPEN`, `SNOOZED`, `RESOLVED`, and channel dropdown.
    - Detail pane: Conversation header with status changer (`OPEN`, `SNOOZED`, `RESOLVED`), channel provider pill, message thread with auto-scroll to bottom, and agent response composer.
    - New Conversation Modal: Allows agents to initiate an outbound conversation on a selected channel with an initial message.
  - **24.2 Query & Cache Lifecycle:**
    - Uses TanStack Query (`useQuery`, `useMutation`, `useQueryClient`).
    - Cache keys: `['conversations', activeOrg?.id, statusFilter, channelFilter]`, `['conversation', activeOrg?.id, selectedId]`.
    - On status update or new message creation, optimistic or fast cache invalidation refetches the thread and conversation list.
  - **24.3 Navigation Integration:**
    - Extend `Navbar.tsx` with view tabs (`Inbox` and `Channels & Settings`).
    - Extend `App.tsx` to switch seamlessly between `InboxPage` and `DashboardPage`.

---

## Decision 25: Real-Time WebSocket Architecture & Tenant Room Isolation (Milestone 2 Slice 2.3)
- **Status:** APPROVED & IMPLEMENTED
- **Date:** 2026-11-18
- **Context:**
  Slice 2.3 introduces live updates to the agent inbox and conversation threads so agents receive new customer messages, conversation status updates, and new conversation notifications immediately without manual refreshing.
  Real-time systems in a multi-tenant SaaS present strict isolation challenges: socket connections must never bridge tenant boundaries, unauthorized users must not receive events, and sockets must not snoop on foreign conversation threads.
- **Architectural Specification & Invariants:**
  1. **Handshake-Level Authentication & Membership Verification:**
     - `RealtimeGateway` intercepts handshakes via `server.use(...)` middleware.
     - Authenticates JWT from `auth.token`, `Authorization: Bearer <token>`, or `access_token` cookie.
     - Validates that the user has an active `OrganizationMembership` in PostgreSQL for the requested `organizationId`. Connections without valid tokens or with unauthorized org claims are rejected during handshake.
  2. **Multi-Tenant Room Scoping:**
     - Upon connection, the socket joins room `tenant:${organizationId}`.
     - Sockets receive tenant-wide broadcast events: `conversation:created`, `conversation:status_changed`, and `conversation:updated`.
     - Cross-tenant events are mathematically partitioned by Socket.io room boundaries; sibling tenants receive zero events.
  3. **Conversation Room Authorization (Snooping Defense):**
     - Sockets subscribe to conversation rooms (`conv:${conversationId}`) via `@SubscribeMessage('conversation:join')`.
     - The gateway executes an explicit database check via `TenantTransactionRunner` confirming the conversation exists and belongs to the socket's active tenant. Foreign tenants are rejected with `{ error: 'Conversation not found or unauthorized' }`.
     - Messages are emitted strictly to authorized participants in `conv:${conversationId}`.
  4. **Post-Commit Broadcast Invariant:**
     - In `ConversationsService`, all `realtimeService.emit*` calls occur strictly *after* `tenantRunner.runWithTenant` transactions successfully commit, preventing phantom event delivery on rollback.
  5. **Client Lifecycle & React Integration:**
     - `useRealtimeSocket` manages the client-side socket lifecycle, automatic reconnection, and dynamic tenant switching.
     - Directly invalidates TanStack queries (`['conversations', activeOrgId]` and `['conversation', activeOrgId, conversationId]`) to trigger seamless re-rendering.
- **Evidence & Verification:**
  - 12 comprehensive integration tests in `tests/integration/realtime-gateway.spec.ts` covering handshake authentication, forged token rejection, cross-tenant isolation, conversation room authorization, and dynamic switching.
  - Full test suite: 152/152 tests passing across 13 suites.
  - Local quality gates: `tsc --build` (typecheck), `eslint .` (lint), and `vite build` (build) exit code 0.
  - **GitHub Actions CI Verification:** [CI Run #44293770597](https://github.com/HarshParyani33/orbit/actions/runs/44293770597) completed with conclusion `success` across all 17 pipeline steps.

---

## Decision 26: Customer Identity Architecture, Channel Identity Mapping & Merge Invariants (Milestone 2 Slice 2.4)
- **Status:** APPROVED & IMPLEMENTED
- **Date:** 2026-11-18
- **Context:**
  Milestone 2 Slice 2.4 introduces Customer Identity and Profiles to Project Orbit. In an omnichannel customer engagement platform, customers reach businesses through disparate channels (WhatsApp phone number, Instagram scoped ID, Web Chat visitor token).
  A customer record must unite these channel identities, maintain conversation history, support verified identity linking, and preserve an immutable audit trail when identities are merged.
- **Architectural Specifications & Core Invariants:**
  1. **Strict Multi-Tenant Scoping (PostgreSQL RLS & Composite Keys):**
     - `customers`, `customer_channel_identities`, and `customer_merge_audits` are Category A tenant-domain tables.
     - Row Level Security (RLS) is enabled and forced (`FORCE ROW LEVEL SECURITY`).
     - Composite primary/unique keys `(id, organizationId)` and composite foreign keys guarantee that all channel identities, merge audits, and customer references cannot span across tenant boundaries.
  2. **Channel Identity Mapping Model (`customer_channel_identities`):**
     - Decouples external channel identifiers (`externalId`, e.g. E.164 phone number, Meta user ID, Web visitor session) from the internal `Customer` entity.
     - Enforces `UNIQUE(channel_id, external_id)` so an external identity cannot point to multiple customers within the same channel.
     - Tracks `verified` boolean indicating whether the external identifier was cryptographically or OTP-verified.
  3. **Strict Display-Name Collision Defense Invariant:**
     - Explicit prompt contract: **Never merge identities based only on matching display names.**
     - Common names (e.g., "John Smith", "Maria") across different channels MUST remain distinct customer entities by default.
     - Automatic linking is permitted strictly when an authoritative, verified identifier (e.g. verified E.164 phone or verified email address) matches.
     - Manual merging requires authorized agent action, logging the operator ID and justification.
  4. **Immutable Audit Trail for Identity Merges (`customer_merge_audits`):**
     - When Customer B (source) is merged into Customer A (target):
       - Source customer is marked `merged_into_id = targetCustomerId`.
       - All channel identities belonging to source are re-parented to target.
       - All conversations referencing source are re-parented to target.
       - A `CustomerMergeAudit` row is created storing `sourceCustomerId`, `targetCustomerId`, `performedByUserId`, `reason`, and a JSON snapshot of the source customer's state prior to merge.
  5. **Conversation Relationship:**
     - `conversations` table is extended with nullable `customer_id UUID`, governed by composite foreign key `(customer_id, organization_id) REFERENCES customers(id, organization_id) ON DELETE RESTRICT`.
- **Evidence & Verification:**
  - Database Migration: `20261118000000_customer_identities` created `customers`, `customer_channel_identities`, and `customer_merge_audits` tables with forced Row Level Security (RLS) and `orbit_app` least-privilege grants.
  - 13 comprehensive integration tests in `tests/integration/customers.spec.ts` covering CRUD, tenant isolation, channel identity mapping, display-name collision defense, verified linking, merge re-parenting, and audit logging.
  - Full test suite: 165/165 tests passing across all 14 suites.
  - Quality gates: `tsc --build` (typecheck), `eslint .` (lint), and `vite build` (build) exit code 0.
  - **GitHub Actions CI Verification:** [CI Run #44297005128](https://github.com/HarshParyani33/orbit/actions/runs/44297005128) completed with conclusion `success` across all 17 pipeline steps.

---

## Decision 27: AI Assistant Architecture, Guardrails & Cost Tracking (Milestone 2 Slice 2.5)
- **Status:** APPROVED & IMPLEMENTED
- **Date:** 2026-11-18
- **Context:**
  Milestone 2 Slice 2.5 introduces safe, tenant-specific AI customer assistance to Project Orbit.
  The architecture must satisfy strict multi-tenant boundaries, robust prompt-injection defenses, explicit instruction governance (Draft -> Test -> Approve -> Activate), and separated cost accounting (Platform COGS vs. Customer Turn Billing) conforming to `docs/ARCHITECTURE.md` Section 8.
- **Architectural Specifications & Invariants:**
  1. **Provider Abstraction (`@orbit/integrations`):**
     - Contract `IAiProvider` decoupling the core platform from model vendors.
     - Implementations: `MockAiProvider` (deterministic, latency-simulated for tests) and `OpenAiProvider` (standard Chat Completions).
  2. **Tenant Configuration Governance & Precedence:**
     - Invariant: **Do not silently modify approved instructions.**
     - Instruction lifecycle: `DRAFT` -> `APPROVED` -> `ACTIVE`. Only an authorized workspace user (OWNER or ADMIN) can approve and activate instructions.
     - Versioned records (`version` integer) preserve historical configuration integrity.
  3. **Prompt Injection & Framing Defense:**
     - User-supplied customer messages are encapsulated within strict `<customer_message>` XML delimiters.
     - System prompt establishes explicit precedence: approved tenant instructions and safety rules override all instructions supplied inside user message bodies.
  4. **Cost & Token Accounting Separation (Section 8.1):**
     - `ai_requests`: Logical customer turns (idempotent, tenant-scoped).
     - `ai_request_attempts`: Physical provider calls recording platform COGS liabilities (`incurred_cost_usd`, `cost_reconciliation_status: KNOWN | ESTIMATED | UNKNOWN`).
     - `ai_usage_events`: Exactly-once billable customer turns (`UNIQUE(request_id)`).
     - Rates resolved dynamically from `ai_model_pricing_schedules`. If pricing schedule is missing, fails closed with pre-flight error.
  5. **Human Takeover Protocol:**
     - If an agent has replied or conversation status is `SNOOZED` / `RESOLVED`, AI suggestions/auto-replies gracefully abstain with reason `HUMAN_TAKEOVER`.
- **Evidence & Verification:**
  - Database Migration: `20261118000001_ai_assistant` created `ai_configurations`, `ai_requests`, `ai_request_attempts`, and `ai_usage_events` with forced Row Level Security (RLS) and `orbit_app` least-privilege grants.
  - 10 comprehensive integration tests in `tests/integration/ai-assistant.spec.ts` covering non-destructive versioning, approval workflows, tenant isolation, COGS liability vs. usage event accounting, prompt injection framing defense, human takeover protocol, and unpriced model fail-closed handling.
  - Full test suite: 175/175 tests passing across all 15 suites.
  - Quality gates: `tsc --build` (typecheck), `eslint .` (lint), and `vite build` (build) exit code 0.
  - **GitHub Actions CI Verification:** [CI Run #44299625312](https://github.com/HarshParyani33/orbit/actions/runs/44299625312) completed with conclusion `success` across all 17 pipeline steps.

---

## Decision 28: Website Chat Widget Architecture, Ingress Security & Visitor Capability Separation (Milestone 2 Slice 2.6)
- **Status:** APPROVED & IN IMPLEMENTATION
- **Date:** 2026-11-18
- **Context:**
  Milestone 2 Slice 2.6 introduces the Website Chat Widget to Project Orbit, allowing businesses to embed an omnichannel customer chat interface on their websites.
  Per `docs/ARCHITECTURE.md` Section 5.1 & Module 7, the architecture must establish:
  1. A strict boundary between visitor capabilities and dashboard authentication.
  2. Public channel resolution that respects PostgreSQL Row-Level Security without granting uncontrolled table access.
  3. Cryptographically signed visitor session capabilities (`WIDGET_JWT_SECRET`).
  4. Origin domain validation (`allowed_domains`) and rate-limiting abuse protection.
  5. Persistent visitor session tracking across page reloads via client storage and `CustomerChannelIdentity`.
  6. Bi-directional message exchange linked to the unified agent inbox with real-time WebSocket event emission.
- **Architectural Specifications & Invariants:**
  1. **Public Channel Ingress Resolution (`resolve_widget_channel`):**
     - Channels are protected by PostgreSQL RLS for `orbit_app`. Anonymous website visitors have no initial tenant context.
     - A narrow, security-definer function `resolve_widget_channel(p_channel_id UUID)` returns only `(channel_id, organization_id, channel_name, status, config)`.
     - Validates that the channel exists, has `provider = 'WEB_CHAT'`, `status = 'ACTIVE'`, and `deleted_at IS NULL`.
     - Owned by `orbit_migrator`; granted to `orbit_app`; strictly revoked from public.
  2. **Visitor Capability Guard (`WidgetGuard`):**
     - Validates tokens signed with `WIDGET_JWT_SECRET`.
     - Enforces claim `{ type: 'WIDGET_VISITOR' }`.
     - Rejects any visitor token attempting to access dashboard routes (`JwtAuthGuard` explicitly rejects `type: 'WIDGET_VISITOR'` with 403 Forbidden).
     - Validates `Origin` header against `channel.config.allowed_domains` if configured.
  3. **Visitor Identity Persistence & Session Continuity:**
     - Client passes persistent `visitorId` (stored in browser `localStorage`).
     - Session init idempotently matches `CustomerChannelIdentity` (`provider: 'WEB_CHAT'`, `externalId: visitorId`).
     - Associates messages with the customer record inside `TenantTransactionRunner.runWithTenant(organizationId)`.
  4. **Real-time Event Emission:**
     - Customer messages sent through `POST /api/widget/message` emit `RealtimeGateway` events to the conversation room so human agents see incoming messages immediately.
  5. **Embeddable Chat Client (`apps/widget`):**
     - Self-contained, responsive chat widget exposing standard initialization and rendering hooks.
- **Evidence & Verification:**
  - Database Migration: `20261118000002_widget_channel_resolver` created `resolve_widget_channel(p_channel_id UUID)` security-definer function owned by `orbit_migrator` and granted to `orbit_app`.
  - 13 comprehensive integration tests in `tests/integration/widget.spec.ts` covering session initialization, visitor persistence without duplicates, allowed domains enforcement, provider gating (rejecting WhatsApp channels), dashboard route isolation (403 Forbidden on JwtAuthGuard), bi-directional message exchange, status re-opening on incoming customer messages, and rate limit abuse protection.
  - Full test suite: 188/188 tests passing across all 16 suites.
  - Quality gates: `tsc --build` (typecheck), `eslint .` (lint), and `npm run build` (build for all 9 workspaces) exit code 0.
  - **GitHub Actions CI Verification:** [CI Run #44315972086](https://github.com/HarshParyani33/orbit/actions/runs/44315972086) completed with conclusion `success` across all 17 pipeline steps.

---

## Decision 29: Automation Engine, SLA Metrics & Queue Processing (Milestone 2 Slice 2.7)
- **Status:** APPROVED & IN IMPLEMENTATION
- **Date:** 2026-11-18
- **Context:**
  Milestone 2 Slice 2.7 delivers the Initial Automation Engine and SLA Analytics to Project Orbit, completing the Milestone 2 capabilities required by `docs/PROJECT_CONTEXT.md` (Modules 8 & 9) and `docs/ARCHITECTURE.md` Section 9.
  The design must guarantee:
  1. Strict multi-tenant row-level security across automation rules and execution audit trails.
  2. Safe condition evaluation without dynamic code injection (interpreting JSON condition ASTs).
  3. Immutable execution audits recording trigger, matched state, actions executed, and timestamps.
  4. Real-time conversation metrics (first response time, resolution status breakdowns, volume by sender type).
  5. Idempotent background job processing with tenant scoping.
- **Architectural Specifications & Invariants:**
  1. **Automation Rule Data Models (`automation_rules` & `automation_execution_audits`):**
     - Category A models governed by PostgreSQL RLS with `TenantTransactionRunner.runWithTenant(organizationId)`.
     - Triggers: `CONVERSATION_CREATED`, `MESSAGE_RECEIVED`, `CONVERSATION_RESOLVED`.
     - Condition predicates: `EQUALS`, `CONTAINS`, `STARTS_WITH`, `IN`.
     - Action handlers: `UPDATE_STATUS`, `SEND_SYSTEM_MESSAGE`, `ASSIGN_PRIORITY`, `ESCALATE_HUMAN`.
     - Execution records immutable audit log in `automation_execution_audits`.
  2. **Analytics & SLA Calculation:**
     - Computes conversation volume, status distributions (Open, Resolved, Snoozed), and message sender breakdown (Customer, Agent, AI, System).
     - Calculates First Response Time (FRT) in milliseconds between the initial customer inquiry and the earliest subsequent agent response.
     - Strictly tenant-bounded: all aggregations occur inside tenant transaction runner with RLS enforcement.
  3. **Idempotent Queue Consumer (`@orbit/worker`):**
     - Jobs mandate `organizationId` payload and deterministic `jobId` / idempotency key.
     - Workers execute exclusively inside `TenantTransactionRunner.runWithTenant(job.data.organizationId)`.
- **Evidence & Verification:**
  - Database Migration: `20261118000003_automations_and_audits` created `automation_rules` and `automation_execution_audits` with forced Row Level Security (RLS) and `orbit_app` least-privilege grants.
  - 10 comprehensive integration tests in `tests/integration/automation-analytics.spec.ts` covering rule condition evaluation (`CONTAINS`, `EQUALS`), action execution (status transition, auto-reply notices), immutable execution audits, SLA first response time (FRT) calculation, cross-tenant metric isolation, and worker job idempotency.
  - Full test suite: 198/198 tests passing across all 17 suites.
  - Quality gates: `tsc --build` (typecheck), `eslint .` (lint), and `npm run build` (build for all 9 workspaces) exit code 0.











