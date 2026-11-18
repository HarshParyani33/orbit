# PROJECT ORBIT — FINAL MILESTONE 2 REVIEW & VERIFICATION
## Complete Milestone 2 Architecture, Multi-Channel Communications, AI Foundation & Automations Closure

**Document ID:** `M2-FINAL-20261118-COMPLETE-CLOSURE`  
**Milestone:** `Milestone 2 — Unified Communications, Agent Inbox, Real-Time Sync, AI Foundation, Website Widget & Automations`  
**Execution Date:** `2026-11-18`  
**Architectural Contract:** `docs/ARCHITECTURE.md` v1.1.5 & `docs/PROJECT_CONTEXT.md` (Modules 2, 3, 4, 5, 6, 7, 8, 9)  
**Governance Runtime:** `Gravitas Core Skill Mode (6 Invariants Strictly Enforced)`  
**Repository:** `HarshParyani33/orbit`  
**Working Branch:** `main`  
**Latest Verified Commits & GitHub Actions CI Workflow Runs:**
- **Slice 2.1 (Conversation & Channel Foundation):** Commit [`6cfb4a8`](https://github.com/HarshParyani33/orbit/commit/6cfb4a8), [CI Run #44274744751](https://github.com/HarshParyani33/orbit/actions/runs/44274744751) (Success)
- **Slice 2.2 (Agent Inbox Dashboard UI):** Commit [`9fe3996`](https://github.com/HarshParyani33/orbit/commit/9fe3996), [CI Run #44276052332](https://github.com/HarshParyani33/orbit/actions/runs/44276052332) (Success)
- **Slice 2.3 (Real-Time WebSocket Updates & Room Isolation):** Commit [`8aa1585`](https://github.com/HarshParyani33/orbit/commit/8aa1585), [CI Run #44293770597](https://github.com/HarshParyani33/orbit/actions/runs/44293770597) (Success)
- **Slice 2.4 (Customer Identity, Profiles & Merge Auditing):** Commit [`e23072d`](https://github.com/HarshParyani33/orbit/commit/e23072d), [CI Run #44297005128](https://github.com/HarshParyani33/orbit/actions/runs/44297005128) (Success)
- **Slice 2.5 (AI Assistant Foundation, Guardrails & Cost Ledger):** Commit [`c49a3b3`](https://github.com/HarshParyani33/orbit/commit/c49a3b3), [CI Run #44299625312](https://github.com/HarshParyani33/orbit/actions/runs/44299625312) (Success)
- **Slice 2.6 (Website Chat Widget & Visitor Capability Separation):** Commit [`f978c79`](https://github.com/HarshParyani33/orbit/commit/f978c79), [CI Run #44315972086](https://github.com/HarshParyani33/orbit/actions/runs/44315972086) (Success)
- **Slice 2.7 (Initial Automation Engine, SLA Metrics & Queue Processing):** Commit [`a4d3661`](https://github.com/HarshParyani33/orbit/commit/a4d3661), [CI Run #44318404321](https://github.com/HarshParyani33/orbit/actions/runs/44318404321) (Success)

**Final Verdict:** **`MILESTONE 2 VERIFIED — READY FOR MILESTONE 3`**

---

## 1. Operating Context & Gravitas Governance

Before and throughout the Milestone 2 implementation and verification cycles, the environment was governed under Gravitas discipline:

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
- **Enforced Invariants:** All six Gravitas invariants strictly governed the entire Milestone 2 lifecycle:
  1. *Ground before mutating:* Inspected Prisma relational schemas, PostgreSQL RLS policies, NestJS modular wiring, TanStack React queries, Socket.io rooms, and token claims before modifying files.
  2. *Stay in declared scope:* Confined strictly to Milestone 2 requirements across Slices 2.1 through 2.7; zero premature expansion into payment processing / Stripe webhooks (Milestone 3 scope).
  3. *Completion needs fresh evidence:* Every slice validated with new automated integration and unit test suites executed against live PostgreSQL 16, a real NestJS HTTP/WebSocket server on TCP, and verified on GitHub Actions CI.
  4. *Never exact-retry a failure:* Diagnosed TypeScript compilation nuances, token capability mismatches, and Jest/Vitest teardown issues before adjusting code.
  5. *Satisfy the established contract:* Preserved multi-tenant isolation, composite foreign keys, RLS boundaries, and role privileges defined in `docs/ARCHITECTURE.md`.
  6. *Say what cannot be verified:* Explicitly documented simulated channel adapters and mock AI provider parameters where live vendor credentials (Meta Business Platform, production LLM billing accounts) are reserved for production staging.
- **Decision Records:** Recorded Decisions 23 through 29 in `docs/decisions/MILESTONE_2_DECISIONS.md`.

---

## 2. Milestone 2 Deliverables & Acceptance Criteria Matrix

| Slice | Architectural Scope | Key Artifacts & Services | Verification Suite | CI Status | Final Verdict |
|---|---|---|---|:---:|:---:|
| **Slice 2.1** | Conversation & Channel Domain Model | `ChannelsService`, `ConversationsService`, `ConversationsController`, `@orbit/shared`, `@orbit/validation` | `tests/integration/conversations.spec.ts` (14 tests) | [Run #44274744751](https://github.com/HarshParyani33/orbit/actions/runs/44274744751) | **VERIFIED** |
| **Slice 2.2** | Agent Inbox Dashboard UI | `InboxPage.tsx`, `Navbar.tsx`, `App.tsx`, TanStack Query integration | `tests/integration/inbox-api.spec.ts` (12 tests) | [Run #44276052332](https://github.com/HarshParyani33/orbit/actions/runs/44276052332) | **VERIFIED** |
| **Slice 2.3** | Real-Time WebSocket Updates & Room Isolation | `RealtimeGateway`, `RealtimeService`, `useRealtimeSocket.ts` | `tests/integration/realtime-gateway.spec.ts` (12 tests) | [Run #44293770597](https://github.com/HarshParyani33/orbit/actions/runs/44293770597) | **VERIFIED** |
| **Slice 2.4** | Customer Identity, Profiles & Merge Auditing | Migration `20261118000000`, `CustomersService`, `CustomersController` | `tests/integration/customers.spec.ts` (13 tests) | [Run #44297005128](https://github.com/HarshParyani33/orbit/actions/runs/44297005128) | **VERIFIED** |
| **Slice 2.5** | AI Assistant Foundation, Guardrails & Cost Ledger | Migration `20261118000001`, `AiAssistantService`, `AiController`, `@orbit/integrations` | `tests/integration/ai-assistant.spec.ts` (10 tests) | [Run #44299625312](https://github.com/HarshParyani33/orbit/actions/runs/44299625312) | **VERIFIED** |
| **Slice 2.6** | Website Chat Widget & Visitor Ingress | Migration `20261118000002`, `WidgetService`, `WidgetGuard`, `WidgetController`, `@orbit/widget` | `tests/integration/widget.spec.ts` (13 tests) | [Run #44315972086](https://github.com/HarshParyani33/orbit/actions/runs/44315972086) | **VERIFIED** |
| **Slice 2.7** | Initial Automation Engine & SLA Analytics | Migration `20261118000003`, `AutomationsService`, `AnalyticsService`, `@orbit/worker` | `tests/integration/automation-analytics.spec.ts` (10 tests) | [Run #44318404321](https://github.com/HarshParyani33/orbit/actions/runs/44318404321) | **VERIFIED** |

---

## 3. Core Architectural Invariants & Security Guarantees

Throughout Milestone 2, seven architectural invariants were rigorously implemented and verified:

### 3.1 Multi-Tenant Row-Level Security Across All Entities
- Every newly introduced entity (`channels`, `conversations`, `messages`, `customers`, `customer_channel_identities`, `customer_merge_audits`, `ai_configurations`, `ai_requests`, `ai_request_attempts`, `ai_usage_events`, `automation_rules`, `automation_execution_audits`) is classified as a **Category A** multi-tenant domain entity.
- Row-Level Security (`FORCE ROW LEVEL SECURITY`) is enabled and enforced.
- The application role `orbit_app` cannot access or mutate any tenant data outside an explicit `TenantTransactionRunner.runWithTenant(organizationId, ...)`.
- Composite primary keys and foreign keys (`[id, organizationId]`) guarantee foreign key reference integrity at the database schema level.

### 3.2 Real-Time WebSocket Multi-Tenant Isolation & Anti-Snooping
- Handshakes require valid JWT tokens and active `OrganizationMembership` verification in PostgreSQL.
- Sockets join tenant rooms `tenant:${organizationId}` strictly partitioned by tenant ID.
- Joining conversation rooms (`conv:${conversationId}`) requires active authorization: the gateway queries the database via `TenantTransactionRunner` confirming the conversation belongs to the socket's active tenant. Unauthorized attempts are rejected with error events.
- All real-time event broadcasts (`conversation:created`, `conversation:status_changed`, `message:created`) occur strictly *after* database transactions commit, preventing phantom events.

### 3.3 Customer Identity Mapping & Strict Display-Name Collision Defense
- Customer channel identities decouple external channel identifiers (`externalId`, E.164 phone, Instagram scoped ID, web visitor ID) from internal `Customer` records with `UNIQUE(channel_id, external_id)`.
- **Strict Collision Defense Invariant:** The system strictly rejects automatic customer merging based on display name alone. Common names across channels remain distinct customer records.
- Merges require either verified matching identifiers (e.g. verified E.164 phone or email) or an authorized agent manual merge operation.
- Merges re-parent identities and conversations within an interactive transaction and log an immutable audit snapshot in `customer_merge_audits`.

### 3.4 AI Assistant Governance, Guardrails & Cost Ledger Separation
- **Instruction Governance:** AI instructions follow a strict lifecycle (`DRAFT` -> `APPROVED` -> `ACTIVE`). The AI assistant never silently alters its approved instructions based on user conversation.
- **Prompt Injection Framing Defense:** Customer messages are strictly encapsulated within `<customer_message>` XML tags, with system prompts enforcing precedence of approved business policy over user instructions.
- **Cost Accounting Separation:**
  - `ai_requests`: Logical customer turns (idempotent, tenant-scoped).
  - `ai_request_attempts`: Physical provider attempts recording platform COGS liabilities (`incurred_cost_usd`, `cost_reconciliation_status`).
  - `ai_usage_events`: Exactly-once customer billing events (`UNIQUE(request_id)`).
  - Rates are resolved dynamically from `ai_model_pricing_schedules`; unpriced models fail closed.
- **Human Takeover Protocol:** AI suggestions and automated replies automatically abstain with reason `HUMAN_TAKEOVER` when conversations are assigned to human agents, snoozed, or resolved.

### 3.5 Website Chat Widget Ingress Security & Visitor Capability Separation
- **Narrow Security-Definer Resolution (`resolve_widget_channel`):** Anonymous website visitors resolve channel existence and configuration via a dedicated security-definer function owned by `orbit_migrator` and granted to `orbit_app`, without granting uncontrolled table-wide access to `channels`.
- **Capability Separation Guard (`WidgetGuard`):** Visitor tokens are signed with `WIDGET_JWT_SECRET` and carry claim `{ type: 'WIDGET_VISITOR' }`. `JwtAuthGuard` explicitly rejects visitor tokens on dashboard routes with `403 Forbidden`.
- **Origin Validation:** Validates `Origin` header against `channel.config.allowedDomains`.
- **Visitor Continuity:** Persistent visitor ID in `localStorage` maps to `customer_channel_identities` (`WEB_CHAT`) without duplicate customer creation.

### 3.6 Safe Automation Engine & SLA Analytics
- **Safe Condition Evaluation:** Evaluates structured condition trees (`EQUALS`, `CONTAINS`, `STARTS_WITH`, `IN`) using a pure Abstract Syntax Tree (AST) interpreter, eliminating dynamic code evaluation or script injection vulnerabilities.
- **Immutable Execution Audits:** Every rule execution records trigger, matched rule, action payload, and timestamp in `automation_execution_audits`.
- **SLA Metrics Calculation:** Calculates conversation volume, status breakdowns, sender distribution, and First Response Time (FRT) in milliseconds using real relational SQL queries executed within tenant RLS boundaries.

### 3.7 Idempotent Queue Consumer Scoping
- Background worker processor (`OrbitWorkerProcessor`) mandates `organizationId` payload and unique `jobId`.
- Duplicate job deliveries are detected and skipped without re-executing handlers.
- Worker processing executes exclusively inside `TenantTransactionRunner.runWithTenant(job.data.organizationId)`.

---

## 4. Fresh Verification Evidence & Quality Gates

### 4.1 Automated Test Suites (Vitest)
Fresh execution across all 17 test suites:
```
Test Files  17 passed (17)
     Tests  198 passed (198)
  Duration  36.13s
```
- Unit tests: Client refresh coordination, Web Locks mutex, fail-closed fallbacks, JWT configuration validation.
- Integration tests: Database permissions, tenant isolation, authentication lifecycle, security pass, HTTP CORS/CSRF, API bootstrap, conversations, agent inbox API, real-time gateway, customers, AI assistant, website widget, automations & analytics.
- Real Browser tests: Multi-tab headless Chromium verifying Web Locks mutex serialization, replay detection, concurrent trials, tab closure handoff, cross-tab account switch isolation, and login after logout epoch barriers.

### 4.2 Static Quality Gates
- **TypeScript Typecheck:** `tsc --build` — **Exit code 0** across all 9 workspaces.
- **ESLint Quality Gate:** `eslint .` — **Exit code 0** with zero errors or warnings.
- **Production Workspace Build:** `npm run build` — **Exit code 0** across all 9 workspaces (`@orbit/config`, `@orbit/integrations`, `@orbit/shared`, `@orbit/ui`, `@orbit/validation`, `@orbit/api`, `@orbit/web`, `@orbit/widget`, `@orbit/worker`).

### 4.3 GitHub Actions CI Verification
Every Milestone 2 slice was pushed to `origin/main` and verified against GitHub Actions CI:
- **CI Run #44274744751:** Slice 2.1 (Conversation Foundation) — **Success**
- **CI Run #44276052332:** Slice 2.2 (Agent Inbox Dashboard UI) — **Success**
- **CI Run #44293770597:** Slice 2.3 (Real-Time WebSocket Gateway) — **Success**
- **CI Run #44297005128:** Slice 2.4 (Customer Identity & Merging) — **Success**
- **CI Run #44299625312:** Slice 2.5 (AI Assistant & Cost Ledger) — **Success**
- **CI Run #44315972086:** Slice 2.6 (Website Chat Widget) — **Success**
- **CI Run #44318404321:** Slice 2.7 (Automations & SLA Analytics) — **Success**

---

## 5. What Cannot Be Verified / Deferred to Milestone 3

In adherence to Gravitas Invariant 6 (*Say what cannot be verified*):
1. **Live Meta WhatsApp / Instagram Cloud APIs:** Live webhook ingestion from Meta Graph API servers was verified using deterministic HMAC-SHA256 signature verification and simulated adapter payloads. Live vendor verification requires registered Meta Business Manager credentials, planned for Milestone 3.
2. **Production OpenAI / Anthropic Credit Billing:** Verified with `MockAiProvider` and relational model pricing schedule calculations. Real token consumption against vendor credit balances will be verified in live staging.
3. **AWS S3 Cloud Storage:** Local filesystem storage abstraction verified. Direct cloud S3 multipart uploads will be validated in cloud deployment phases.
4. **Stripe Billing & Subscriptions:** Out of scope for Milestone 2; formal billing integration is scheduled for Milestone 3.

---

## 6. Sign-Off & Progression to Milestone 3

All Milestone 2 acceptance criteria across Modules 2, 3, 4, 5, 6, 7, 8, and 9 of `docs/PROJECT_CONTEXT.md` have been implemented, hardened, verified locally (198/198 tests green, typecheck/lint/build clean), documented in architectural decisions (Decisions 23–29), and confirmed 100% green on GitHub Actions CI.

**Milestone 2 is officially CLOSED and SIGNED OFF.**  
The repository is primed and ready for **Milestone 3 (Multi-Channel Ingress, Meta Webhooks & Commercial Billing Foundation)**.
