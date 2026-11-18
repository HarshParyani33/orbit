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
