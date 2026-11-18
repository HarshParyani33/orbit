# PROJECT ORBIT — MILESTONE 1 ARCHITECTURAL DECISIONS

**Decision Record ID:** `M1-DEC-20261106`  
**Status:** `ACCEPTED`  
**Date:** `2026-11-06`  
**Milestone:** `Milestone 1 — Foundation, Multi-Tenant Security, Authentication & Minimal Dashboard`  
**Governance:** `Gravitas Core Skill Mode (6 Invariants Strictly Enforced)`

---

## 1. Operating Context & Gravitas Baseline

Diagnostic execution of `python .agents/skills/gravitas/scripts/doctor.py` confirms:
- `gravitas_core_detected: true`
- `core_path: H:\orbit-saas\.agents\skills\gravitas`
- `canonical_skill_sha256: 093c91dd12d1c78dee3fd31f93b1aad7aea454e7fe17f9b1f0f9a9cca7674553`
- Operating Mode: **Core Skill Mode** (prompt-based behavioral discipline, decision records, evidence-backed verification).

### Six Invariants Mandate
1. **Ground before mutating:** Inspect environment, configuration, and dependencies before writing code.
2. **Stay in declared scope:** Confine work strictly to Milestone 1 foundation. No premature AI, webhooks, or messaging.
3. **Completion needs fresh evidence:** Run tests, type checks, and builds, capturing real outputs.
4. **Never exact-retry a failure:** Diagnose root causes before re-running failed steps.
5. **Satisfy the contract:** Comply with `docs/ARCHITECTURE.md` v1.1.5 security and relational specifications.
6. **Say what cannot be verified:** Disclose environment, tooling, and mock boundaries explicitly.

---

## 2. Key Architectural Decisions & Implementation Gates

### Decision 1: Global Identity Tables Scope & Security Boundary
- **Context:** Global identity tables (`users`, `user_sessions`, `organizations`, `organization_memberships`) span multiple workspaces or represent authentication state without a single `organization_id`.
- **Decision:**
  - We do **not** apply tenant RLS policies to global identity tables. Claiming RLS protects them would be misleading.
  - In PostgreSQL, runtime database role `orbit_app` is granted explicit Category D permissions (`SELECT, INSERT, UPDATE, DELETE`) strictly for identity operations.
  - Access is encapsulated exclusively inside narrow, dedicated services (`AuthService`, `MembershipService`). General tenant controllers/repositories are prohibited from querying global identity tables directly.
  - Authorization checks (session validity, active membership, role permissions `OWNER`/`ADMIN`/`MEMBER`) are strictly enforced on every request by `TenantGuard`.
  - Database permission tests verify that `orbit_app` is `NOSUPERUSER, NOBYPASSRLS` and has no unauthorized DDL or bypass privileges.

### Decision 2: Deferral of `apps/ingress` and Real Webhook Integrations
- **Context:** `docs/ARCHITECTURE.md` specifies an isolated ingress service (`apps/ingress`) and recoverable webhook outbox.
- **Decision:**
  - Milestone 1 is strictly locked to foundational infrastructure: Monorepo, Database RLS, Authentication, Organizations, and Minimal Dashboard.
  - Real webhook integrations (Meta WhatsApp, Instagram, Stripe) and standalone deployment of `apps/ingress` are **deferred** to Milestone 2.
  - To fulfill the database security contract, the database role `orbit_ingress` is provisioned with **zero table access** (`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM orbit_ingress;`), and its restricted permissions are verified via automated permission integration tests.
  - Webhook processing and `UNKNOWN_OUTCOME` quarantine handlers will be implemented in Milestone 2 when the BullMQ worker and outbox sweepers are activated.

### Decision 3: Monorepo Structure & Dependency Management
- **Context:** A typed, modular monolith repository is required.
- **Decision:**
  - Use native **npm workspaces** with Node.js v24 LTS.
  - Monorepo structure:
    - `apps/web`: React 18+, Vite, Tailwind CSS, TanStack Query, React Hook Form, Zod.
    - `apps/api`: NestJS 10, Prisma Client, `@nestjs/jwt`, `argon2`, `cookie-parser`.
    - `apps/worker`: Worker foundation skeleton (BullMQ, Redis).
    - `apps/widget`: Embeddable widget package foundation.
    - `packages/shared`: Common types, interfaces, enums, constants.
    - `packages/validation`: Shared Zod validation schemas.
    - `packages/config`: Validated environment configuration.
    - `packages/ui`: Shared component primitives.
    - `packages/integrations`: Provider adapter interface contracts.
    - `prisma`: Schema, migrations, database seeder.
  - Shared TypeScript configurations with strict mode (`tsconfig.base.json`).

### Decision 4: Tenant Isolation & `TenantTransactionRunner`
- **Context:** Multi-tenancy requires ironclad defense-in-depth against data leakage across workspaces.
- **Decision:**
  - Multi-tenancy is enforced at two distinct layers:
    1. **Application Layer:** `TenantGuard` extracts and validates user membership in the requested organization before routing to domain handlers.
    2. **Database Layer:** `TenantTransactionRunner` executes an interactive PostgreSQL transaction (`tx`) and initializes `SELECT set_config('app.current_org_id', :orgId, true)`.
  - The parameter `is_local = true` makes the setting transaction-scoped (`SET LOCAL`). Upon `COMMIT` or `ROLLBACK`, PostgreSQL automatically clears the parameter, preventing connection pool parameter leakage.
  - RLS policies use `USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)`. Missing or unset tenant context evaluates to `NULL` (falsy), immediately failing closed on all reads (0 rows) and writes (policy violation).
  - All protected domain tables include composite foreign keys `(id, organization_id)` referencing parent records in the same tenant.

### Decision 5: Authentication & Session Security
- **Context:** Secure SaaS authentication requiring protection against password compromise, session hijacking, and token theft.
- **Decision:**
  - **Passwords:** Hashed with **Argon2id** (`argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3 })`). Raw passwords are never persisted.
  - **Access Tokens:** Short-lived JWTs (15 minutes) signed with `JWT_SECRET`. Carried in HTTP-only, `SameSite=Lax`, `Secure` (in production) cookies.
  - **Refresh Tokens:** Cryptographically random tokens (32 bytes hex) hashed with SHA-256 before storage in `user_sessions`. Stored in HTTP-only cookies with a 30-day lifetime.
  - **Refresh Token Rotation & Theft Detection:** Every token refresh revokes the existing refresh token and issues a new pair. If an already-rotated (consumed) token is presented, the system detects a potential replay/theft attack and immediately revokes all active sessions for that user.
  - **Logout:** Explicitly deletes the session record from `user_sessions` and clears cookies on the client.

### Decision 6: Local Infrastructure & Verification Strategy
- **Context:** Integration tests must run against real PostgreSQL 16 with pgvector and Redis 7.
- **Decision:**
  - `docker-compose.yml` provisions PostgreSQL 16 (`pgvector/pgvector:pg16`) and Redis 7 (`redis:7-alpine`) with health checks and persistent volume mounts.
  - Separate database roles configured via initialization SQL: `orbit_migrator` (migration owner), `orbit_app` (runtime application), `orbit_ingress` (webhook ingress).
  - Categorized table grants applied explicitly without blanket default DML.
  - Integration tests verify RLS tenant isolation, role permission boundaries, and authentication workflows against real PostgreSQL.

### Decision 7: Route Parameter & Tenant Context Invariant (IDOR Defense-in-Depth)
- **Context:** Potential Insecure Direct Object Reference (IDOR) if route parameters (e.g. `:id` in `/api/organizations/:id`) diverge from the verified `tenantContext` or header.
- **Decision:**
  - In `TenantGuard`: If a route parameter specifies an organization ID (`params.id`, `params.orgId`, `params.organizationId`), it MUST match the `X-Organization-ID` header if both are supplied. A mismatch immediately throws `ForbiddenException`.
  - In `OrganizationsController`: Handlers strictly verify `orgId === tenant.orgId` before dispatching domain queries, and domain reads use `tenant.orgId` directly.
  - User membership and active status are verified against the route-specified tenant before the handler is invoked.

### Decision 8: Atomic Refresh Token Rotation with Row Locking (FOR UPDATE)
- **Context:** Non-atomic read-then-update in refresh token rotation allows concurrent requests with the identical refresh token to both issue new active sessions, avoiding theft detection.
- **Decision:**
  - `AuthService.refresh` executes inside an interactive transaction (`prisma.$transaction`) with a PostgreSQL row lock: `SELECT ... FOR UPDATE OF s`.
  - The first request claims and marks `is_revoked = true` and issues the next token pair under the same `family_id`.
  - Any concurrent or subsequent request presenting the same token is serialized behind the row lock, reads `is_revoked = true`, immediately triggers theft detection by revoking the entire `family_id`, commits the revocation, and throws 401 Unauthorized.

### Decision 9: Cross-Site Request Forgery (CSRF) Protection
- **Context:** Cookie-based session authentication exposes state-mutating HTTP endpoints to ambient cross-site requests if Origin headers are unchecked.
- **Decision:**
  - A global `CsrfGuard` intercepts all state-changing HTTP methods (`POST`, `PUT`, `PATCH`, `DELETE`).
  - Safe methods (`GET`, `HEAD`, `OPTIONS`) and programmatic Bearer token requests (without ambient auth cookies) bypass the check.
  - For cookie-authenticated mutations, `Origin` and `Referer` headers are validated against an allowed origin whitelist (`FRONTEND_URL`, `http://localhost:5173`, etc.). If absent, a custom security header (`X-CSRF-Token`, `X-Requested-With`) is required. Mismatched or unauthorized origins are rejected with 403 Forbidden.

### Decision 10: Registration Transaction Atomicity
- **Context:** Multi-step registration (User, Organization, Owner Membership, Session) outside a transaction risks orphaned records on downstream failures.
- **Decision:**
  - `AuthService.register` is wrapped in `prisma.$transaction(async (tx) => ...)`.
  - User creation, slug reservation, organization creation, owner membership assignment, and initial session creation succeed or fail as an indivisible atomic unit. If any step fails, PostgreSQL rolls back all mutations, leaving zero orphaned records.

### Decision 11: CORS Preflight Allowed Headers Alignment & HTTP Integration Verification
- **Context:** The frontend attaches `X-Requested-With: XMLHttpRequest` for CSRF defense on state mutations, but the API CORS `allowedHeaders` omitted `X-Requested-With`, causing browser OPTIONS preflights to fail on credentialed cross-origin requests.
- **Decision:**
  - Explicitly include `X-Requested-With` in API CORS `allowedHeaders` alongside `Content-Type`, `Authorization`, `X-Organization-Id`, and `X-CSRF-Token`.
  - Refactor app configuration into a shared `configureApp(app: INestApplication)` helper in `apps/api/src/app.config.ts`, reused identically in production `main.ts` and in an HTTP-level integration test suite (`tests/integration/http-cors-csrf.spec.ts`).
  - Maintain strict origin verification (`origin: process.env.FRONTEND_URL || 'http://localhost:5173'`) and `credentials: true`. Strictly prohibit wildcard origins.

### Decision 12: Safe Unpredictable Development Password Placeholder
- **Context:** `.env.example` previously contained a predictable example password (`postgres_master_dev_password`), risking accidental deployment with known defaults.
- **Decision:**
  - Replace the example superuser password in `.env.example` with an unmistakable placeholder: `POSTGRES_PASSWORD=CHANGE_ME_GENERATE_RANDOM_SECRET_FOR_POSTGRES_SUPERUSER`.
  - Document manual setup instructions (e.g. `openssl rand -hex 32`) for developers.
  - Preserve `docker-compose.yml` required variable validation: `${POSTGRES_PASSWORD:?}` with zero default fallback.
  - Keep `.env` strictly ignored by `.gitignore`.

### Decision 13: Stale 401 Interception via Monotonic Timestamp Guard
- **Context:** If a request receives a stale 401 immediately after a concurrent refresh promise has already settled, triggering another refresh could send an already-consumed or redundant refresh token, risking server-side theft revocation.
- **Decision:**
  - In `apps/web/src/api/client.ts`, track the monotonic timestamp of the last successful token refresh (`lastRefreshTime = performance.now()`).
  - Record the dispatch timestamp (`requestTime = performance.now()`) for each request.
  - If a 401 is received and `lastRefreshTime > requestTime`, recognize that a token refresh already succeeded while the request was in flight. Immediately retry the request once (`_retry: true`) with the updated ambient credentials without dispatching another refresh call.

### Decision 14: Cross-Tab Refresh Token Coordination via Web Locks API & Shared Storage Guard
- **Context:** Finding 1 — Module-level memory state (`refreshPromise`, `lastSuccessfulRefreshTime`) protects concurrent requests within a single JavaScript execution context (tab), but does not coordinate across independent browser tabs sharing the same origin and HTTP-only cookie store. Two concurrent tabs receiving 401 simultaneously would both call `/api/auth/refresh`; the second request would present an already-consumed token, triggering emergency session family revocation.
- **Decision:**
  - Implement cross-tab refresh coordination in `apps/web/src/api/client.ts` using the standard W3C Web Locks API (`navigator.locks.request('orbit_auth_refresh', ...)`).
  - The Web Locks API is natively supported in all modern browser targets (Chrome 69+, Edge 79+, Firefox 96+, Safari 15.4+) and guarantees automatic lock release if the holding tab crashes or terminates.
  - While Tab 1 holds the exclusive lock and performs the refresh request, Tab 2 queues for the lock.
  - When Tab 1 succeeds, it updates `localStorage.setItem('orbit_last_refresh_timestamp', String(Date.now()))`.
  - When Tab 2 acquires the lock, it evaluates whether a refresh completed after its original request dispatch time (`lastRefreshTimestamp > requestDispatchTimestamp`). If so, Tab 2 immediately retries its API request with the fresh rotated cookie without dispatching a second `/api/auth/refresh` request!
  - Sensitive credentials or tokens are NEVER broadcast or stored in `localStorage` — only non-sensitive Unix epoch timestamps.
  - If `navigator.locks` is unavailable (e.g. Node.js unit test runtime or non-secure contexts), gracefully fall back to single-flight in-memory coordination.

### Decision 15: Fail-Fast Startup Configuration & Production JWT Secret Validation
- **Context:** Finding 2 — `apps/api/src/app.module.ts` previously had a hardcoded default fallback (`process.env.JWT_SECRET || 'dev_jwt_secret...'`). Furthermore, `packages/config` environment validation was not enforced during API bootstrap, risking silent execution in production with missing or weak secrets.
- **Decision:**
  - Enforce `getConfig()` validation from `@orbit/config` at the very beginning of API bootstrap in `apps/api/src/main.ts` before NestJS initialization or network socket binding.
  - Remove all hardcoded JWT secret fallbacks from `apps/api/src/app.module.ts`. Register `JwtModule` with secrets obtained strictly from the validated configuration.
  - Update `packages/config/src/index.ts` with strict production validation:
    - In `production`: `JWT_SECRET` is strictly required, minimum 32 characters, and cannot match known development placeholders (`dev_jwt_secret...`, `secret`, `changeme`).
    - In `production`: `COOKIE_SECRET` is strictly required and minimum 32 characters.
    - In `development` / `test`: Allow explicitly documented development secrets if not set in `.env`.
  - In `TokenService`: Ensure both signing and verification use the validated configuration source.
  - Ensure secret values are never logged or exposed in validation error messages.

### Decision 16: Complete HTTP Pipeline CSRF Integration Test Matrix
- **Context:** Finding 3 — Discrepancy between reported HTTP integration test scenarios and actual tests in `tests/integration/http-cors-csrf.spec.ts`. Scenarios for custom CSRF headers (`X-Requested-With`, `X-CSRF-Token`) without Origin were documented in `docs/MILESTONE_1_FINAL_REVIEW.md` but were missing from the real TCP integration test file.
- **Decision:**
  - Add genuine HTTP-level integration tests to `tests/integration/http-cors-csrf.spec.ts` executing over TCP against the live NestJS application for:
    1. Cookie-authenticated mutation with `X-Requested-With: XMLHttpRequest` and NO Origin/Referer (asserts HTTP 200/201).
    2. Cookie-authenticated mutation with `X-CSRF-Token` and NO Origin/Referer (asserts HTTP 200/201).
  - Verify all 8 original scenarios plus the 2 added scenarios (10 HTTP integration tests total), ensuring a 1:1 match between documentation and executable tests.

### Decision 17: Database Role Credential Isolation & Local Development Boundary
- **Context:** Finding 4 — `docker/postgres/init-roles.sql` contained hardcoded passwords (`orbit_app_pass`, `orbit_migrator_pass`, `orbit_ingress_pass`), and `.env.example` documented hardcoded role passwords in connection URLs, risking accidental reuse in production.
- **Decision:**
  - Explicitly document and enforce the security boundary: `docker/postgres/init-roles.sql` and `docker-compose.yml` are strictly for local development and CI testing. Production environments must provision roles via managed infrastructure (e.g. AWS RDS, GCP Cloud SQL) with distinct KMS-rotated secrets.
  - Update `docker/postgres/init-roles.sql` to support environment-driven credential injection using `psql` native `\getenv` with safe SQL variable interpolation (`:'app_pass'`), falling back to local development values only when environment variables are unset.
  - Update `.env.example` to use unmistakable `CHANGE_ME_` placeholders for all database connection strings and role passwords, with clear developer instructions on generating unique secrets.
  - Ensure real `.env` files remain strictly ignored by Git.

### Decision 18: Milestone 1 Autonomous Correction Loop & Final Security Hardening
- **Context:** Review identified four critical residual issues requiring architectural closure:
  1. **API Bootstrap Double Listen Bug:** In `apps/api/src/main.ts`, `app.listen()` was called twice (first with `process.env.PORT || 4000`, then with `config.PORT`). This bypassed validated configuration and risked port collision or unhandled promise rejection.
  2. **Cross-Tab Web Lock Fallback Vulnerability:** In `apps/web/src/api/client.ts`, if lock acquisition failed or timed out, the catch block fell back to `executeSingleFlightRefresh()`, completely bypassing cross-tab mutual exclusion and risking concurrent token rotation and session family theft revocation.
  3. **Database Role Provisioning Password Sanitization:** In `docker/postgres/init-roles.sql`, role creation blocks contained residual hardcoded passwords in `CREATE ROLE` statements, conflicting with dynamic `ALTER ROLE ... WITH PASSWORD :'var'` statements.
  4. **Milestone 1 Documentation Consolidation:** Documentation across review files contained duplicated lines and ambiguous test classifications.
- **Decision:**
  - **18.1 API Single Listen & Single Port Authority:** `apps/api/src/main.ts` enforces `config.PORT` from `@orbit/config` as the sole authoritative port source. `app.listen(config.PORT)` is invoked exactly once. Factor out `createApp()` to enable automated integration testing of application initialization.
  - **18.2 Cross-Tab Refresh Fail-Closed Mutual Exclusion:** In `apps/web/src/api/client.ts`, eliminate the uncoordinated refresh fallback. If lock acquisition fails or times out, inspect if another tab completed refresh (`storedRefresh > dispatchEpoch` or `Date.now() - storedRefresh < 1500`). If so, reuse the freshly rotated cookie. If not, fail closed safely (`setStoredRefreshStatus('failed')`, notify `authFailureHandler()`, and return `false`). Never dispatch an uncoordinated refresh request that bypasses the mutex.
  - **18.3 Role Provisioning Sanitization:** In `docker/postgres/init-roles.sql`, create roles without hardcoded initial passwords (`CREATE ROLE ... WITH LOGIN NOSUPERUSER ...`), and dynamically assign passwords via `ALTER ROLE ... WITH PASSWORD :'var'` using psql `\getenv` and SQL literal interpolation.
  - **18.4 Document Consolidation & Test Taxonomy:** Reconcile all Milestone 1 review artifacts into one authoritative document with a single ID, clean headings, a unified findings table, and precise test classifications distinguishing Real Database Integration Tests, Real HTTP TCP Integration Tests, Simulated Execution Context Tests, and Unit Tests.

### Decision 19: Cross-Tab Refresh Mutual Exclusion Fallback & Real Browser Verification
- **Context:** When the W3C Web Locks API (`navigator.locks`) is unavailable (e.g. non-secure contexts, restricted iframes, older browser engines), `apps/web/src/api/client.ts` previously fell back directly to `executeSingleFlightRefresh()`. In multi-tab scenarios without Web Locks, concurrent tabs receiving 401s would each send `/api/auth/refresh`, causing server-side replay detection to revoke the session family. Furthermore, prior verification of cross-tab coordination used Vitest simulated execution contexts rather than live multi-page browser automation.
- **Decision:**
  - **19.1 Tier-1 Preferred Coordination (Web Locks API):** Retain `navigator.locks.request('orbit_auth_refresh_lock', ...)` as the primary, browser-native cross-tab mutual exclusion mechanism with 10-second timeout guard.
  - **19.2 Tier-2 Fallback Coordination (Two-Phase Staged Election in localStorage):** When `navigator.locks` is unavailable, implement a robust multi-phase candidate ticket election lease:
    1. Check for active lease (`orbit_auth_refresh_lease` with `expiresAt > Date.now()`).
    2. Phase 1: Register unique candidate ticket in `localStorage` (`orbit_auth_candidate_${clientId}`).
    3. Phase 2: Wait arbitration jitter window (40-70ms) to allow concurrent contenders across tabs to write their tickets.
    4. Phase 3: Evaluate all active candidate tickets deterministically (lowest timestamp/priority wins). If this tab lost, back off, clean ticket, and wait for the winner's result.
    5. Phase 4: Winner commits lease (`ownerId`, `expiresAt = Date.now() + 6000`), checks if sibling refreshed during arbitration, executes `executeSingleFlightRefresh()`, updates `storedRefreshEpoch`, and releases lease.
    6. Handlers for stale lease recovery (crashed winner tab after 6000ms TTL) and loop timeout guards.
  - **19.3 Fail-Closed Safety Invariant:** If `localStorage` is unavailable, throwing (e.g. storage disabled, private browsing security error), or fails to achieve coordination before timeout, the client MUST FAIL CLOSED (`setStoredRefreshStatus('failed')`, notify `authFailureHandler()`, return `false`). It must NEVER execute an uncoordinated network refresh that risks token reuse revocation.
  - **19.4 Zero Token/Credential Disclosure:** Storage and messages strictly contain integer timestamps, status strings, or random lease UUIDs. No access tokens, refresh tokens, or cookies are ever written to `localStorage` or `BroadcastChannel`.
  - **19.5 Real Multi-Page Browser Testing:** Author real browser integration tests using Playwright against live system Chrome (`executablePath`) with two independent browser pages in the same browser context sharing cookies, validating:
    1. Concurrent 401 requests across two pages trigger exactly ONE `/api/auth/refresh` request under Web Locks.
    2. Concurrent 401 requests with Web Locks disabled trigger exactly ONE `/api/auth/refresh` request via the Tier-2 fallback election.
    3. Both pages recover their protected requests successfully without session revocation.
    4. Replaying a consumed refresh token triggers server-side theft detection and session family revocation.

### Decision 20: Concurrency Proof & Replacement of localStorage Staged Election with Provable Fail-Closed Web Locks Architecture and Session Correlation
- **Context:** Formal adversarial analysis revealed that the `localStorage` staged candidate-ticket election algorithm cannot guarantee mutual exclusion under arbitrary thread/process preemption, background tab throttling, or tab suspension. Specifically, if Tab A wins, commits its lease, and removes its candidate ticket, Tab B (resuming from preemption) scans tickets, sees only its own ticket, assumes it won, overwrites Tab A's lease, and issues a concurrent refresh request. Because `localStorage` lacks an atomic Compare-And-Swap (CAS) primitive, any time-based lease can be violated. Concurrent refresh requests trigger server-side `THEFT_DETECTED` revocation, destroying the entire session family. Furthermore, generic timestamp/status markers lacked user/session correlation, allowing potential cross-session reuse across account switches.
- **Decision:**
  - **20.1 Formal Proof of localStorage Election Inadequacy:** Acknowledge and document that without atomic CAS or OS/browser kernel synchronization, no distributed lease in `localStorage` can prevent dual-owner execution under adversarial scheduling. Option D is permanently rejected.
  - **20.2 Authoritative Architecture Selection (Option A — Web Locks API + Strict Fail-Closed Safety):**
    - **Primary Mechanism:** W3C Web Locks API (`navigator.locks`) is the sole authoritative mechanism for cross-tab refresh serialization. It is enforced at the browser engine process level across all tabs, iframes, and workers for the origin, with automatic cleanup on tab crash/termination, zero dual-lease risk, and 98%+ global browser availability.
    - **Fail-Closed Policy When Web Locks Are Unavailable:** In environments lacking `navigator.locks` (non-secure HTTP contexts, restricted `<iframe>` sandboxes, or legacy browsers), the client **fails closed safely**. It logs an explicit security notice, records status `'failed'`, invokes `authFailureHandler()`, and returns `false`. It NEVER executes uncoordinated network refresh requests that would risk token rotation races and catastrophic session revocation. A user re-authenticating on an unsupported browser is strictly preferred over silent session family destruction.
  - **20.3 Session Correlation Invariant:**
    - To prevent cross-session contamination (e.g. Tab 1 logging out of User A and logging in as User B while Tab 2 has an in-flight request for User A), coordination state must track a non-sensitive `sessionCorrelation` object: `{ userId: string, sessionEpoch: number }`.
    - When a tab receives a 401 and checks if a sibling tab completed refresh, it verifies that the stored `userId` matches the current tab's active user identity. Mismatches fail closed immediately.
    - On logout (`resetClientState()`): all stored epochs, status markers, and session correlations are cleared; status is set to `'logged_out'`; and `ORBIT_LOGOUT` is broadcast via `BroadcastChannel`. Sibling tabs listening immediately clear their in-memory state and trigger auth failure.
  - **20.4 Deterministic Adversarial Concurrency Test Suite:**
    - Add unit tests modeling the exact preemption race schedules (candidate removed before contender arbitrates, concurrent lease writes, lease TTL expiration under tab suspension, stale owner resuming after lease expiration, old owner releasing new lease, storage failure mid-operation, failed refresh propagation).
    - Assert that under all adversarial schedules, concurrent network refreshes NEVER occur, and the system fails closed cleanly.
  - **20.5 Multi-Trial Real Multi-Page Browser Stress Testing:**
    - Expand the Playwright browser test suite to run 10 repeated concurrent trials with 2, 3, and 4 simultaneous tabs.
    - Verify delayed responses, tab closure during lock holding (verifying native automatic lock release), missing Web Locks (verifying clean fail-closed behavior without uncoordinated requests), account switch / logout races, and replayed token theft detection in real headless Chrome.
    - Make browser binary discovery cross-platform (`CHROME_BIN`, system Chrome/Edge/Chromium paths on Linux/macOS/Windows) with clear failure messaging when no binary is found.
  - **20.6 Database Role Boundary Hardening:**
    - In `docker-compose.yml`, enforce explicit environment variable injection and remove silent production fallbacks.
    - In `docker/postgres/init-roles.sql`, add a fail-fast validation check preventing predictable default passwords from being applied if `NODE_ENV` is `production` or `staging`.

### Decision 21: Complete Milestone 1 Architecture and Security Closure
- **Context:** An end-to-end audit of Milestone 1 identified four remaining defects:
  1. `apps/web/src/context/auth-context.tsx` did not invoke `setActiveUserId()` on login, registration, or profile restoration, and did not call `markLoggedOut()` on logout.
  2. Sibling refresh reuse in `client.ts` contained a counter-bypass bug: `getStoredRefreshCounter() > queueCounter || isSiblingRefreshValid()` bypassed session identity verification whenever the counter incremented.
  3. `docker/postgres/init-roles.sql` used psql literal interpolation inside a dollar-quoted `DO $$ ... $$` block (`:'env_node_env'`), which is invalid SQL syntax and causes syntax errors in fresh deployments.
  4. CI workflow definition was missing or unverified for the dedicated browser and database test runner.
- **Decision:**
  - **21.1 End-to-End Auth Lifecycle Wiring:** Wire `setActiveUserId` into `auth-context.tsx` during `login`, `register`, `refreshProfile`, and `authFailureHandler`. Invoke `markLoggedOut()` during `logout()`, properly dispatching `ORBIT_LOGOUT` to all listening tabs. Automatically update `currentUserId` and session correlation inside `apiRequest` upon receiving successful auth responses.
  - **21.2 Counter-Bypass Elimination:** Eliminate the logical bypass. All sibling refresh reuses must pass through `isSiblingRefreshValid(dispatchEpoch, queueCounter)`, which enforces `status === 'success'`, timing or monotonic counter progress, non-null session correlation, and matching `userId`. Mismatched users or missing identities can never reuse sibling tokens.
  - **21.3 PostgreSQL Dollar-Quote Syntax Fix:** Replace psql interpolation inside `DO $$ ... $$` with session configuration parameters (`SELECT set_config('orbit.env_node_env', :'env_node_env', false)` and `current_setting('orbit.env_node_env', true)`). Add `\set ON_ERROR_STOP on` to guarantee immediate fail-fast termination if production validation fails.
  - **21.4 Cross-Platform Real Browser Lifecycle Tests:** Add real multi-page browser tests verifying cross-tab account switching (User A in Tab 1, User B in Tab 2), multi-tab logout propagation, and clean profile restoration.
  - **21.5 CI Workflow Provisioning:** Author `.github/workflows/ci.yml` providing reproducible automated verification across Node 24, PostgreSQL 16 with pgvector, Redis 7, and Playwright headless Chromium.

### Decision 22: Session-Aware Authentication Lifecycle State Machine, Versioned Logout Epochs & Cross-Tab Broadcast Hardening
- **Context:** An adversarial analysis of the multi-tab authentication lifecycle identified potential race conditions and edge cases:
  1. Login after logout: After `markLoggedOut()`, `orbit_auth_last_refresh_status` was set to unversioned `'logged_out'`. A subsequent login in the same or sibling tab could leave an obsolete `'logged_out'` marker in shared storage if active identity was restored without a full storage rewrite, causing future token refreshes to falsely reject legitimate sessions.
  2. In-memory `isTabLoggedOut` flag unconditionally blocked all non-auth endpoints, preventing `/api/auth/me` (`refreshProfile`) from verifying valid ambient session cookies.
  3. `BroadcastChannel` event handlers for `ORBIT_LOGOUT` and `ORBIT_REFRESH_FAILED` acted unconditionally, allowing delayed or out-of-order broadcast messages from previous session epochs to corrupt newer authenticated sessions.
- **Decision:**
  - **22.1 Explicit Session Generation & Logout Epoch Versioning:**
    - Shared session state maintains `STORAGE_KEY_SESSION_CORRELATION` (`{ userId: string, sessionEpoch: number }`) and `STORAGE_KEY_LOGOUT_RECORD` (`orbit_auth_logout_record`: `{ userId: string | null, logoutEpoch: number }`).
    - In-memory state tracks `currentSessionEpoch: number` alongside `currentUserId`.
    - A logout is active and authoritative for an execution context if and only if `logoutEpoch >= currentSessionEpoch`.
    - When a fresh session is established (`login`, `register`, or successful `/api/auth/me`), `sessionEpoch` is updated to `nowEpoch` (`> logoutEpoch`), establishing a fresh session generation that deterministically supersedes older logouts.
  - **22.2 Profile Restoration (`/api/auth/me`) Synchronization:**
    - Permit `/api/auth/me` to execute across network even if `isTabLoggedOut` was previously set, allowing genuine cookie verification upon page load.
    - If `/api/auth/me` returns 200 OK, synchronize in-memory and shared session state (`isTabLoggedOut = false`, `currentUserId = data.user.id`, `sessionEpoch = nowEpoch`, `setStoredRefreshStatus('success')`).
    - If `/api/auth/me` returns 401, fail closed safely.
  - **22.3 Stale Broadcast Drop Invariant:**
    - All coordination events (`ORBIT_LOGOUT`, `ORBIT_LOGIN`, `ORBIT_REFRESH_COMPLETE`, `ORBIT_REFRESH_FAILED`) carry `epoch: number` and `userId?: string`.
    - `onmessage` handlers strictly verify that `event.data.epoch >= currentSessionEpoch`. Messages with an epoch strictly less than the active session epoch are discarded as stale, preventing delayed messages from invalidating newer sessions.
  - **22.4 Account Switch & Web Locks Invariant Preservation:**
    - Preserve strict account-switch mismatch rejection: if `currentUserId` exists and differs from `correlation.userId`, fail closed immediately.
    - Web Locks API (`navigator.locks`) remains the sole authoritative cross-tab mutex with strict fail-closed safety when unavailable. Zero uncoordinated refreshes are permitted.


---

## 3. Staged Implementation Plan

| Stage | Focus Area | Deliverables | Verification Gates |
|---|---|---|---|
| **Stage 1** | Workspace & Developer Foundation | Root `package.json`, npm workspaces, shared `tsconfig.base.json`, package skeletons (`shared`, `validation`, `config`, `ui`, `integrations`, `apps/api`, `apps/web`, `apps/worker`, `apps/widget`), ESLint & Prettier config, `.env.example`. | `npm install` clean, workspace scripts executable, typecheck clean. |
| **Stage 2** | Infrastructure & Database | `docker-compose.yml`, PostgreSQL init scripts with roles (`orbit_migrator`, `orbit_app`, `orbit_ingress`), Prisma schema with Category A/B/C/D entities and composite keys, versioned migrations with explicit categorized grants, database seeder. | Docker Compose running, PostgreSQL & Redis health checks passing, `prisma migrate` successful, database roles verified. |
| **Stage 3** | Tenant Isolation | `TenantTransactionRunner`, PostgreSQL RLS policies on tenant tables, `TenantGuard`, tenant isolation integration tests (`tests/integration/tenant-isolation.spec.ts`), database permission tests (`tests/integration/db-permissions.spec.ts`). | Integration tests execute against real PostgreSQL and pass: cross-tenant read/write blocked, missing context fails closed, connection pool leak prevented, role privileges restricted. |
| **Stage 4** | Authentication & Membership | `AuthService`, `AuthController`, Argon2id password hashing, JWT cookie utilities, `user_sessions` refresh rotation & reuse detection, `OrganizationService`, `OrganizationController`, membership role authorization (`OWNER`, `ADMIN`, `MEMBER`), auth integration tests (`tests/integration/auth.spec.ts`). | Auth tests pass: registration, duplicate rejection, login, invalid password, refresh rotation, theft reuse revocation, logout, unauthorized access rejected. |
| **Stage 5** | Minimal Frontend | `apps/web` Vite + React 18 SPA with Tailwind CSS, React Hook Form, TanStack Query: Login page, Registration page, Authenticated dashboard shell, Organization selector / switcher, Account menu, Logout, Protected routes. | Frontend typechecks and builds cleanly (`npm run build --workspace=apps/web`), end-to-end interactive verification. |
| **Stage 6** | Final Verification & Review | Full monorepo typecheck, linting, production builds for all workspaces, complete integration test execution, git diff review, evidence compilation in `docs/MILESTONE_1_IMPLEMENTATION_REPORT.md`. | 100% passing tests, clean builds, zero uncommitted stray files, explicit Gravitas completion report. |
