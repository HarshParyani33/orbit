# PROJECT ORBIT — MILESTONE 1 IMPLEMENTATION REPORT
## Foundation, Multi-Tenant Security, Authentication & Minimal Dashboard

**Report Version:** `1.0.0`  
**Milestone:** `Milestone 1 — Foundation, Multi-Tenant Security, Authentication & Minimal Dashboard`  
**Execution Date:** `2026-11-06`  
**Architectural Contract:** `docs/ARCHITECTURE.md` v1.1.5  
**Decisions Document:** `docs/decisions/MILESTONE_1_DECISIONS.md`  
**Governance Runtime:** `Gravitas Core Skill Mode (6 Invariants Enforced)`  
**Implementation Verdict:** **SUCCESS — ALL GATES & INTEGRATION TESTS PASSED (29/29)**

---

## 1. Executive Summary

Milestone 1 of Project Orbit has been implemented in accordance with the approved architecture specification (`docs/ARCHITECTURE.md` v1.1.5). 

The delivered system establishes:
1. **Monorepo Architecture:** Native npm workspaces unifying 9 typed workspaces (`@orbit/api`, `@orbit/web`, `@orbit/worker`, `@orbit/widget`, `@orbit/shared`, `@orbit/validation`, `@orbit/config`, `@orbit/ui`, `@orbit/integrations`).
2. **Local Infrastructure:** Docker Compose running PostgreSQL 16 (`pgvector/pgvector:pg16`) and Redis 7 Alpine (`redis:7-alpine`) with health checks and persistent volumes.
3. **PostgreSQL Security & Database Roles:** Strict separation across `orbit_migrator` (DDL owner, `NOSUPERUSER, BYPASSRLS`), `orbit_app` (runtime application, `NOSUPERUSER, NOBYPASSRLS`), and `orbit_ingress` (pre-tenant routing, `NOSUPERUSER, ZERO Table Access`).
4. **Categorized Explicit Grants (Zero Blanket Default DML):** Table privileges strictly partitioned into Categories A (tenant tables), B (read-only pricing catalogs), C (zero-table-access routing lookups), and D (application-guarded identity tables).
5. **Interactive Tenant Isolation:** `TenantTransactionRunner` executing interactive PostgreSQL transactions with `SET LOCAL app.current_org_id` via parameterized `$queryRaw`, guarded by `FORCE ROW LEVEL SECURITY`.
6. **Robust Authentication Foundation:** Argon2id password hashing, HTTP-only secure cookies, short-lived JWT access tokens, rotated refresh tokens, and automatic theft/reuse detection that immediately revokes compromised session families.
7. **Organization Membership & Tenant Authorization:** `TenantGuard` verifying active workspace memberships on every tenant-scoped operation.
8. **Minimal Authenticated Dashboard:** React 18+ Vite SPA with Tailwind CSS, React Hook Form, and TanStack Query featuring login, registration, workspace switching, and live channel management.
9. **Real Database Integration Test Suite:** 29 integration tests executing against real PostgreSQL 16 proving RLS cross-tenant isolation, role privilege boundaries, and authentication lifecycle.

---

## 2. Gravitas Diagnostic Status & Operating Mode

Diagnostic execution of `python .agents/skills/gravitas/scripts/doctor.py`:

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

- **Operating Mode:** **Core Skill Mode** (prompt-based behavioral discipline, decision records, evidence-backed verification).
- **Execution Invariants:** Ground before mutating, stay in declared scope, completion needs fresh evidence, never exact-retry a failure, satisfy the contract, say what cannot be verified.
- **Decision Record:** Authored and locked at `docs/decisions/MILESTONE_1_DECISIONS.md` before code mutation.

---

## 3. Monorepo Workspaces & Package Details

| Workspace | Package Name | Responsibility | Tech Stack |
|---|---|---|---|
| `packages/shared` | `@orbit/shared` | Core enums (`Role`, `OrgStatus`, `UserStatus`), interfaces (`TenantContext`, `ApiResponse`), error classes | TypeScript 5.7 (strict) |
| `packages/validation` | `@orbit/validation` | Zod validation schemas for auth (`registerSchema`, `loginSchema`) and organizations | Zod 3.24 |
| `packages/config` | `@orbit/config` | Centralized environment variable validation (`DATABASE_URL`, `JWT_SECRET`, etc.) | Dotenv, Zod |
| `packages/ui` | `@orbit/ui` | Reusable React component primitives (`Button`, `Card`) | React 18, Tailwind CSS |
| `packages/integrations` | `@orbit/integrations` | Channel adapter interface contracts (`IChannelAdapter`) | TypeScript 5.7 |
| `apps/api` | `@orbit/api` | NestJS modular monolith API with Prisma, Argon2id, JWT cookies, TenantGuard | NestJS 10, Prisma 5.22, Argon2 |
| `apps/web` | `@orbit/web` | React SPA dashboard with workspace switcher, channels overview, login/register | React 18, Vite 6, Tailwind CSS, TanStack Query |
| `apps/worker` | `@orbit/worker` | Asynchronous worker process foundation (BullMQ consumer ready) | TypeScript 5.7, Node.js 24 |
| `apps/widget` | `@orbit/widget` | Embeddable customer chat widget foundation skeleton | TypeScript 5.7 |

---

## 4. Local Infrastructure & Database Security

### 4.1 Running Infrastructure
PostgreSQL 16 and Redis 7 were launched and verified healthy via Docker Compose:

```bash
$ docker ps
CONTAINER ID   IMAGE                    STATUS                    PORTS                    NAMES
bfd18283a3c0   pgvector/pgvector:pg16   Up 35 minutes (healthy)   0.0.0.0:5432->5432/tcp   orbit_postgres
b5affc1b8437   redis:7-alpine           Up 35 minutes (healthy)   0.0.0.0:6379->6379/tcp   orbit_redis
```

### 4.2 Database Role Least-Privilege Hierarchy
Verified by direct database inspection:
- `orbit_migrator`: `rolsuper: false, rolbypassrls: true` (owns schema `public`, executes DDL migrations).
- `orbit_app`: `rolsuper: false, rolbypassrls: false` (runtime application, cannot execute DDL, governed strictly by RLS).
- `orbit_ingress`: `rolsuper: false, rolbypassrls: false` (webhook ingress role, possesses ZERO table access).

### 4.3 Categorized Explicit Grants
Blanket default DML (`ALTER DEFAULT PRIVILEGES ... GRANT DML TO orbit_app`) is **strictly prohibited**. Instead, permissions are granted by category:
- **Category A (Tenant Tables — RLS Governed):** `channels`, `conversations`, `messages` -> `GRANT SELECT, INSERT, UPDATE, DELETE TO orbit_app;`.
- **Category B (System Reference Catalogs — Read-Only):** `ai_model_pricing_schedules` -> `GRANT SELECT TO orbit_app;` (DML revoked).
- **Category C (Routing Metadata — Zero Table Access):** `channel_routing_lookups` -> `REVOKE ALL FROM PUBLIC, orbit_app, orbit_ingress;` (accessed strictly via `SECURITY DEFINER` functions).
- **Category D (Global Identity — Application Guarded):** `users`, `user_sessions`, `organizations`, `organization_memberships` -> `GRANT SELECT, INSERT, UPDATE, DELETE TO orbit_app;` (guarded by `AuthService` and `TenantGuard`).
- **Ingress Zero Access:** `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM orbit_ingress;`.

### 4.4 Applied Database Migrations
Applied versioned migration `prisma/migrations/20261106000000_init/migration.sql`:
- Global identity and session tables.
- Tenant domain tables with composite unique constraints `(id, organization_id)` and composite foreign keys.
- Exclusion constraint `ex_pricing_no_overlap` on `ai_model_pricing_schedules` using `btree_gist`.
- Currency constraint `CONSTRAINT chk_pricing_currency_usd CHECK (currency = 'USD')`.
- Security Definer functions: `resolve_channel_routing`, `register_channel_routing`, `deregister_channel_routing` with `SET search_path = public, pg_temp`.
- Row-Level Security policies on `channels`, `conversations`, and `messages`.

---

## 5. Multi-Tenant Isolation & TenantTransactionRunner

### 5.1 Interactive Transaction Implementation
`TenantTransactionRunner.runWithTenant(organizationId, fn)` establishes tenant context inside an interactive transaction:
```typescript
await tx.$queryRaw(
  Prisma.sql`SELECT set_config('app.current_org_id', ${organizationId}, true)`
);
return fn(tx);
```
- The third parameter `true` sets `is_local = true` (`SET LOCAL`). Upon transaction `COMMIT` or `ROLLBACK`, PostgreSQL immediately discards the session parameter, guaranteeing that pooled connections cannot leak tenant context to subsequent requests.
- All protected queries execute strictly through the interactive transaction client `tx`.

### 5.2 Verification Evidence (RLS Fail-Closed Guarantees)
- **Cross-Tenant Reads:** Tenant A querying Tenant B's data returns **0 rows**.
- **Cross-Tenant Writes:** Tenant A attempting to update Tenant B's record affects **0 rows**.
- **Cross-Tenant Inserts:** Tenant A attempting to insert with Tenant B's `organizationId` throws PostgreSQL RLS violation:
  `ConnectorError: PostgresError { code: "42501", message: "new row violates row-level security policy for table \"conversations\"" }`.
- **Missing Context:** Executing queries without setting `app.current_org_id` returns **0 rows** on reads and throws **42501 policy violation** on writes.
- **Omitted WHERE Clause:** Unfiltered queries (`tx.channel.findMany()`) strictly return only rows belonging to the active tenant.

---

## 6. Authentication, Sessions & Organization Membership

### 6.1 Cryptographic Password Security
- Passwords hashed using **Argon2id** (`argon2.argon2id`, memoryCost: 64MB, timeCost: 3). Raw passwords are never persisted.

### 6.2 Token & Session Lifecycle
- **Access Tokens:** 15-minute JWT signed with `JWT_SECRET`, carried in HTTP-only, `SameSite=Lax` cookie.
- **Refresh Tokens:** 32-byte cryptographically secure random token, hashed with SHA-256 before storage in `user_sessions`. 30-day expiration.
- **Rotation & Theft Detection:** Every refresh consumes the existing session and issues a new pair. If an already-rotated (consumed) token is presented:
  `UnauthorizedException: Security alert: Attempted reuse of rotated refresh token. All active sessions have been revoked.`
  All active sessions in that session family are immediately revoked.
- **Logout:** Explicitly revokes session record and clears cookies.

### 6.3 Organization Membership & TenantGuard
- `TenantGuard` extracts target organization from `X-Organization-Id` header, query, or body.
- Queries `organization_memberships` (`WHERE userId = :userId AND organizationId = :orgId AND status = 'ACTIVE'`).
- If membership does not exist or is inactive, returns `403 Forbidden` (`Access denied: You are not an active member of the requested organization`).
- Attaches verified `TenantContext { userId, orgId, role, email }` to request.

---

## 7. Minimal Authenticated Dashboard

The frontend application (`apps/web`) is built with React 18, Vite, Tailwind CSS, TanStack Query, and React Hook Form:
- **Authentication Flow:** Login and Registration screens with client-side Zod validation and server error displays.
- **Navigation Shell:** Header displaying Project Orbit brand, user avatar, role badge, organization switcher dropdown, and logout.
- **Active Workspace Overview:** Displays active organization name, slug, tenant ID, and membership role.
- **Live Channel Management:** Fetches and displays communication channels strictly for the active tenant using `TenantGuard` and `TenantTransactionRunner`. Includes inline channel creation modal.
- **Multi-Tenant Verification:** Switching organizations in the navbar dropdown immediately switches the active tenant context, refreshing the channel list without cross-tenant data contamination.

---

## 8. Real Execution Evidence & Test Results

### 8.1 Integration Test Suite Execution
Executed against real PostgreSQL 16:

```bash
$ npm run test:integration
```
```text
 ✓ tests/integration/db-permissions.spec.ts (11 tests) 361ms
 ✓ tests/integration/tenant-isolation.spec.ts (7 tests) 337ms
 ✓ tests/integration/auth.spec.ts (11 tests) 863ms

 Test Files  3 passed (3)
      Tests  29 passed (29)
   Duration  4.48s
```

#### Detailed Test Coverage Breakdown:
1. `tests/integration/db-permissions.spec.ts` (11 tests):
   - `orbit_app` is not superuser and has no BYPASSRLS or CREATEDB: **PASS**
   - `orbit_app` cannot execute DDL (`CREATE TABLE` throws permission denied): **PASS**
   - `orbit_app` can SELECT from `ai_model_pricing_schedules`: **PASS**
   - `orbit_app` CANNOT INSERT into `ai_model_pricing_schedules`: **PASS**
   - `orbit_app` CANNOT UPDATE or DELETE `ai_model_pricing_schedules`: **PASS**
   - `orbit_app` CANNOT directly query `channel_routing_lookups`: **PASS**
   - `orbit_app` CANNOT execute `resolve_channel_routing()`: **PASS**
   - `orbit_ingress` is not superuser and has no BYPASSRLS: **PASS**
   - `orbit_ingress` has ZERO direct table access (`users`, `channels`, etc.): **PASS**
   - `orbit_ingress` CAN execute `resolve_channel_routing()`: **PASS**
   - `ai_model_pricing_schedules` rejects non-USD currency with `CHECK` violation: **PASS**

2. `tests/integration/tenant-isolation.spec.ts` (7 tests):
   - Tenant A reads own channels inside tenant context: **PASS**
   - Tenant A cannot read Tenant B channels (RLS blocks cross-tenant reads): **PASS**
   - Tenant A cannot update Tenant B records (affects 0 rows): **PASS**
   - Tenant A inserting record with Tenant B `organization_id` fails with RLS violation: **PASS**
   - Missing tenant context fails closed (0 rows returned or policy violation): **PASS**
   - Connection pool parameter leak prevention (`SET LOCAL` discarded on commit): **PASS**
   - Omitted application WHERE filter is still completely isolated by RLS: **PASS**

3. `tests/integration/auth.spec.ts` (11 tests):
   - User registration with Argon2id password hash and default organization: **PASS**
   - Duplicate registration rejected (409 Conflict): **PASS**
   - Valid login returns tokens and session: **PASS**
   - Invalid password rejected (401 Unauthorized): **PASS**
   - Non-existent email rejected (401 Unauthorized): **PASS**
   - Refresh token rotation issues new valid pair and revokes consumed token: **PASS**
   - Theft reuse detection revokes all sessions in family upon replaying consumed token: **PASS**
   - Session revocation and logout: **PASS**
   - User cannot access organization they do not belong to: **PASS**
   - Organization owner can invite member with role: **PASS**
   - Non-admin member cannot invite members (403 Forbidden): **PASS**

### 8.2 Monorepo Production Build Execution
```bash
$ npm run build
```
```text
> @orbit/config@0.1.0 build -> tsc --build (PASS)
> @orbit/integrations@0.1.0 build -> tsc --build (PASS)
> @orbit/shared@0.1.0 build -> tsc --build (PASS)
> @orbit/ui@0.1.0 build -> tsc --build (PASS)
> @orbit/validation@0.1.0 build -> tsc --build (PASS)
> @orbit/api@0.1.0 build -> tsc --build (PASS)
> @orbit/web@0.1.0 build -> tsc && vite build (PASS - built in 11.11s)
> @orbit/widget@0.1.0 build -> tsc --build (PASS)
> @orbit/worker@0.1.0 build -> tsc --build (PASS)
```

### 8.3 Monorepo Typecheck & Lint Execution
```bash
$ npm run typecheck
> tsc --build (Exit code: 0, zero errors)

$ npm run lint
> eslint . (Exit code: 0, zero errors, zero warnings)
```

---

## 9. Known Limitations, Deferred Work & Remaining Risks

Following Gravitas Invariant 6 (*Say what you cannot verify*):
1. **Deferred Webhook Ingestion & Standalone Ingress Deployment:**
   - As documented in `docs/decisions/MILESTONE_1_DECISIONS.md`, live webhook ingestion (Meta WhatsApp, Instagram, Stripe) and standalone deployment of `apps/ingress` are strictly deferred to Milestone 2.
   - The database role `orbit_ingress` with zero table access was created and verified in PostgreSQL, but live internet webhook handshakes are deferred.
2. **Deferred Outbound Messaging & AI Inference:**
   - Real WhatsApp/Instagram Graph API messaging, OpenAI LLM inference, and RAG vector searches are out of scope for Milestone 1. Provider contracts sit ready in `packages/integrations`.
3. **WSL2 Local Development Network Boundary:**
   - On Windows with WSL2, Docker containers listen on the WSL host interface (`172.28.46.91:5432`). `.env` is configured with this IP to guarantee direct connection without relying on Windows localhost port forwarding proxies.

---

## 10. Recommended Next Milestone

**Milestone 2: Omnichannel Ingress, Transactional Outbox & Provider Messaging Adapters**
- Activate BullMQ workers in `apps/worker` with Redis connection.
- Deploy `apps/ingress` service holding `INGRESS_DATABASE_URL` for cryptographic HMAC signature verification.
- Implement transactional outbox (`webhook_events`) with dual dispatch (immediate enqueue + background sweeper with `FOR UPDATE SKIP LOCKED`).
- Implement omnichannel messaging adapters with mock and live provider modes for Website Chat, WhatsApp Cloud API, and Instagram Messaging.
- Activate the `UNKNOWN_OUTCOME` quarantine and operator console protocol.

---

*End of Milestone 1 Implementation Report.*
