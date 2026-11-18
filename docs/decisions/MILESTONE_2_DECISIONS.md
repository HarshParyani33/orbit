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


