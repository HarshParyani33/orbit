# Project Orbit — Milestone 3 Architectural Decision Records

This document records the architectural and engineering decisions for **Milestone 3: Omnichannel Webhook Ingress, Transactional Outbox & Media Attachments**.

---

## Decision 30: Webhook Ingress Architecture, Narrow Routing Lookup & Transactional Outbox (Milestone 3 Slice 3.1)

- **Status:** APPROVED & VERIFIED
- **Date:** 2026-11-18
- **Context:**
  Milestone 3 opens Project Orbit to external third-party communication channels (Meta WhatsApp Cloud API, Meta Instagram Messaging API, and Stripe Billing).
  Per `docs/ARCHITECTURE.md` Section 5.1 & Section 7, inbound webhook requests present unique multi-tenant security challenges:
  1. Inbound requests arrive without a user session, JWT token, or `X-Organization-Id` header.
  2. Provider signatures (e.g. `X-Hub-Signature-256`) are signed with application-level platform secrets (`META_APP_SECRET`), not channel-level credentials.
  3. Resolving tenant context (`organization_id`) requires looking up the external account ID (e.g. WhatsApp `phone_number_id`, Instagram `account_id`).
  4. Querying the database to resolve tenant context must NOT grant table access to unauthenticated ingress connections.
  5. Events must be persisted in an immutable, recoverable transactional outbox (`webhook_events`) with PostgreSQL RLS before acknowledging HTTP 200 to the provider, preventing lost events if downstream services crash.
  6. Exact duplicate webhook deliveries must be deduplicated idempotently by `(organization_id, channel_id, provider, idempotency_key)`.

- **Architectural Specifications & Invariants:**
  1. **Dual-Role Ingress Separation (`orbit_ingress` vs `orbit_app`):**
     - Routing resolution executes via the dedicated `orbit_ingress` connection pool with zero table access, calling the security-definer function `resolve_channel_routing(p_provider, p_external_account_id)`.
     - Returns only `(channel_id, organization_id, status)`. If not found or status != 'ACTIVE', rejects immediately with 404.
     - Once `organization_id` is resolved, domain writes execute exclusively via `TenantTransactionRunner.runWithTenant(organizationId)` using the least-privilege `orbit_app` pool.
  2. **Raw Body Buffer Preservation & Constant-Time Signature Verification:**
     - NestJS configured with `{ rawBody: true }` to preserve unparsed request byte buffers.
     - Computes HMAC-SHA256 over `req.rawBody` using `META_APP_SECRET`.
     - Compares signatures using `crypto.timingSafeEqual` against header `X-Hub-Signature-256` (`sha256=<hex>`).
     - Handshake verification: handles Meta's GET challenge (`hub.mode === 'subscribe'`, `hub.verify_token === META_WEBHOOK_VERIFY_TOKEN`).
  3. **Transactional Outbox (`webhook_events`):**
     - Category A entity governed by PostgreSQL Row-Level Security (`FORCE ROW LEVEL SECURITY`).
     - Composite foreign key `FOREIGN KEY (channel_id, organization_id) REFERENCES channels (id, organization_id) ON DELETE RESTRICT`.
     - Idempotency constraint `UNIQUE(organization_id, channel_id, provider, idempotency_key)`.
     - Dual dispatch lifecycle:
       - Path A (Immediate HTTP-Handler Dispatch): inserts event with `dispatch_token`, enqueues job with `jobId = event.id`, updates to `DISPATCHED`.
       - Path B (Background Sweeper Recovery): queries stale `PENDING_DISPATCH` events with `SKIP LOCKED` and enqueues to worker queue.
  4. **Worker Lease Protocol:**
     - Fencing token `lease_token` and `lease_expires_at` (60s) protect against concurrent worker execution and zombie workers.

- **Evidence & Verification:**
  - Database Migration: `20261118000004_webhook_events` creating `webhook_events` with forced RLS and `orbit_app` grants.
  - Automated tests covering:
    - GET webhook challenge handshake (valid token returns challenge, invalid returns 403).
    - Inbound POST signature verification (valid HMAC accepted, forged HMAC rejected with 401).
    - Narrow routing lookup via `resolve_channel_routing` (known account routes to tenant, unknown returns 404).
    - Outbox idempotent insertion (duplicate `idempotency_key` does not duplicate event).
    - Multi-tenant isolation (RLS prevents cross-tenant event access).
  - Full test suite: 214/214 tests passing across all 18 suites.
  - Quality gates: `tsc --build` (typecheck), `eslint .` (lint), and `npm run build` (build for all 9 workspaces) exit code 0.
  - **GitHub Actions CI Verification:** [CI Run #44322394554](https://github.com/HarshParyani33/orbit/actions/runs/44322394554) completed with conclusion `success` across all 17 pipeline steps.

---

## Decision 31: Meta WhatsApp Inbound Webhook Processing & Channel Adapter (Milestone 3 Slice 3.2)

- **Status:** APPROVED & VERIFIED
- **Date:** 2026-11-18
- **Context:**
  Milestone 3 Slice 3.2 introduces full two-way WhatsApp Business Platform integration to Project Orbit.
  Per `docs/PROJECT_CONTEXT.md` Module 6 and `docs/ARCHITECTURE.md` Section 7:
  1. Inbound WhatsApp messages arriving at `POST /api/webhooks/whatsapp` must be parsed, deduplicated, linked to the customer CRM identity, mapped into unified conversations, and appended as messages.
  2. Customer resolution must map phone numbers to `CustomerChannelIdentity` with `verified: true` (since phone numbers are cryptographic/OTP verified by Meta).
  3. Re-opens snoozed/resolved conversations when a customer replies.
  4. Triggers the automation engine (`MESSAGE_RECEIVED`) and real-time WebSocket notifications to human agents.
  5. Outbound agent replies must invoke the WhatsApp adapter (`IWhatsAppAdapter`), recording message delivery status and external message ID.
  6. Outbound calls must fail gracefully when channel credentials are unconfigured or when Meta returns an error.

- **Architectural Specifications & Invariants:**
  1. **WhatsApp Ingestion Service (`WhatsAppIngestionService`):**
     - Extracts message envelope: `wamid`, sender `from` phone number, message text, and optional profile name.
     - Customer CRM Linking:
       - Queries `CustomerChannelIdentity` within tenant context.
       - If missing, creates `Customer` with `phone: fromPhoneNumber`, `displayName: profileName || fromPhoneNumber` and creates `CustomerChannelIdentity` with `verified: true`.
     - Conversation Thread Continuity:
       - Finds active conversation for `(channelId, customerId)`.
       - Re-opens `SNOOZED` conversation to `OPEN`.
       - Creates new `Conversation` if no active conversation exists.
     - Appends `Message` (`senderType: 'CUSTOMER'`, `metadata: { wamid, type }`).
     - Emits WebSocket event and triggers automation rules.
  2. **WhatsApp Adapter Abstraction (`@orbit/integrations`):**
     - `IWhatsAppAdapter` contract with `sendMessage(channelConfig, to, text)`.
     - `MockWhatsAppAdapter` with deterministic responses and simulated latency.
     - In `ConversationsService.createMessage`: if `senderType === 'AGENT'` and channel is `META_WHATSAPP`, invokes adapter and stores `metadata: { externalId, status: 'DISPATCHED' }`.

- **Evidence & Verification:**
  - Automated integration tests in `tests/integration/whatsapp-channel.spec.ts` covering:
    - Inbound WhatsApp message parsing, customer identity creation, and thread creation.
    - Customer thread continuity: multiple messages from the same phone number append to the same thread.
    - Re-opening snoozed conversations on customer reply.
    - Automation engine trigger and real-time event dispatch.
    - Outbound agent message dispatch via WhatsApp adapter.
    - Idempotent deduplication when identical webhook is re-delivered.
  - Full test suite: 220/220 tests passing across all 19 suites.
  - Quality gates: `tsc --build` (typecheck), `eslint .` (lint), and `npm run build` (build for all 9 workspaces) exit code 0.
  - **GitHub Actions CI Verification:** [CI Run #44324562676](https://github.com/HarshParyani33/orbit/actions/runs/44324562676) completed with conclusion `success` across all 17 pipeline steps.

---

## Decision 32: Meta Instagram Inbound Webhook Processing & Channel Adapter (Milestone 3 Slice 3.3)

- **Status:** APPROVED & VERIFIED (Commit `828bc97`, CI Run `44326573018`)
- **Date:** 2026-11-18
- **Context:**
  Milestone 3 Slice 3.3 introduces full two-way Meta Instagram Messaging integration to Project Orbit.
  Per `docs/PROJECT_CONTEXT.md` Module 6 and `docs/ARCHITECTURE.md` Section 7:
  1. Inbound Instagram messages arriving at `POST /api/webhooks/instagram` must be parsed, deduplicated, linked to the customer CRM identity, mapped into unified conversations, and appended as messages.
  2. Customer resolution must map Instagram Scoped User IDs (IGSID) to `CustomerChannelIdentity` with `verified: true` (since IGSIDs are cryptographic user IDs issued by Meta).
  3. Re-opens snoozed/resolved conversations when an Instagram user replies.
  4. Triggers the automation engine (`MESSAGE_RECEIVED`) and real-time WebSocket notifications to human agents.
  5. Outbound agent replies must invoke the Instagram adapter (`IInstagramAdapter`), recording message delivery status and external message ID.

- **Architectural Specifications & Invariants:**
  1. **Instagram Ingestion Service (`InstagramIngestionService`):**
     - Extracts message envelope: `mid`, sender `IGSID`, message text.
     - Customer CRM Linking:
       - Queries `CustomerChannelIdentity` within tenant context for `provider: 'META_INSTAGRAM'`, `externalId: igsid`.
       - If missing, creates `Customer` with `name: 'Instagram User ' + igsid`, `metadata: { igsid, provider: 'META_INSTAGRAM' }` and creates `CustomerChannelIdentity` with `verified: true`.
     - Conversation Thread Continuity:
       - Finds active conversation for `(channelId, customerId)`.
       - Re-opens `SNOOZED` conversation to `OPEN`.
       - Creates new `Conversation` if no active conversation exists (`title: 'Instagram: ' + igsid`).
     - Appends `Message` (`senderType: 'CUSTOMER'`).
     - Emits WebSocket event and triggers automation rules.
  2. **Instagram Adapter Abstraction (`@orbit/integrations`):**
     - `IInstagramAdapter` contract with `sendMessage(params: InstagramSendParams)`.
     - `MockInstagramAdapter` with deterministic responses and simulated latency.
     - In `ConversationsService.createMessage`: if `senderType === 'AGENT'` and channel is `META_INSTAGRAM`, invokes adapter and records outbound message dispatch.

- **Evidence & Verification:**
  - Automated integration tests in `tests/integration/instagram-channel.spec.ts` covering:
    - Inbound Instagram DM message parsing, customer identity creation, and thread creation.
    - Customer thread continuity: multiple messages from the same IGSID append to the same thread.
    - Re-opening snoozed conversations on user reply.
    - Automation engine trigger and real-time event dispatch.
    - Outbound agent message dispatch via Instagram adapter.
    - Multi-tenant RLS isolation.
  - Full test suite: 226/226 tests passing across all 20 suites.
  - Quality gates: `tsc --build` (typecheck), `eslint .` (lint), and `npm run build` (build for all 9 workspaces) exit code 0.
  - **GitHub Actions CI Verification:** [CI Run #44326573018](https://github.com/HarshParyani33/orbit/actions/runs/44326573018) completed with conclusion `success` across all 17 pipeline steps.
