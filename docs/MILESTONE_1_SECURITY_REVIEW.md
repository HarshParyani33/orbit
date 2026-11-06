# PROJECT ORBIT — MILESTONE 1 SECURITY REVIEW & CORRECTION REPORT

**Document ID:** `M1-SEC-20261106`  
**Status:** `VERIFIED & RESOLVED`  
**Date:** `2026-11-06`  
**Milestone:** `Milestone 1 — Foundation, Multi-Tenant Security, Authentication & Minimal Dashboard`  
**Governance:** `Gravitas Core Skill Mode (6 Invariants Strictly Enforced)`  
**Repository:** `HarshParyani33/orbit`  
**Verification Baseline:** `54 / 54 Integration Tests Passing (PostgreSQL 16 pgvector + Redis 7)`

---

## 1. Executive Summary & Gravitas Governance

During the final security inspection of Milestone 1, seven specific findings were identified spanning route-level IDOR risks, race conditions in refresh token rotation, suspended account session lifecycle, CSRF posture for cookie-authenticated endpoints, local development infrastructure hardening, registration transaction atomicity, and extended role/organization authorization boundaries.

Following the mandatory **Gravitas discipline** (`python .agents/skills/gravitas/scripts/doctor.py` confirming Core Skill Mode, canonical skill hash `093c91dd12d1c78dee3fd31f93b1aad7aea454e7fe17f9b1f0f9a9cca7674553`), all seven findings were systematically reproduced, corrected with defense-in-depth controls, and verified via automated integration tests against real PostgreSQL 16 and Redis 7 instances.

---

## 2. Findings, Root Cause Analysis, Corrections & Verification Evidence

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

#### Verification Evidence
- `tests/integration/security-pass.spec.ts`:
  - `blocks User A from accessing Org B via route parameter (403 Forbidden)`: PASSED.
  - `rejects mismatched X-Organization-ID header vs route parameter (403 Forbidden)`: PASSED.
  - `allows User A to access Org A when route param matches verified membership`: PASSED.
  - `controller rejects mismatched param even if guard was somehow bypassed (Defense in Depth)`: PASSED.

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

#### Verification Evidence
- `tests/integration/security-pass.spec.ts`:
  - `executes atomic token rotation with row locking (FOR UPDATE)`: PASSED.
  - `concurrent refresh requests with identical token: exactly one succeeds and second triggers theft revocation`: PASSED (`Promise.allSettled` proves 1 fulfilled, 1 rejected with theft alert, and the newly issued session family revoked).

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

#### Architectural Trade-off & Stateless Access Token Window
- **Access Token TTL:** Access tokens are short-lived, signed JWTs with a **15-minute expiration window**.
- **Stateless Validity Boundary:** Because access tokens are stateless, an already-issued JWT remains structurally valid for authentication signatures until its 15-minute expiration, **without hitting the database for non-tenant static routes**.
- **Mitigation & Defense-in-Depth:**
  1. The token lifetime is deliberately capped at 15 minutes.
  2. All tenant data endpoints require `TenantGuard`, which performs an active database check verifying that `user.status === 'ACTIVE'` and `organization.status === 'ACTIVE'`, immediately blocking access.
  3. In Milestone 2 / production, a low-latency Redis JWT denylist can be evaluated in `JwtAuthGuard` if sub-second global invalidation of stateless tokens is required.

#### Verification Evidence
- `tests/integration/security-pass.spec.ts`:
  - `prevents suspended user from logging in (401 Unauthorized)`: PASSED.
  - `prevents suspended user from refreshing session (401 Unauthorized)`: PASSED.
  - `prevents suspended user from fetching profile (401 Unauthorized)`: PASSED.
  - `prevents suspended user from entering tenant context in TenantGuard (403 Forbidden)`: PASSED.

---

### Finding 4: Cross-Site Request Forgery (CSRF) Protection

#### Vulnerability Description
HTTP-only authentication cookies with `SameSite=Lax` provide baseline protection against cross-site POSTs in modern browsers, but defense-in-depth requires explicit Origin verification and protection for state-mutating requests against sub-domain takeovers, legacy user agents, and cross-site framing.

#### Corrective Engineering
1. **Dedicated Global Guard (`apps/api/src/auth/csrf.guard.ts`):**
   - Registered as a global guard (`APP_GUARD`) in `AppModule`.
   - Safe HTTP methods (`GET`, `HEAD`, `OPTIONS`) are permitted without state mutation checks.
   - Programmatic requests using `Authorization: Bearer <token>` (without ambient auth cookies) bypass CSRF checks, as browsers do not attach custom authorization headers automatically in cross-origin requests.
2. **Origin & Referer Enforcement for Cookie-Authenticated Mutations:**
   - If auth cookies (`access_token` or `refresh_token`) are present on a mutating method (`POST`, `PUT`, `PATCH`, `DELETE`):
     - `Origin` (or fallback `Referer`) is parsed and checked against an allowed origin whitelist (`process.env.FRONTEND_URL`, `http://localhost:5173`, `http://localhost:3000`, `http://localhost:4000`).
     - Requests from unauthorized origins (e.g. `https://malicious-attacker.com`) are rejected with 403 Forbidden.
     - Requests lacking both Origin and Referer must provide a custom security header (`X-CSRF-Token` or `X-Requested-With`) to ensure browser SOP preflight enforcement.

#### Verification Evidence
- `tests/integration/security-pass.spec.ts`:
  - `allows safe HTTP GET requests with cookies regardless of origin`: PASSED.
  - `allows non-cookie requests (e.g. Bearer token clients) on state mutations`: PASSED.
  - `allows cookie-authenticated state mutations with trusted Origin`: PASSED.
  - `blocks cookie-authenticated state mutations from unauthorized Origin (403 Forbidden)`: PASSED.
  - `blocks cookie-authenticated state mutations with missing Origin/Referer without custom header (403 Forbidden)`: PASSED.
  - `allows cookie-authenticated state mutations if custom security header is present`: PASSED.

---

### Finding 5: Database Dev Configuration Hardening

#### Vulnerability Description
`docker-compose.yml` previously exposed PostgreSQL (`5432:5432`) and Redis (`6379:6379`) on `0.0.0.0`, binding them to all host network interfaces. Furthermore, a fixed superuser password was hardcoded directly in the service environment definition without fallback support.

#### Corrective Engineering
1. **Localhost Interface Binding (`docker-compose.yml`):**
   - Ports are bound strictly to `127.0.0.1`:
     ```yaml
     postgres:
       ports:
         - "127.0.0.1:5432:5432"
     redis:
       ports:
         - "127.0.0.1:6379:6379"
     ```
2. **Environment Variable Fallback:**
   - Superuser credentials now support external environment overrides:
     ```yaml
     POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-postgres_master_dev_password}
     ```
3. **Template Documentation (`.env.example`):**
   - Added clear instructions in `.env.example` documenting `POSTGRES_PASSWORD` and reminding operators that production secrets must be high-entropy, independently managed credentials.

#### Verification Evidence
- `tests/integration/security-pass.spec.ts`:
  - `verifies docker-compose.yml binds PostgreSQL and Redis to 127.0.0.1`: PASSED.
  - `verifies docker-compose.yml does not use fixed committed superuser password without env fallback`: PASSED.
  - `verifies .env.example contains POSTGRES_PASSWORD template`: PASSED.

---

### Finding 6: Registration Transaction Atomicity

#### Vulnerability Description
`AuthService.register` previously created the `User`, the default `Organization` with `OrganizationMembership`, and the initial `UserSession` across separate sequential Prisma invocations. If any downstream query failed (e.g., organization slug conflict, constraint error, or network timeout), an orphaned user was left in the database with no associated workspace or valid session.

#### Corrective Engineering
1. **Atomic Interactive Transaction (`apps/api/src/auth/auth.service.ts`):**
   - The entire registration workflow is encapsulated within `this.prisma.$transaction(async (tx) => ...)`:
     1. Uniqueness check for email.
     2. Password hashing via Argon2id.
     3. User record creation.
     4. Default organization creation with OWNER membership.
     5. Access token and refresh token generation.
     6. Initial session creation in `user_sessions`.
2. **Rollback Guarantee:**
   - Any unhandled exception or database error automatically issues a PostgreSQL `ROLLBACK`, guaranteeing that either all entities exist or none do.

#### Verification Evidence
- `tests/integration/security-pass.spec.ts`:
  - `creates user, organization, owner membership, and initial session atomically`: PASSED.
  - `rolls back completely if a failure occurs during registration (zero orphaned records)`: PASSED (verified that when a transaction failure is triggered, zero user records remain in PostgreSQL).

---

### Finding 7: Extended Role & Organization Authorization Boundaries

#### Vulnerability Description
Fine-grained authorization boundaries needed explicit verification across domain controllers:
1. Preventing regular members from adding new members.
2. Preventing administrators from exceeding their authority (e.g. attempting to invite another admin or granting the OWNER role).
3. Enforcing fail-closed behavior when accessing suspended organizations.

#### Corrective Engineering
1. **Invitation RBAC (`apps/api/src/organizations/organizations.service.ts`):**
   - `addMember` verifies that only `OWNER` and `ADMIN` can invite members.
   - Explicitly rejects invitations with `role === 'OWNER'` (`The OWNER role cannot be granted through invitations`).
   - Explicitly prevents an `ADMIN` from inviting another `ADMIN` (`Only organization owners can invite new administrators`).
2. **Suspended Organization Fail-Closed (`apps/api/src/tenancy/tenant.guard.ts`):**
   - `TenantGuard` verifies `organization.status === 'ACTIVE'`.
   - If an organization is suspended (`status: 'SUSPENDED'`), requests fail closed with 403 Forbidden (`Organization is suspended or inactive`).

#### Verification Evidence
- `tests/integration/security-pass.spec.ts`:
  - `blocks regular MEMBER from adding new members to an organization (403 Forbidden)`: PASSED.
  - `blocks ADMIN from granting the OWNER role (403 Forbidden)`: PASSED.
  - `blocks ADMIN from creating another ADMIN (Only OWNER can invite ADMIN)`: PASSED.
  - `blocks access to SUSPENDED organizations via TenantGuard (403 Forbidden)`: PASSED.

---

## 3. Comprehensive Verification Matrix

```
Test Files  4 passed (4)
Tests       54 passed (54)
Duration    4.67s
```

| Suite | Focus Area | Tests Passed | Status |
|---|---|:---:|:---:|
| `tests/integration/db-permissions.spec.ts` | PostgreSQL role separation (`orbit_app`, `orbit_migrator`, `orbit_ingress`), DDL restrictions, table grants | 11 / 11 | **PASSED** |
| `tests/integration/tenant-isolation.spec.ts` | Multi-tenant RLS isolation, cross-tenant read/write prevention, fail-closed missing context, pool cleanup | 7 / 7 | **PASSED** |
| `tests/integration/auth.spec.ts` | Argon2id hashing, credential verification, JWT issuance, standard token rotation & reuse detection, logout | 11 / 11 | **PASSED** |
| `tests/integration/security-pass.spec.ts` | IDOR prevention, atomic concurrency locking, suspended user/org lifecycle, CSRF guard, registration atomicity, role RBAC | 25 / 25 | **PASSED** |
| **TOTAL** | **Milestone 1 Full Integration Test Suite** | **54 / 54** | **100% PASS** |

### Static Analysis & Build Verification
- **TypeScript (`npm run typecheck`):** Clean, 0 errors across all 9 workspaces.
- **ESLint (`npm run lint`):** Clean, 0 errors or warnings.
- **Production Builds (`npm run build`):** Clean production bundle generated for `@orbit/config`, `@orbit/integrations`, `@orbit/shared`, `@orbit/ui`, `@orbit/validation`, `@orbit/api`, `@orbit/web`, `@orbit/widget`, and `@orbit/worker`.

