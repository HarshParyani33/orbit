# PROJECT ORBIT — MILESTONE 1 SECURITY REVIEW & CORRECTION REPORT

**Document ID:** `M1-SEC-20261106`  
**Status:** `VERIFIED & RESOLVED`  
**Date:** `2026-11-06`  
**Milestone:** `Milestone 1 — Foundation, Multi-Tenant Security, Authentication & Minimal Dashboard`  
**Governance:** `Gravitas Core Skill Mode (6 Invariants Strictly Enforced)`  
**Repository:** `HarshParyani33/orbit`  
**Verification Baseline:** `65 / 65 Passing Tests (18 DB Infrastructure + 18 DB Auth/Concurrency + 24 Guard/Controller Unit + 5 Frontend Refresh Unit)`

---

## 1. Executive Summary & Gravitas Governance

During the security audits of Milestone 1, seven primary server-side findings and four critical refinement findings were identified:
1. Route-level Insecure Direct Object Reference (IDOR) risks.
2. Server-side race conditions in refresh token rotation (`FOR UPDATE` row locking required).
3. Suspended account session revival and stateless JWT lifecycle.
4. CSRF protection hardening, specifically eliminating the `Sec-Fetch-Site` cross-site bypass and documenting CORS contracts.
5. Local development infrastructure hardening (localhost binding and strictly required superuser credentials without default fallback).
6. Registration transaction atomicity and failure rollback.
7. Role RBAC and organization authorization boundary tests.
8. Frontend single-flight refresh concurrency to prevent client-induced session family theft revocation.

Following the mandatory **Gravitas discipline** (`python .agents/skills/gravitas/scripts/doctor.py` confirming Core Skill Mode, canonical skill hash `093c91dd12d1c78dee3fd31f93b1aad7aea454e7fe17f9b1f0f9a9cca7674553`), all findings were systematically reproduced, corrected, and verified with direct evidence.

---

## 2. Findings, Root Causes, Corrections & Technical Contracts

### Finding 1: Organization IDOR & Route Parameter Context Alignment

#### Vulnerability Description
In `OrganizationsController`, the route `GET /api/organizations/:id` accepted `:id` as a route parameter and passed it directly to `orgService.getOrganization(orgId)`. While `@UseGuards(TenantGuard)` was present, `TenantGuard` previously evaluated the requested organization only from headers (`X-Organization-Id`), query strings, or body payloads without validating that route parameter `:id` matched the verified tenant context. If an authenticated user belonging to Organization A provided `X-Organization-Id: <OrgA_UUID>` while requesting `GET /api/organizations/<OrgB_UUID>`, the guard authorized the request under Org A context, but the handler returned Org B's details and member roster (Insecure Direct Object Reference).

#### Corrective Engineering
1. **Guard-Level Invariant (`apps/api/src/tenancy/tenant.guard.ts`):**
   - `TenantGuard` now inspects route parameters (`request.params.id`, `request.params.orgId`, `request.params.organizationId`).
   - If a route parameter specifies an organization ID, it is treated as the primary target organization for tenant verification.
   - If an `X-Organization-Id` header is also supplied, `TenantGuard` strictly verifies that `routeOrgId === headerOrgId`. If they diverge, a `ForbiddenException` is thrown immediately (`Mismatched organization context: route parameter does not match X-Organization-ID header`).
   - The user's active membership is validated strictly against that target organization.
2. **Controller-Level Defense-in-Depth (`apps/api/src/organizations/organizations.controller.ts`):**
   - `getOrganization` and `addMember` handlers receive `@CurrentTenant() tenant: TenantContext` and explicitly verify `if (orgId !== tenant.orgId) throw new ForbiddenException('Route parameter does not match verified tenant context');`.
   - Domain retrieval executes against `tenant.orgId` directly.

---

### Finding 2: Atomic Refresh Token Rotation & Concurrency Race Condition

#### Vulnerability Description
Previously, `AuthService.refresh` retrieved the session record with `prisma.userSession.findFirst` and then updated `isRevoked: true` in a separate statement outside an interactive row-locking transaction. Under high concurrency, two simultaneous requests presenting the exact same valid refresh token could both read `isRevoked: false` before either update completed, resulting in duplicate active token chains and bypassing theft reuse detection.

#### Corrective Engineering
1. **Interactive Transaction with PostgreSQL Row Locking (`apps/api/src/auth/auth.service.ts`):**
   - `refresh()` executes within `this.prisma.$transaction(async (tx) => ...)`.
   - The session row is selected using raw SQL with an explicit exclusive row lock:
     ```sql
     SELECT s.*, u.status AS user_status, u.email AS user_email, u.name AS user_name
     FROM user_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1
     FOR UPDATE OF s
     ```
2. **Serialization & Immediate Theft Detection:**
   - The first concurrent request acquires the row lock, validates `is_revoked === false`, marks the session revoked (`is_revoked = true`), generates a new token pair under the same `family_id`, and commits.
   - The second concurrent request is blocked until the first transaction commits. Upon unblocking, it reads `is_revoked === true`.
   - Detecting an already-consumed token, it executes immediate emergency theft revocation across the entire session family:
     ```sql
     UPDATE user_sessions SET is_revoked = true WHERE family_id = $1
     ```
   - The revocation is committed to PostgreSQL before returning an error, and the method throws 401 Unauthorized (`Security alert: Attempted reuse of rotated refresh token. All active sessions have been revoked.`).

---

### Finding 3: Suspended Account Session Revival & Stateless JWT Window

#### Vulnerability Description
If an administrative action suspended a user (`users.status = 'SUSPENDED'`), existing sessions were not guaranteed to be revoked, allowing suspended users to refresh sessions, generate new access tokens, or continue accessing tenant endpoints.

#### Corrective Engineering
1. **Revocation Upon Suspension (`AuthService.suspendUser`):**
   - Atomically updates `users.status = 'SUSPENDED'` and revokes all active sessions (`user_sessions.is_revoked = true WHERE user_id = $1`).
2. **Active Checks in Auth Flows:**
   - `login()`: Rejects suspended accounts with 401 Unauthorized before checking password.
   - `refresh()`: Checks `session.user_status !== 'ACTIVE'`. If suspended, commits `is_revoked = true` for all user sessions and throws 401 Unauthorized.
   - `getProfile()`: Rejects suspended users with 401 Unauthorized.
3. **Tenant Context Fail-Closed (`TenantGuard`):**
   - `TenantGuard` verifies `user.status === 'ACTIVE'` on every incoming tenant request. Even if a suspended user possesses an unexpired stateless JWT, every tenant endpoint rejects the request with 403 Forbidden (`User account is suspended or deactivated`).

#### Architectural Trade-off: Stateless Access Token Window (15 Minutes)
- **Token Format & TTL:** Access tokens are stateless, signed JWTs with a **15-minute expiration window**.
- **Limitation Boundary:** Because access tokens are stateless and verified by cryptographic signature without hitting the database on non-tenant endpoints, an already-issued JWT remains structurally valid for authentication signatures until its 15-minute expiration.
- **Mitigation in Place:**
  1. Token lifetime is strictly capped at 15 minutes.
  2. All tenant data endpoints require `TenantGuard`, which performs an active database query verifying that `user.status === 'ACTIVE'` and `organization.status === 'ACTIVE'`, failing closed immediately.
  3. Session refresh is immediately blocked, preventing new access tokens from being generated.
- **Milestone 2 Consideration:** If sub-second global invalidation of stateless access tokens on static routes is required, a low-latency Redis JWT revocation denylist must be evaluated in `JwtAuthGuard`.

---

### Finding 4: CSRF Protection & Sec-Fetch-Site Bypass Correction

#### Vulnerability Description
In the initial `CsrfGuard`, line 82 checked:
```typescript
const customHeader =
  request.headers['x-csrf-token'] ||
  request.headers['x-requested-with'] ||
  request.headers['sec-fetch-site'];
```
Because `request.headers['sec-fetch-site']` was treated as an authorized custom header, a cross-site request where the browser explicitly sent `Sec-Fetch-Site: cross-site` with no Origin/Referer was mistakenly authorized. The mere presence of the browser's fetch metadata header bypassed CSRF protection.

#### Corrective Engineering (`apps/api/src/auth/csrf.guard.ts`)
1. **Explicit Cross-Site Rejection:**
   - Any cookie-authenticated state mutation where `Sec-Fetch-Site === 'cross-site'` is **unconditionally rejected** with `ForbiddenException('Cross-Site Request Forgery (CSRF) blocked: Sec-Fetch-Site is cross-site')`.
2. **Fetch Metadata Provenance Logic:**
   - `same-origin`: Accepted as browser-guaranteed same-origin provenance.
   - `same-site`: Only accepted if the `Origin` or `Referer` is present and matches the configured `allowedOrigins` whitelist, or if a valid custom header is present. A same-site request without origin or custom header fails closed.
   - `none`: Only accepted if Origin matches allowed origins or custom header is present.
3. **Strict Origin & Referer Whitelist:**
   - If `Origin` or `Referer` is supplied, it MUST match `this.allowedOrigins` (`FRONTEND_URL`, `http://localhost:5173`, `http://localhost:3000`, `http://localhost:4000`). Mismatched origins are rejected with 403 Forbidden.
4. **Custom Header Security Contract (`X-CSRF-Token`, `X-Requested-With`):**
   - Custom headers are accepted when Origin/Referer are absent (e.g. specialized clients or privacy-stripped referrers) based strictly on the browser **Same-Origin Policy (SOP) and CORS Preflight contract**.
   - Browsers forbid cross-origin JavaScript from setting non-simple custom headers (like `X-Requested-With` or `X-CSRF-Token`) without an explicit CORS preflight response allowing them (`Access-Control-Allow-Headers`).
   - In `apps/api/src/main.ts`, CORS origins are strictly restricted to `FRONTEND_URL`. Therefore, an untrusted third-party site cannot forge custom headers in cross-origin requests.
   - **Important Clarification:** `X-Requested-With` is NOT a secret CSRF token; its protection derives exclusively from browser SOP and CORS preflight enforcement.
5. **Login CSRF Considerations:**
   - In Project Orbit, `POST /api/auth/login` and `POST /api/auth/register` are credentialed endpoints that do not rely on ambient session cookies (`hasAuthCookie` is false).
   - Standard Login CSRF involves an attacker logging a victim into the attacker's account via cross-site requests. Because session cookies use `SameSite=Lax`, modern browsers do not send cross-site POST cookies.
   - In `apps/web/src/api/client.ts`, all state-mutating requests (including login and register) automatically attach `X-Requested-With: XMLHttpRequest`, ensuring that CORS preflight prevents cross-origin submission even from legacy user agents.

---

### Finding 5: Database Dev Configuration Hardening

#### Vulnerability Description
`docker-compose.yml` previously exposed PostgreSQL (`5432:5432`) and Redis (`6379:6379`) on `0.0.0.0`, and contained a predictable default password fallback (`${POSTGRES_PASSWORD:-postgres_master_dev_password}`).

#### Corrective Engineering
1. **Localhost Binding:**
   - Both services are bound strictly to `127.0.0.1` (`127.0.0.1:5432:5432` and `127.0.0.1:6379:6379`).
2. **Required Environment Variable (No Fallback):**
   - Updated `docker-compose.yml` to use required variable expansion:
     ```yaml
     POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?POSTGRES_PASSWORD must be set in environment or .env}
     ```
   - If `POSTGRES_PASSWORD` is unset, `docker compose` immediately aborts with an error rather than starting with a predictable default.
3. **Safe Documentation:**
   - Updated `.env.example` with clear instructions that developers must copy the template to `.env` and set a strong password.

---

### Finding 6: Registration Transaction Atomicity

#### Vulnerability Description
`AuthService.register` previously created `User`, `Organization`, `OrganizationMembership`, and `UserSession` across separate sequential queries. A failure in organization creation (e.g. slug conflict or database error) left orphaned user records in PostgreSQL.

#### Corrective Engineering
- Encapsulated `AuthService.register` within `this.prisma.$transaction(async (tx) => ...)`.
- All entities (User, Org, Owner Membership, Session) succeed or fail as an indivisible atomic unit.
- If an error occurs, PostgreSQL issues an automatic `ROLLBACK`, guaranteeing zero orphaned records.

---

### Finding 7: Frontend Refresh Concurrency & Single-Flight Client

#### Problem Description
When multiple dashboard components render simultaneously with an expired 15-minute access token, each component independently issues an API request receiving HTTP 401. If the client does not serialize token refresh, multiple concurrent calls to `POST /api/auth/refresh` will hit the server at the exact same millisecond with the same refresh token. Because the server enforces atomic rotation with row locking and theft detection, the second concurrent refresh triggers emergency session family revocation!

#### Corrective Engineering (`apps/web/src/api/client.ts`)
1. **Single-Flight Interceptor (`refreshPromise`):**
   - When an API request receives a 401 Unauthorized, it invokes `requestTokenRefresh()`.
   - If a refresh operation is already in-flight, subsequent requests receive the **same shared promise** rather than dispatching a duplicate HTTP request.
2. **Atomic Queue Resolution & Retry:**
   - When the single refresh completes with HTTP 200, all waiting requests unblock simultaneously and retry their original requests once (`_retry: true`) with the newly issued ambient cookies.
3. **Failure Handling & No Replay of Consumed Tokens:**
   - If token refresh fails (e.g. expired or revoked), `refreshPromise` resolves to `false`.
   - All waiting requests reject immediately (`Session expired or revoked. Please log in again.`).
   - The registered `authFailureHandler` clears local session state (`user = null`, `organizations = []`, `orbit_active_org_id` removed).
   - Under no circumstances does the client retry a consumed refresh token.

---

## 3. Test Suite Taxonomy & Verification Evidence

To ensure complete verification accuracy and prevent conflating unit/guard tests with real database integration tests, the test suite is partitioned into four distinct categories:

```text
================================================================================
TEST SUITE EXECUTION SUMMARY
================================================================================
Test Files  5 passed (5)
Tests       65 passed (65)
Duration    4.64s
```

### Category 1: Real Database & PostgreSQL Role Integration Tests (18 tests)
*Executed against live PostgreSQL 16 (pgvector) container in WSL2.*

| Test File | Tests | Focus Area | Verification Status |
|---|:---:|---|:---:|
| `tests/integration/db-permissions.spec.ts` | 11 | Direct SQL verification of `orbit_app`, `orbit_migrator`, `orbit_ingress` roles. Proves `orbit_app` is `NOSUPERUSER, NOBYPASSRLS`, cannot create tables, cannot access `_prisma_migrations`, and table privileges strictly match Categories A, B, C, D. | **11 / 11 PASSED** |
| `tests/integration/tenant-isolation.spec.ts` | 7 | Interactive PostgreSQL transactions (`tx`) executing `SET LOCAL app.current_org_id`. Proves `FORCE ROW LEVEL SECURITY`, cross-tenant read/write blocking, missing context fail-closed, and connection pool parameter leak prevention. | **7 / 7 PASSED** |

### Category 2: Real Database Authentication, Concurrency & Rollback Tests (18 tests)
*Executed against live PostgreSQL 16 with Prisma Client and Argon2id.*

| Test File | Tests | Focus Area | Verification Status |
|---|:---:|---|:---:|
| `tests/integration/auth.spec.ts` | 11 | Argon2id password hashing, real session generation, single-thread refresh rotation, family theft revocation, logout session cleanup. | **11 / 11 PASSED** |
| `tests/integration/security-pass.spec.ts` (DB subset) | 7 | Real PostgreSQL `SELECT ... FOR UPDATE` concurrency testing (`Promise.allSettled` proves serialized rotation and emergency family revocation), suspended user database lifecycle, real transaction rollback on registration failure (0 orphaned records), invitation role permissions in DB. | **7 / 7 PASSED** |

### Category 3: Application Guard & Security Unit Tests (24 tests)
*Executed with mocked `ExecutionContext` testing guard algorithms, route param matching, and configuration syntax.*

| Test File | Tests | Focus Area | Verification Status |
|---|:---:|---|:---:|
| `tests/integration/security-pass.spec.ts` (Unit subset) | 24 | Route parameter vs header IDOR mismatch rejection; `CsrfGuard` 10-test regression suite (cross-site `Sec-Fetch-Site` rejection, same-origin acceptance, same-site with/without valid origin, missing context, custom header contract, safe method exemption, Bearer token exemption); `docker-compose.yml` required variable syntax verification. | **24 / 24 PASSED** |

### Category 4: Client-Side Single-Flight Refresh Concurrency Unit Tests (5 tests)
*Executed against mocked Fetch API verifying client queueing and single-flight deduplication.*

| Test File | Tests | Focus Area | Verification Status |
|---|:---:|---|:---:|
| `tests/unit/client-refresh.spec.ts` | 5 | Verifies that simultaneous API requests receiving 401 trigger exactly ONE call to `/api/auth/refresh`, all waiting requests retry once, failed refresh calls `authFailureHandler` without replaying consumed tokens, and login/register 401s do not trigger refresh. | **5 / 5 PASSED** |

---

## 4. Build, Typecheck, Lint & Migration Evidence

### 1. Prisma Migration Status
```text
$ npx prisma migrate status
Environment variables loaded from .env
Prisma schema loaded from prisma\schema.prisma
Datasource "db": PostgreSQL database "orbit_db", schema "public" at "172.28.46.91:5432"

1 migration found in prisma/migrations
Database schema is up to date!
```

### 2. TypeScript Typecheck
```text
$ npm run typecheck
> tsc --build
(Exit code: 0, zero errors across all 9 workspaces)
```

### 3. ESLint Verification
```text
$ npm run lint
> eslint .
(Exit code: 0, zero errors, zero warnings)
```

### 4. Monorepo Production Build
```text
$ npm run build
> @orbit/config@0.1.0 build -> tsc --build (PASS)
> @orbit/integrations@0.1.0 build -> tsc --build (PASS)
> @orbit/shared@0.1.0 build -> tsc --build (PASS)
> @orbit/ui@0.1.0 build -> tsc --build (PASS)
> @orbit/validation@0.1.0 build -> tsc --build (PASS)
> @orbit/api@0.1.0 build -> tsc --build (PASS)
> @orbit/web@0.1.0 build -> tsc && vite build (PASS - built in 10.02s)
> @orbit/widget@0.1.0 build -> tsc --build (PASS)
> @orbit/worker@0.1.0 build -> tsc --build (PASS)
```

---

## 5. Security Limitations & Verification Boundaries

Following Gravitas Invariant 6 (*Say what you cannot verify*):
1. **Stateless Access Token Window:** Issued JWT access tokens remain structurally valid for 15 minutes unless checked against an external denylist. While `TenantGuard` checks user active status in the database on all tenant endpoints, non-tenant endpoints (like static assets or un-guarded routes) rely strictly on cryptographic signature validity.
2. **CORS Browser-Level Enforcement:** The custom header CSRF defense (`X-Requested-With`) relies on browser Same-Origin Policy and CORS preflight enforcement. Non-browser HTTP clients (e.g. curl or Python scripts) can set arbitrary headers, but non-browser clients do not store or attach browser ambient cookies, so ambient-credential CSRF is inherently a browser-only threat model.
3. **Standalone Ingress Deployment:** Live webhook signature verification and `apps/ingress` standalone deployment remain deferred to Milestone 2.
