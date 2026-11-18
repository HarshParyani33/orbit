# PROJECT ORBIT — FINAL MILESTONE 3 REVIEW & VERIFICATION
## Complete Omnichannel Webhook Ingress, Transactional Outbox, Meta WhatsApp/Instagram Adapters, Media Storage & Stripe Billing Closure

**Document ID:** `M3-FINAL-20261118-COMPLETE-CLOSURE`  
**Milestone:** `Milestone 3 — Omnichannel Webhook Ingress, Transactional Outbox, Meta WhatsApp/Instagram Adapters, Message Media Attachments & Commercial Billing Foundation`  
**Execution Date:** `2026-11-18`  
**Architectural Contract:** `docs/ARCHITECTURE.md` & `docs/PROJECT_CONTEXT.md` (Modules 3, 4, 10 Priority 3 & 4)  
**Governance Runtime:** `Gravitas Core Skill Mode (6 Invariants Strictly Enforced)`  
**Repository:** `HarshParyani33/orbit`  
**Working Branch:** `main`  
**Latest Verified Commits & GitHub Actions CI Workflow Runs:**
- **Slice 3.1 (Transactional Webhook Outbox & Ingress Architecture):** Commit [`bdb0c8a`](https://github.com/HarshParyani33/orbit/commit/bdb0c8a), [CI Run #44322394554](https://github.com/HarshParyani33/orbit/actions/runs/44322394554) (Success)
- **Slice 3.2 (Meta WhatsApp Channel Adapter & Webhook Ingestion):** Commit [`eb76009`](https://github.com/HarshParyani33/orbit/commit/eb76009), [CI Run #44324562676](https://github.com/HarshParyani33/orbit/actions/runs/44324562676) (Success)
- **Slice 3.3 (Meta Instagram Channel Adapter & Webhook Ingestion):** Commit [`828bc97`](https://github.com/HarshParyani33/orbit/commit/828bc97), [CI Run #44326573018](https://github.com/HarshParyani33/orbit/actions/runs/44326573018) (Success)
- **Slice 3.4 (Message Media Attachments & Multi-Tenant Storage Abstraction):** Commit [`e12ddc1`](https://github.com/HarshParyani33/orbit/commit/e12ddc1) / [`49e1826`](https://github.com/HarshParyani33/orbit/commit/49e1826), [CI Run #44331187274](https://github.com/HarshParyani33/orbit/actions/runs/44331187274) (Success)
- **Slice 3.5 (Commercial Billing Foundation & Stripe Webhook Ingestion):** Commit [`ac7b6e5`](https://github.com/HarshParyani33/orbit/commit/ac7b6e5), [CI Run #44334925807](https://github.com/HarshParyani33/orbit/actions/runs/44334925807) (Success)

**Final Verdict:** **`MILESTONE 3 VERIFIED — READY FOR MILESTONE 4`**

---

## 1. Operating Context & Gravitas Governance

Throughout Milestone 3, all engineering work was strictly governed under Gravitas discipline:

```bash
$ python .agents/skills/gravitas/scripts/doctor.py
```
```json
{
  "gravitas_core_detected": true,
  "core_path": "H:\\orbit-saas\\.agents\\skills\\gravitas",
  "canonical_skill_sha256": "093c91dd12d1c78dee3fd31f93b1aad7aea454e7fe17f9b1f0f9a9cca7674553",
  "antigravity_cli_detected": false,
  "gravitas_native_detected": false,
  "native_plugin_path": null,
  "native_plugin_enabled": false,
  "native_hooks_available": false
}
```

- **Active Mode:** **Core Skill Mode** (prompt-based behavioral discipline, decision records, evidence-backed verification; native plugin and CLI hooks confirmed absent).
- **Enforced Invariants:** All six Gravitas invariants strictly governed the entire Milestone 3 lifecycle:
  1. *Ground before mutating:* Inspected Prisma relational schemas, PostgreSQL RLS policies, NestJS modular wiring, raw body capture buffers, cryptographic HMAC comparisons, and multi-tenant constraints before modifying code.
  2. *Stay in declared scope:* Confined strictly to Milestone 3 requirements across Slices 3.1 through 3.5; zero premature expansion into vector embeddings / pgvector (Milestone 4 scope).
  3. *Completion needs fresh evidence:* Every slice validated with new automated integration test suites executed against live PostgreSQL 16 on TCP, and verified on GitHub Actions CI.
  4. *Never exact-retry a failure:* Diagnosed cross-platform path separators, unauthenticated GitHub API rate limits, raw body buffer availability, and constructor injection tokens before adjusting code.
  5. *Satisfy the established contract:* Preserved multi-tenant isolation, composite foreign keys `[message_id, organization_id]` and `[channel_id, organization_id]`, RLS boundaries, and role privileges defined in `docs/ARCHITECTURE.md`.
  6. *Say what cannot be verified:* Explicitly documented simulated channel webhooks and mock storage provider parameters where production vendor credentials (Meta App live reviews, Stripe live account keys, cloud S3) are reserved for production staging.
- **Decision Records:** Recorded Decisions 30 through 34 in `docs/decisions/MILESTONE_3_DECISIONS.md`.

---

## 2. Milestone 3 Deliverables & Acceptance Criteria Matrix

| Slice | Architectural Scope | Key Artifacts & Services | Verification Suite | CI Status | Final Verdict |
|---|---|---|---|:---:|:---:|
| **Slice 3.1** | Transactional Webhook Outbox & Ingress Architecture | Migration `20261118000004_webhook_outbox`, `WebhookOutboxService`, `WebhookIngressController`, `WebhookSignatureGuard` | `tests/integration/webhook-outbox.spec.ts` (14 tests) | [Run #44322394554](https://github.com/HarshParyani33/orbit/actions/runs/44322394554) | **VERIFIED** |
| **Slice 3.2** | Meta WhatsApp Channel Adapter & Ingestion | `WhatsAppAdapter`, `WhatsAppIngressService`, `WhatsAppWebhookController` | `tests/integration/whatsapp-ingress.spec.ts` (14 tests) | [Run #44324562676](https://github.com/HarshParyani33/orbit/actions/runs/44324562676) | **VERIFIED** |
| **Slice 3.3** | Meta Instagram Channel Adapter & Ingestion | `InstagramAdapter`, `InstagramIngressService`, `InstagramWebhookController` | `tests/integration/instagram-ingress.spec.ts` (16 tests) | [Run #44326573018](https://github.com/HarshParyani33/orbit/actions/runs/44326573018) | **VERIFIED** |
| **Slice 3.4** | Message Media Attachments & Storage Abstraction | Migration `20261118000005_message_attachments`, `IStorageProvider`, `DiskStorageProvider`, `AttachmentsService`, `AttachmentsController` | `tests/integration/media-attachments.spec.ts` (16 tests) | [Run #44331187274](https://github.com/HarshParyani33/orbit/actions/runs/44331187274) | **VERIFIED** |
| **Slice 3.5** | Commercial Billing Foundation & Stripe Ingestion | Migration `20261118000006_subscriptions`, `BillingService`, `BillingController`, `StripeIngestionService`, `StripeSignatureGuard` | `tests/integration/stripe-billing.spec.ts` (11 tests) | [Run #44334925807](https://github.com/HarshParyani33/orbit/actions/runs/44334925807) | **VERIFIED** |

---

## 3. Core Architectural Invariants & Security Guarantees

Throughout Milestone 3, five foundational architectural invariants were established and hardened:

### 3.1 Transactional Webhook Outbox & Decoupled Ingress Architecture
- **Zero-Drop Inbound Ingress:** External vendor webhooks (Meta WhatsApp, Meta Instagram, Stripe) are immediately acknowledged with `200 OK` after signature verification and committed to the transactional `webhook_events` outbox.
- **Idempotent Ingress Guard:** Outbox uniqueness constraint `UNIQUE(channel_id, event_id)` prevents duplicate webhook processing when vendors retry deliveries. Duplicate deliveries return `200 OK` with zero duplicate mutations.
- **Strict Ingress Role Boundary:** The `orbit_ingress` role verifies incoming HMAC signatures without write access to domain tables. Table mutations are executed strictly by `orbit_app` inside `TenantTransactionRunner.runWithTenant(organizationId)`.

### 3.2 Meta WhatsApp Cloud API Channel Adapter
- **Cryptographic Signature Validation:** Validates `X-Hub-Signature-256` using constant-time `crypto.timingSafeEqual`. Malformed or forged signatures are immediately rejected with `401 Unauthorized`.
- **Webhook Handshake Challenge:** Responds to Meta verification queries (`hub.mode=subscribe`, `hub.verify_token`, `hub.challenge`) strictly matching configured channel verify tokens.
- **Phone Identity Decoupling:** Inbound messages automatically map sender E.164 phone numbers to `customer_channel_identities` (`channel_type: WHATSAPP`), preserving customer continuity across sessions.

### 3.3 Meta Instagram Channel Adapter & Scoped Identity Security
- **Instagram Scoped Identity Separation:** Maps Instagram Scoped User IDs (`IGSID`) to `customer_channel_identities` (`channel_type: INSTAGRAM`).
- **Anti-Collusion Isolation:** External Instagram profile names and avatars never trigger automatic customer profile merges, enforcing strict display-name collision defense.
- **Bidirectional Outbound Dispatch:** Normalizes outbound messages into Instagram Graph API payload structures, handling thread IDs and error retry boundaries.

### 3.4 Multi-Tenant Storage Abstraction & Path Traversal Defense
- **Path Traversal Defense:** `DiskStorageProvider` strictly sanitizes file keys, stripping null bytes, normalizing backslashes, stripping Windows drive letters, and verifying that resolved absolute paths never escape `baseDirectory`.
- **MIME Type & File Size Validation:** Enforces strict whitelist (`image/jpeg`, `image/png`, `image/webp`, `image/gif`, `application/pdf`, `text/plain`, `audio/mpeg`, `video/mp4`) and 10MB file size ceiling (`MAX_ATTACHMENT_SIZE_BYTES`).
- **Relational Tenant Integrity:** `message_attachments` table enforces composite foreign key `[message_id, organization_id] REFERENCES messages(id, organization_id)` and PostgreSQL RLS policy `tenant_isolation_message_attachments`.

### 3.5 Commercial Billing Foundation & Statutory Financial Retention
- **Stripe Signature Guard & Replay Defense:** Validates `Stripe-Signature` headers (`t=<timestamp>,v1=<signature>`) with a 300-second drift tolerance window (`Math.abs(now - timestamp) <= 300`), rejecting replayed or timestamp-drifted payloads.
- **7-Year Statutory Financial Retention:** The `subscriptions` table specifies `ON DELETE RESTRICT` on foreign keys, guaranteeing auditability and statutory compliance for commercial records.
- **Tiered Quota Enforcement:** Dynamically manages plan tiers (`FREE`, `STARTER`, `PRO`, `ENTERPRISE`) with conversation limits, seat limits, and storage quotas enforced at the tenant boundary.

---

## 4. Fresh Verification Evidence & Quality Gates

### 4.1 Automated Test Suites (Vitest)
Fresh execution across all 22 test suites:
```
Test Files  22 passed (22)
     Tests  253 passed (253)
  Duration  41.52s
```
- Unit tests: Cross-tab refresh coordination, Web Locks mutex, fail-closed fallbacks, JWT configuration validation.
- Integration tests: Database permissions, tenant isolation, authentication lifecycle, security pass, HTTP CORS/CSRF, API bootstrap, conversations, agent inbox API, real-time gateway, customers, AI assistant, website widget, automations & analytics, webhook outbox, WhatsApp ingress, Instagram ingress, media attachments, Stripe billing.
- Real Browser tests: Multi-tab headless Chromium verifying Web Locks mutex serialization, replay detection, concurrent trials, tab closure handoff, cross-tab account switch isolation, and login after logout epoch barriers.

### 4.2 Static Quality Gates
- **TypeScript Typecheck:** `tsc --build` — **Exit code 0** across all 9 workspaces.
- **ESLint Quality Gate:** `eslint .` — **Exit code 0** with zero errors or warnings.
- **Production Workspace Build:** `npm run build` — **Exit code 0** across all 9 workspaces (`@orbit/config`, `@orbit/integrations`, `@orbit/shared`, `@orbit/ui`, `@orbit/validation`, `@orbit/api`, `@orbit/web`, `@orbit/widget`, `@orbit/worker`).

### 4.3 GitHub Actions CI Verification
Every Milestone 3 slice was pushed to `origin/main` and verified against GitHub Actions CI:
- **CI Run #44322394554:** Slice 3.1 (Transactional Webhook Outbox) — **Success**
- **CI Run #44324562676:** Slice 3.2 (Meta WhatsApp Ingress) — **Success**
- **CI Run #44326573018:** Slice 3.3 (Meta Instagram Ingress) — **Success**
- **CI Run #44331187274:** Slice 3.4 (Message Media Attachments) — **Success**
- **CI Run #44334925807:** Slice 3.5 (Commercial Billing Foundation & Stripe Webhooks) — **Success**

---

## 5. What Cannot Be Verified / Deferred to Milestone 4 & Staging

In adherence to Gravitas Invariant 6 (*Say what cannot be verified*):
1. **Live Meta Cloud API Credentials:** Verified using deterministic HMAC-SHA256 signature verification and simulated adapter payloads. Live Meta Graph API webhooks require production Meta Developer App registration, planned for Stage B/C design partner pilots.
2. **Live Stripe Payment Webhooks:** Verified using cryptographic Stripe signature generation, real timestamps, and raw payload verification. Live financial transactions against Stripe test/live mode require production account credentials.
3. **Cloud S3 Object Storage:** Local filesystem storage abstraction verified with path traversal hardening. Cloud AWS S3 bucket uploads are deferred to cloud staging deployment.
4. **Knowledge Base pgvector & Semantic Search:** Deferred to Milestone 4.

---

## 6. Sign-Off & Progression to Milestone 4

All Milestone 3 acceptance criteria across Modules 3, 4, 10 (Priority 3 & 4) of `docs/PROJECT_CONTEXT.md` have been implemented, hardened, verified locally (253/253 tests green, typecheck/lint/build clean), documented in architectural decisions (Decisions 30–34), and confirmed 100% green on GitHub Actions CI.

**Milestone 3 is officially CLOSED and SIGNED OFF.**  
The repository is primed and ready for **Milestone 4 (Knowledge Base Embeddings, pgvector, Vector RAG Pipeline & Multi-Tenant Knowledge Retrieval)**.
