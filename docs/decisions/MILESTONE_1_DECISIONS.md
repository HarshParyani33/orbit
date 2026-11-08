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
