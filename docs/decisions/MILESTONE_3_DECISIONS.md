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
