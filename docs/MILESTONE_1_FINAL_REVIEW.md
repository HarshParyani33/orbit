# PROJECT ORBIT — FINAL MILESTONE 1 REVIEW

**Document ID:** `M1-FINAL-20261106`  
**Milestone:** `Milestone 1 — Foundation, Multi-Tenant Security, Authentication & Minimal Dashboard`  
**Execution Date:** `2026-11-06`  
**Architectural Contract:** `docs/ARCHITECTURE.md` v1.1.5  
**Governance Runtime:** `Gravitas Core Skill Mode (6 Invariants Enforced)`  
**Repository:** `HarshParyani33/orbit`  
**Verdict:** **ACCEPTED & READY FOR MILESTONE 2 (Subject to Documented Operating Boundaries)**

---

## 1. Operating Context & Gravitas Governance

Before modifying files, the Gravitas environment was grounded and inspected:
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
- **Enforced Invariants:** All six invariants (Ground before mutating, stay in declared scope, completion needs evidence, never exact-retry a failure, satisfy the contract, say what cannot be verified) strictly governed this review pass.

---

## 2. Findings, Root Causes & Corrective Implementations

### Finding 1: CSRF `Sec-Fetch-Site` Bypass
- **File:** `apps/api/src/auth/csrf.guard.ts`
- **Root Cause:** The previous guard checked `request.headers['sec-fetch-site']` in a logical OR alongside `X-CSRF-Token` and `X-Requested-With`. Because `Sec-Fetch-Site` is an ambient browser metadata header, a cross-site request where the browser set `Sec-Fetch-Site: cross-site` was evaluated as having a valid custom security header, completely bypassing CSRF protection.
- **Correction:**
  - Explicitly reject `Sec-Fetch-Site: cross-site` for any cookie-authenticated mutation (`ForbiddenException('Cross-Site Request Forgery (CSRF) blocked: Sec-Fetch-Site is cross-site')`).
  - Do not treat the presence of `Sec-Fetch-Site` as proof of authorization.
  - Handle `same-origin` (accepted as verified browser provenance), `same-site` (requires matching Origin in allowed whitelist or custom header), `cross-site` (rejected), and `none` (requires origin or custom header) deliberately.
  - Preserve strict Origin and Referer validation against the allowed origins whitelist.
  - Custom headers (`X-Requested-With`, `X-CSRF-Token`) are supported when Origin is absent, governed by the browser Same-Origin Policy (SOP) and CORS preflight contract (browsers forbid cross-origin JavaScript from attaching custom headers without explicit server preflight approval).
  - Clarified in code comments that `X-Requested-With` is NOT a secret token.
  - Evaluated Login CSRF: because login/register do not use ambient cookies, they are not vulnerable to ambient-credential session riding. The frontend automatically attaches `X-Requested-With: XMLHttpRequest` to all mutating requests, providing SOP preflight defense.

### Finding 2: Development Database Credentials Hardening
- **File:** `docker-compose.yml`, `.env.example`, `.env`
- **Root Cause:** `docker-compose.yml` previously used a predictable password fallback (`${POSTGRES_PASSWORD:-postgres_master_dev_password}`), which could lead to accidental deployment with insecure default credentials.
- **Correction:**
  - Replaced fallback with required variable expansion:
    ```yaml
    POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?POSTGRES_PASSWORD must be set in environment or .env}
    ```
  - Docker Compose will refuse to start if `POSTGRES_PASSWORD` is unset.
  - Kept PostgreSQL (`127.0.0.1:5432:5432`) and Redis (`127.0.0.1:6379:6379`) strictly bound to localhost.
  - Documented setup instructions in `.env.example`.

### Finding 3: Frontend Refresh Concurrency & Single-Flight Client
- **File:** `apps/web/src/api/client.ts`, `apps/web/src/context/auth-context.tsx`
- **Root Cause:** When an access token expired, multiple simultaneous dashboard component queries (`/api/organizations`, `/api/channels`, `/api/auth/me`) simultaneously received 401. Without serialization, each request independently called `POST /api/auth/refresh`. Under the server's atomic token rotation and theft detection, the second concurrent refresh was treated as an attack and triggered emergency session family revocation.
- **Correction:**
  - Implemented a single-flight refresh mechanism using module-level `refreshPromise`.
  - When the first 401 occurs, it initiates `requestTokenRefresh()`. Subsequent concurrent 401s await the exact same promise.
  - When refresh succeeds (HTTP 200), all waiting requests unblock and retry their original requests once (`_retry: true`) with the new cookies. Exactly ONE refresh request is dispatched to the server.
  - If refresh fails, `authFailureHandler` clears the user and organization state and redirects to login.
  - The client never retries a consumed refresh token.

### Finding 4: Verification Report Accuracy & Test Taxonomy
- **Files:** `docs/MILESTONE_1_SECURITY_REVIEW.md`, `docs/MILESTONE_1_IMPLEMENTATION_REPORT.md`
- **Root Cause:** Previous reports had inconsistent test totals (29 vs 54) and conflated mocked guard unit tests with real database integration tests.
- **Correction:**
  - Standardized the test suite taxonomy into four explicit categories: Real Database Role & Infrastructure (18), Real Database Auth & Concurrency (18), Application Guard & Controller Unit Tests (24), and Frontend Single-Flight Refresh Unit Tests (5).
  - Total: 65 passing tests across 5 test suites.
  - Included actual terminal command logs and outputs.

---

## 3. Changed Files

| File | Change Description |
|---|---|
| `apps/api/src/auth/csrf.guard.ts` | Rewrote CSRF guard: explicit `Sec-Fetch-Site: cross-site` rejection, deliberate fetch metadata handling, strict Origin whitelist, SOP CORS custom header contract. |
| `docker-compose.yml` | Replaced default superuser password fallback with `${POSTGRES_PASSWORD:?}` required expansion; preserved `127.0.0.1` binding. |
| `.env.example` | Documented required `POSTGRES_PASSWORD` configuration. |
| `.env` | Configured local `POSTGRES_PASSWORD` for container orchestration. |
| `prisma/schema.prisma` | Added `directUrl = env("MIGRATION_DATABASE_URL")` to cleanly separate `orbit_migrator` DDL from `orbit_app` DML. |
| `apps/web/src/api/client.ts` | Implemented single-flight refresh queue (`refreshPromise`), 401 interceptor with single retry, failure handler, and `X-Requested-With` header. |
| `apps/web/src/context/auth-context.tsx` | Registered `setAuthFailureHandler` to clear session on refresh rejection. |
| `tests/integration/security-pass.spec.ts` | Added 10-test CSRF regression suite covering cross-site, same-origin, same-site, missing context, invalid origin, valid origin, custom header blank/valid. |
| `tests/unit/client-refresh.spec.ts` | New unit test suite (5 tests) verifying frontend single-flight refresh concurrency, deduplication, retry, and failure handling. |
| `vitest.config.ts` | Root vitest configuration unifying unit and integration suites. |
| `package.json` | Added `test:unit` script and unified `test` runner. |
| `docs/MILESTONE_1_SECURITY_REVIEW.md` | Comprehensive security review and technical contracts. |
| `docs/MILESTONE_1_IMPLEMENTATION_REPORT.md` | Updated implementation report v1.2.0 with accurate test taxonomy. |

---

## 4. Test Execution & Evidence

### 4.1 Unit Test Suite (`npm run test:unit`)
```text
$ npm run test:unit
 RUN  v2.1.9 H:/orbit-saas

 ✓ tests/unit/client-refresh.spec.ts (5 tests) 17ms

 Test Files  1 passed (1)
      Tests  5 passed (5)
   Duration  1.12s
```

### 4.2 Integration Test Suite (`npm run test:integration`)
```text
$ npm run test:integration
 RUN  v2.1.9 H:/orbit-saas

 ✓ tests/integration/db-permissions.spec.ts (11 tests) 559ms
 ✓ tests/integration/tenant-isolation.spec.ts (7 tests) 386ms
 ✓ tests/integration/auth.spec.ts (11 tests) 1010ms
 ✓ tests/integration/security-pass.spec.ts (31 tests) 1826ms

 Test Files  4 passed (4)
      Tests  60 passed (60)
   Duration  5.46s
```

### 4.3 Combined Full Suite (`npm test`)
```text
$ npm test
 RUN  v2.1.9 H:/orbit-saas

 ✓ tests/unit/client-refresh.spec.ts (5 tests) 26ms
 ✓ tests/integration/db-permissions.spec.ts (11 tests) 296ms
 ✓ tests/integration/tenant-isolation.spec.ts (7 tests) 195ms
 ✓ tests/integration/auth.spec.ts (11 tests) 918ms
 ✓ tests/integration/security-pass.spec.ts (31 tests) 1617ms

 Test Files  5 passed (5)
      Tests  65 passed (65)
   Duration  4.64s
```

### 4.4 Prisma Migration Status (`npx prisma migrate status`)
```text
$ npx prisma migrate status
Environment variables loaded from .env
Prisma schema loaded from prisma\schema.prisma
Datasource "db": PostgreSQL database "orbit_db", schema "public" at "172.28.46.91:5432"

1 migration found in prisma/migrations
Database schema is up to date!
```

### 4.5 TypeScript Typecheck (`npm run typecheck`)
```text
$ npm run typecheck
> tsc --build
(Exit code: 0, zero errors across 9 workspaces)
```

### 4.6 ESLint Verification (`npm run lint`)
```text
$ npm run lint
> eslint .
(Exit code: 0, zero errors, zero warnings)
```

### 4.7 Production Monorepo Build (`npm run build`)
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

## 5. Remaining Risks & Operating Boundaries

In accordance with Gravitas Invariant 6 (*Say what you cannot verify*):

1. **Stateless Access Token Lifetime Window (15 Minutes):**
   - Access tokens are stateless JWTs signed with `JWT_SECRET`. Once issued, an access token remains cryptographically valid until its 15-minute expiration timestamp.
   - For protected tenant data routes, `TenantGuard` performs a real-time database check on every request, immediately blocking suspended users or organizations.
   - For non-tenant or public routes, revocation is not instantaneous. If instantaneous global token revocation is required in production, Milestone 2 should introduce a Redis token denylist check in `JwtAuthGuard`.
2. **Browser SOP Dependency for Custom Header CSRF Defense:**
   - The custom header defense (`X-Requested-With`) relies on modern browser enforcement of the Same-Origin Policy and CORS preflight. Non-browser clients (such as curl or custom scripts) can set arbitrary headers; however, non-browser clients do not store or automatically attach ambient session cookies, so ambient-credential CSRF is an exclusively browser-side threat.
3. **Deferred Milestone 2 Scope Boundaries:**
   - Live external webhook ingestion (Meta WhatsApp Cloud API, Instagram Webhooks, Stripe billing hooks), cryptographic HMAC signature validation against external endpoints, and standalone deployment of `apps/ingress` are strictly deferred to Milestone 2.
   - The database role `orbit_ingress` is verified to have ZERO table access in PostgreSQL.

---

## 6. Final Approval Recommendation

Milestone 1 satisfies the architectural, relational, security, and verification contracts defined in `docs/ARCHITECTURE.md` v1.1.5. All identified vulnerabilities and edge-case behaviors (IDOR, concurrency race conditions, CSRF bypass, credential fallbacks, and frontend refresh collisions) have been resolved with defense-in-depth engineering and verified by automated tests.

**Recommendation:** **APPROVE MILESTONE 1 AS COMPLETE AND ADVANCE TO MILESTONE 2.**
