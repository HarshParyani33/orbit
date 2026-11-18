# PROJECT ORBIT — FINAL MILESTONE 1 REVIEW & VERIFICATION
## Final Security Hardening, Multi-Tab Browser Verification & Quality Sign-Off

**Document ID:** `M1-FINAL-20261118-BROWSER-VERIFIED`  
**Milestone:** `Milestone 1 — Foundation, Multi-Tenant Security, Authentication & Minimal Dashboard`  
**Execution Date:** `2026-11-18`  
**Architectural Contract:** `docs/ARCHITECTURE.md` v1.1.5  
**Governance Runtime:** `Gravitas Core Skill Mode (6 Invariants Strictly Enforced)`  
**Repository:** `HarshParyani33/orbit`  
**Working Branch:** `main`  
**Final Verdict:** **MILESTONE 1 CORRECTIONS VERIFIED**

---

## 1. Operating Context & Gravitas Governance

Before making code modifications or performing verification runs, the environment was grounded using the installed Gravitas skill:

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

- **Active Mode:** **Core Skill Mode** (prompt-based behavioral discipline, decision records, evidence-backed verification).
- **Enforced Invariants:** All six Gravitas invariants strictly governed this final verification and hardening pass:
  1. *Ground before mutating:* Inspected Docker containers, WSL2 network bindings, NestJS CORS config, Prisma schema, Playwright headless Chrome integration, and client fetch interceptors before touching files.
  2. *Stay in declared scope:* Confined strictly to Milestone 1 findings; zero premature implementation of Milestone 2 features (no WhatsApp/Instagram Graph API webhooks, no Stripe webhooks, no AI inference).
  3. *Completion needs fresh evidence:* Every finding verified by automated test suites executed against live PostgreSQL 16, a real NestJS HTTP server on TCP, simulated browser execution contexts, and genuine multi-tab headless Chrome.
  4. *Never exact-retry a failure:* Diagnosed Node.js `localStorage` reference scope, `request.get` vs `request.headers` in mock contexts, and Playwright session counting before finalizing implementations.
  5. *Satisfy the established contract:* Adhered to `docs/ARCHITECTURE.md` v1.1.5 without deviation.
  6. *Say what cannot be verified:* Explicitly documented the 15-minute stateless JWT lifetime window, browser SOP dependency for custom header CSRF defense, and deferred live webhook ingestion.
- **Decision Records:** Recorded Decisions 1 through 19 in `docs/decisions/MILESTONE_1_DECISIONS.md`.

---

## 2. Comprehensive Findings & Resolutions Matrix

| Finding Ref | Severity | Domain | Root Cause | Corrective Engineering | Verification Artifact | Status |
|---|:---:|---|---|---|---|:---:|
| **Finding 1** | P1 | Multi-Tenant IDOR | Route parameter `:id` in `GET /api/organizations/:id` was not reconciled against tenant context. | `TenantGuard` verifies route parameter matches header; controller verifies `orgId === tenant.orgId`. | `tests/integration/security-pass.spec.ts` | **RESOLVED** |
| **Finding 2** | P1 | Authentication / Race | Refresh token rotation was non-atomic outside an exclusive row lock, risking concurrent token rotation. | Interactive transaction with PostgreSQL `SELECT ... FOR UPDATE OF s` row locking; immediate family revocation on reuse. | `tests/integration/security-pass.spec.ts`, `tests/integration/auth.spec.ts` | **RESOLVED** |
| **Finding 3** | P1 | Web Security / CSRF | Missing CORS preflight allowed header `X-Requested-With`; `Sec-Fetch-Site: cross-site` bypass risk. | Refactored `configureApp(app)` with explicit CORS allowedHeaders; hardened `CsrfGuard` with same-origin host check and cross-site rejection. | `tests/integration/http-cors-csrf.spec.ts` | **RESOLVED** |
| **Finding 4** | P1 | Configuration / Secrets | Startup lacked fail-fast production config validation; hardcoded JWT secrets in `app.module.ts`. | Enforced `getConfig()` in `main.ts` before bootstrap; validated 32-char production secrets with default-rejection rules. | `tests/unit/config-jwt.spec.ts` | **RESOLVED** |
| **Finding 5** | P1 | Cross-Tab Concurrency | Independent browser tabs lacked mutex for token refresh, and the fallback without Web Locks made uncoordinated network calls. | Tier-1: Web Locks API (`navigator.locks`). Tier-2: Staged Two-Phase Ticket Election in `localStorage` with fail-closed safety and stale lease recovery. | `tests/unit/cross-tab-refresh.spec.ts`, `tests/browser/cross-tab-refresh.browser.spec.ts` | **RESOLVED** |
| **Finding 6** | P1 | API Bootstrap | `apps/api/src/main.ts` invoked `app.listen()` twice (port fallback + config port), bypassing configuration validation. | Enforced `config.PORT` as sole port source; invoked `app.listen(config.PORT)` exactly once; added `createApp()` export. | `tests/integration/bootstrap.spec.ts` | **RESOLVED** |
| **Finding 7** | P2 | Database Provisioning | `init-roles.sql` contained hardcoded passwords in `CREATE ROLE` blocks, risking accidental reuse in production. | Sanitized role creation to use `CREATE ROLE ... WITH LOGIN`; injected passwords dynamically via `\getenv` and literal interpolation. | `tests/integration/security-pass.spec.ts` | **RESOLVED** |
| **Finding 8** | P2 | Registration Atomicity | Multi-step user, organization, membership, and session creation risked orphaned records on failure. | Wrapped registration in `prisma.$transaction`; rolled back completely on failure with zero orphaned rows. | `tests/integration/security-pass.spec.ts` | **RESOLVED** |
| **Finding 9** | P2 | Authorization RBAC | Regular members could invite users; admins could invite admins or grant owner role. | Enforced strict role hierarchy in `OrganizationsService`; regular members blocked, admins restricted to MEMBER role. | `tests/integration/security-pass.spec.ts` | **RESOLVED** |

---

## 3. Detailed Technical Review of Key Corrections

### 3.1 Tier-1 & Tier-2 Cross-Tab Refresh Coordination Architecture
- **Files:** `apps/web/src/api/client.ts`, `tests/unit/cross-tab-refresh.spec.ts`, `tests/browser/cross-tab-refresh.browser.spec.ts`
- **Issue:** When W3C Web Locks API was unavailable, `client.ts` previously fell back directly to `executeSingleFlightRefresh()`. In multi-tab environments without Web Locks, concurrent tabs sharing the same HTTP-only refresh cookie would submit simultaneous refresh requests. The server's `FOR UPDATE OF s` row locking would serialize them; the second request would hit `is_revoked = true` and trigger emergency session family theft revocation, logging the user out.
- **Corrective Engineering:**
  - **Tier 1 (Preferred):** Web Locks API (`navigator.locks.request('orbit_auth_refresh_lock', ...)`) provides browser-native kernel-level mutex across tabs with automatic crash cleanup.
  - **Tier 2 (Fallback):** Staged Two-Phase Ticket Election in `localStorage`:
    1. Pre-flight check: Inspect `orbit_auth_refresh_lease`. If held by an active tab (`expiresAt > Date.now()`), sleep and wait.
    2. Phase 1 (Post Candidate Ticket): Contender writes unique ticket `orbit_auth_candidate_${clientId}` with timestamp and priority hash.
    3. Phase 2 (Arbitration Window): Contender sleeps 40-65ms jitter window, allowing all concurrent contenders across tabs to write tickets.
    4. Phase 3 (Deterministic Winner Election): Contender reads all active tickets, sorting by lowest timestamp/priority. If another tab won, yield ticket, sleep, and monitor winner.
    5. Phase 4 (Winner Commit & Execution): Winner acquires lease (`expiresAt = Date.now() + 6000ms`), executes `executeSingleFlightRefresh()`, updates `storedRefreshEpoch`, and releases lease.
    6. Stale Lease Recovery: If a winner crashes or closes mid-refresh, waiting tabs detect `expiresAt <= Date.now()` after 6000ms TTL and reclaim the lease.
  - **Fail-Closed Guarantee:** If neither Web Locks nor `localStorage` is functional (e.g. storage disabled, private browsing security error), or if coordination times out, the client **fails closed safely** (`setStoredRefreshStatus('failed')`, notifies `authFailureHandler()`, returns `false`). It never makes an uncoordinated network refresh that risks token reuse revocation.
  - **Zero Token Disclosure:** Storage and broadcast channels strictly contain non-sensitive integer timestamps, status strings, or random lease UUIDs. No access tokens, refresh tokens, or cookies are ever stored in `localStorage` or `BroadcastChannel`.

### 3.2 Real Multi-Tab Browser Verification (Playwright & Headless Chrome)
- **Files:** `tests/browser/cross-tab-refresh.browser.spec.ts`
- **Execution:** Headless Google Chrome (`v157.0.8103.79`) on Windows with two independent browser pages sharing a single browser context with shared cookies.
- **Verified Scenarios:**
  1. *Scenario 1 (Web Locks Enabled):* Two independent tabs simultaneously receive 401 on protected requests. Web Locks serializes execution: **exactly 1** `/api/auth/refresh` request is made. Both tabs recover with 200 OK. Database session family remains healthy (1 active rotated session, 1 consumed session, 0 theft revocations).
  2. *Scenario 2 (Web Locks Disabled / Tier-2 Fallback):* Two independent tabs with `delete window.navigator.locks` simultaneously receive 401. Two-phase ticket election serializes execution in real Chrome: **exactly 1** `/api/auth/refresh` request is made. Both tabs recover with 200 OK.
  3. *Scenario 3 (Server Replay Detection):* Replaying a consumed refresh token directly from Chrome triggers the server's PostgreSQL row locking, returns 401 with theft alert, and immediately revokes all sessions in the family in PostgreSQL.

### 3.3 Database Role Initialization & Privilege Verification
- **Files:** `docker/postgres/init-roles.sql`, `docker-compose.yml`, `tests/integration/security-pass.spec.ts`
- **Verification:** Executed PostgreSQL catalog queries on live database:
  - `orbit_migrator`: `rolsuper = false`, `rolbypassrls = true`, `rolcanlogin = true`.
  - `orbit_app`: `rolsuper = false`, `rolbypassrls = false`, `rolcanlogin = true`.
  - `orbit_ingress`: `rolsuper = false`, `rolbypassrls = false`, `rolcanlogin = true`, and `SELECT count(*) FROM information_schema.table_privileges WHERE grantee = 'orbit_ingress'` = **0** (zero table privileges).
  - Sanitized `init-roles.sql` to instantiate roles without hardcoded passwords in `CREATE ROLE` statements, setting passwords strictly via `\getenv` literal interpolation.

---

## 4. Distinct Test Taxonomy & Verification Results

```text
========================================================================================
PROJECT ORBIT — DISTINCT TEST TAXONOMY (100 Tests Across 10 Files — 0 Failures)
========================================================================================

1. Real Database Role & Least-Privilege Tests (11 tests against live PostgreSQL 16 on Docker)
   - tests/integration/db-permissions.spec.ts
   - orbit_app: NOSUPERUSER, NOBYPASSRLS, DDL blocked, Category B read-only, Category C zero access
   - orbit_ingress: ZERO table access, Security Definer resolution authorized

2. Real Database Tenant Isolation & RLS Tests (7 tests against live PostgreSQL 16 on Docker)
   - tests/integration/tenant-isolation.spec.ts
   - Cross-tenant reads blocked (0 rows), cross-tenant updates blocked (0 rows)
   - Cross-tenant inserts throw 42501 RLS policy violation
   - Missing tenant context fails closed, connection pool SET LOCAL cleanup on commit

3. Real Database Authentication & Session Lifecycle Tests (11 tests against live PostgreSQL 16)
   - tests/integration/auth.spec.ts
   - Argon2id password hashing, session creation, single-thread rotation, theft detection

4. Real Database Concurrency & Rollback Tests (7 tests against live PostgreSQL 16)
   - tests/integration/security-pass.spec.ts (DB subset)
   - SELECT ... FOR UPDATE row locking & parallel theft revocation
   - Atomic registration rollback (0 orphaned records on failure), suspended tenant lifecycle

5. Real HTTP CORS, CSRF & Bootstrap Pipeline Network Tests (13 tests over TCP socket)
   - tests/integration/http-cors-csrf.spec.ts (10 tests)
   - tests/integration/bootstrap.spec.ts (3 tests)
   - Preflight allowed/untrusted origin, credentials, allowedHeaders including X-Requested-With
   - Sec-Fetch-Site: cross-site 403 rejection, Origin whitelist 403, missing context 403
   - Custom header without Origin acceptance: X-Requested-With (200), X-CSRF-Token (200)
   - Same-origin request acceptance via protocol and host alignment
   - Bootstrap single listen on config.PORT, fail-fast startup config validation before socket binding

6. Real Multi-Tab Browser Integration Tests (3 tests in Headless Google Chrome v157)
   - tests/browser/cross-tab-refresh.browser.spec.ts (3 tests)
   - Two independent browser pages sharing single context and cookies
   - Concurrent 401s under Web Locks: exactly 1 network refresh, both tabs recover
   - Concurrent 401s with Web Locks deleted (Tier-2 Fallback): exactly 1 network refresh, both recover
   - Server-side token reuse replay detection: replayed token triggers family revocation in PostgreSQL

7. Simulated Browser Execution Context Tests (9 tests in Vitest with Web Locks API mocks)
   - tests/unit/cross-tab-refresh.spec.ts (9 tests)
   - Concurrent tab Web Locks serialization, cross-tab stale 401 interception via storage epoch
   - Fail-closed handling on lock abort/timeout, interim sibling completion reuse
   - Tier-2 localStorage two-phase election, storage failure fail-closed safety, stale lease recovery
   - Security contract: zero sensitive credentials or tokens disclosed in storage

8. Client Single-Flight Refresh Concurrency Unit Tests (6 tests)
   - tests/unit/client-refresh.spec.ts (6 tests)
   - In-tab single-flight deduplication, atomic queue retry, monotonic stale 401 interception

9. JWT Secret Enforcement & Fail-Fast Configuration Unit Tests (8 tests)
   - tests/unit/config-jwt.spec.ts (8 tests)
   - Production missing/weak/default secret rejection, dev defaults, signing/verification parity

10. Application Guard, RBAC & Security Config Unit Tests (25 tests)
   - tests/integration/security-pass.spec.ts (Unit subset - 25 tests)
   - Route param vs header IDOR mismatch rejection, CsrfGuard complete matrix
   - docker-compose binding and variable validation, .env.example placeholders, init-roles.sql boundary
========================================================================================
```

---

## 5. Fresh Verification Transcripts

### 5.1 Real Browser Test Suite (`npm run test:browser`)
```text
$ npm run test:browser
> orbit-saas@0.1.0 test:browser
> vitest run tests/browser

 RUN  v2.1.9 H:/orbit-saas

 ✓ tests/browser/cross-tab-refresh.browser.spec.ts (3 tests) 4393ms
   ✓ Project Orbit — Real Multi-Tab Browser Cross-Tab Verification > Scenario 1: Real Browser Multi-Tab Refresh with Web Locks API serializes execution to exactly ONE network refresh 1217ms
   ✓ Project Orbit — Real Multi-Tab Browser Cross-Tab Verification > Scenario 2: Real Browser Multi-Tab Refresh WITHOUT Web Locks (Tier-2 Fallback) serializes execution to exactly ONE network refresh 641ms
   ✓ Project Orbit — Real Multi-Tab Browser Cross-Tab Verification > Scenario 3: Server Replay Detection Invariant in Real Browser — Replayed Old Token Revokes Session Family 550ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
   Start at  11:26:42
   Duration  8.21s
```

### 5.2 Unit Test Suite (`npm run test:unit`)
```text
$ npm run test:unit
> orbit-saas@0.1.0 test:unit
> vitest run tests/unit

 RUN  v2.1.9 H:/orbit-saas

 ✓ tests/unit/client-refresh.spec.ts (6 tests) 26ms
 ✓ tests/unit/cross-tab-refresh.spec.ts (9 tests) 221ms
 ✓ tests/unit/config-jwt.spec.ts (8 tests) 24ms

 Test Files  3 passed (3)
      Tests  23 passed (23)
   Start at  11:25:59
   Duration  2.31s
```

### 5.3 Integration Test Suite (`npm run test:integration`)
```text
$ npm run test:integration
> orbit-saas@0.1.0 test:integration
> vitest run --config vitest.integration.config.ts

 RUN  v2.1.9 H:/orbit-saas

 ✓ tests/integration/db-permissions.spec.ts (11 tests) 259ms
 ✓ tests/integration/tenant-isolation.spec.ts (7 tests) 234ms
 ✓ tests/integration/auth.spec.ts (11 tests) 864ms
 ✓ tests/integration/bootstrap.spec.ts (3 tests) 573ms
 ✓ tests/integration/security-pass.spec.ts (32 tests) 1649ms
 ✓ tests/integration/http-cors-csrf.spec.ts (10 tests) 1499ms

 Test Files  6 passed (6)
      Tests  74 passed (74)
   Start at  11:26:30
   Duration  5.36s
```

### 5.4 Full Combined Test Suite (`npm test`)
```text
$ npm test
> orbit-saas@0.1.0 test
> vitest run --config vitest.config.ts

 RUN  v2.1.9 H:/orbit-saas

 ✓ tests/unit/client-refresh.spec.ts (6 tests) 38ms
 ✓ tests/unit/cross-tab-refresh.spec.ts (9 tests) 287ms
 ✓ tests/integration/db-permissions.spec.ts (11 tests) 451ms
 ✓ tests/integration/tenant-isolation.spec.ts (7 tests) 295ms
 ✓ tests/unit/config-jwt.spec.ts (8 tests) 37ms
 ✓ tests/integration/auth.spec.ts (11 tests) 1037ms
 ✓ tests/integration/bootstrap.spec.ts (3 tests) 779ms
 ✓ tests/integration/security-pass.spec.ts (32 tests) 1889ms
 ✓ tests/integration/http-cors-csrf.spec.ts (10 tests) 1786ms
 ✓ tests/browser/cross-tab-refresh.browser.spec.ts (3 tests) 4020ms

 Test Files  10 passed (10)
      Tests  100 passed (100)
   Start at  11:27:01
   Duration  9.75s
```

### 5.5 TypeScript Strict Typecheck (`npm run typecheck`)
```text
$ npm run typecheck
> orbit-saas@0.1.0 typecheck
> tsc --build

(Exit code: 0, zero errors across all 9 workspaces)
```

### 5.6 ESLint Monorepo Verification (`npm run lint`)
```text
$ npm run lint
> orbit-saas@0.1.0 lint
> eslint .

(Exit code: 0, zero errors, zero warnings)
```

### 5.7 Production Monorepo Build (`npm run build`)
```text
$ npm run build
> orbit-saas@0.1.0 build
> npm run build --workspaces --if-present

> @orbit/config@0.1.0 build -> tsc --build (PASS)
> @orbit/integrations@0.1.0 build -> tsc --build (PASS)
> @orbit/shared@0.1.0 build -> tsc --build (PASS)
> @orbit/ui@0.1.0 build -> tsc --build (PASS)
> @orbit/validation@0.1.0 build -> tsc --build (PASS)
> @orbit/api@0.1.0 build -> tsc --build (PASS)
> @orbit/web@0.1.0 build -> tsc && vite build (PASS - built in 9.03s, 1642 modules transformed)
> @orbit/widget@0.1.0 build -> tsc --build (PASS)
> @orbit/worker@0.1.0 build -> tsc --build (PASS)

(Exit code: 0, all 9 workspaces built cleanly)
```

### 5.8 PostgreSQL Catalog Role Queries
```text
wsl -d Ubuntu docker exec orbit_postgres psql -U postgres -d orbit_db -c \
"SELECT rolname, rolsuper, rolbypassrls, rolcanlogin, rolcreatedb, rolcreaterole \
 FROM pg_roles WHERE rolname IN ('orbit_migrator', 'orbit_app', 'orbit_ingress');"

    rolname     | rolsuper | rolbypassrls | rolcanlogin | rolcreatedb | rolcreaterole 
----------------+----------+--------------+-------------+-------------+---------------
 orbit_migrator | f        | t            | t           | f           | f
 orbit_app      | f        | f            | t           | f           | f
 orbit_ingress  | f        | f            | t           | f           | f
(3 rows)

wsl -d Ubuntu docker exec orbit_postgres psql -U postgres -d orbit_db -c \
"SELECT count(*) FROM information_schema.table_privileges WHERE grantee = 'orbit_ingress';"

 count 
-------
     0
(1 row)
```

### 5.9 Prisma Migration Status (`npx prisma migrate status`)
```text
$ npx prisma migrate status
Environment variables loaded from .env
Prisma schema loaded from prisma\schema.prisma
Datasource "db": PostgreSQL database "orbit_db", schema "public" at "172.28.46.91:5432"

1 migration found in prisma/migrations

Database schema is up to date!
```

---

## 6. Operating Boundaries & Known Verification Limitations (Invariant 6)

In strict compliance with Gravitas Invariant 6 (*Say what you cannot verify*):

1. **Stateless Access Token Lifetime Window (15 Minutes):**
   - Access tokens are stateless, signed JWTs valid for 15 minutes.
   - For all tenant-scoped routes, `TenantGuard` executes real-time database verification of user and organization active status, failing closed if suspended.
   - For public or un-guarded endpoints, immediate sub-second token revocation is not enforced. Global instantaneous token invalidation across all routes will be implemented in Milestone 2 via a Redis token denylist check in `JwtAuthGuard`.
2. **Browser SOP Contract for Custom Header CSRF Defense:**
   - The CSRF protection provided by `X-Requested-With` depends upon browser enforcement of the Same-Origin Policy and CORS preflight checks (`Access-Control-Allow-Headers`).
   - Non-browser HTTP clients (such as curl, Postman, or server-to-server scripts) can set arbitrary headers; however, non-browser clients do not store or automatically attach ambient browser cookies (`credentials: include`), meaning ambient-credential CSRF is exclusively a browser-side threat model.
3. **Tests Not Run:**
   - Safari WebKit and Firefox Gecko multi-tab automated tests were not run; real browser tests were executed exclusively against Google Chrome (`v157.0.8103.79`) on Windows. Cross-browser verification on Safari and Firefox will be conducted during Milestone 5.
   - Production cloud KMS secret rotation (AWS Secrets Manager / GCP Secret Manager) was not tested locally; local container testing verified `\getenv` literal interpolation and `docker-compose.yml` variable enforcement.
4. **Behaviors Not Verified (Deferred to Milestone 2):**
   - Real omnichannel webhook intake (Meta WhatsApp Cloud API, Instagram Messaging, Stripe Webhooks).
   - Redis-backed BullMQ worker execution and outbox event sweepers.
   - AI LLM inference and pgvector semantic embeddings.
   - Live ingress HMAC cryptographic signature verification against external provider secrets.

---

## 7. Final Recommendation & Sign-Off

All Milestone 1 security, concurrency, bootstrap, and role provisioning requirements have been implemented, tested, and verified against real infrastructure and real browsers:

- **100 tests passed across 10 test files (0 failures).**
- **Real Headless Chrome browser multi-tab testing confirmed mutual exclusion under both Web Locks and the Tier-2 localStorage election fallback.**
- **PostgreSQL catalog queries confirmed strict role least-privilege boundaries.**
- **TypeScript strict typechecking, ESLint, monorepo builds, and database migrations are 100% clean.**

**FINAL VERDICT: MILESTONE 1 CORRECTIONS VERIFIED**  
Project Orbit is certified complete for Milestone 1 and ready to advance to **Milestone 2: Omnichannel Ingress, Transactional Outbox & Provider Messaging Adapters**.
