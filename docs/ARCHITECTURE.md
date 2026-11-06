# PROJECT ORBIT: SYSTEM ARCHITECTURE & MULTI-TENANT SPECIFICATION

**Document Version:** 1.1.5 (Production Architecture Specification)  
**Status:** Architecture Approved — Ready for Milestone 1 Implementation  
**Target Milestone:** Milestone 1 (Monorepo Foundation, PostgreSQL RLS & Authentication)  
**Engineering Discipline:** Governed by Gravitas (6 Invariants — Core Skill Mode)

---

## 1. Executive Summary & Core Principles

Project Orbit is a multi-tenant AI customer engagement SaaS built for small-to-medium businesses. It consolidates omnichannel conversations (Website Chat Widget, WhatsApp Business, Instagram Messaging) into a Unified Inbox, augments human agents with grounded AI suggestion engines, provides a "Teach-the-AI" rule compiler, and executes business automation workflows.

### 1.1 Architectural Principles
1. **Modular Monolith First:** NestJS backend (`apps/api`), React 18+ dashboard (`apps/web`), embeddable chat widget (`apps/widget`), and asynchronous BullMQ worker (`apps/worker`) coexisting in a single typed monorepo.
2. **Defensive Multi-Tenancy:** Multi-tenancy is enforced in depth: API guards, transactional PostgreSQL Row-Level Security (RLS) with `SET LOCAL`, composite foreign keys, and restricted runtime database roles.
3. **Stateless Scalability:** Application nodes retain zero in-memory session state; state is strictly partitioned across PostgreSQL 16 (relational truth & pgvector) and Redis 7 (sessions, queues, pub/sub).
4. **Provider-Independent Abstractions:** AI inference and messaging channels sit behind strict adapter interfaces with deterministic mock implementations, allowing 100% offline development and demoing without external API dependencies.

---

## 2. Gravitas Engineering Verification & Operating Mode

Gravitas is installed in the workspace as our engineering reliability runtime.

### 2.1 Diagnostic Status & Operating Mode
Diagnostic script executed at `python .agents/skills/gravitas/scripts/doctor.py`:
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

**Clarification of Capabilities & Checksums:**
- `skills-lock.json` contains `"computedHash": "5d80d2ba5e74b151cff1ce9b4d1409019b22939154d82a938ad280554c447695"`, which is the SHA-256 hash computed by the `skills` CLI over the installed `SKILL.md` content at installation time.
- `doctor.py` outputs `"canonical_skill_sha256": "093c91dd12d1c78dee3fd31f93b1aad7aea454e7fe17f9b1f0f9a9cca7674553"`, which is the canonical SHA-256 checksum of the core rule set in the official Gravitas upstream release. Both are verified and authentic.
- **Genuine Available Operating Mode:** **Core Skill Mode** (prompt-based behavioral discipline, decision records, evidence-backed verification). Automated native hook interception is NOT available because the Antigravity CLI and native plugin hooks are not installed. Invariant enforcement is executed directly through behavioral discipline and verified commands.

### 2.2 Mandatory Execution Invariants
All operations in this codebase strictly enforce the Six Invariants:
1. *Ground before mutating:* Inspect file state, tests, and callers before editing. Never act on assumed state.
2. *Stay in declared scope:* Confine modifications strictly to task boundaries.
3. *Completion needs evidence:* No task is complete without executed command proof.
4. *Never exact-retry a failure:* Diagnose root cause before retrying failed steps.
5. *Satisfy the contract:* Acceptance criteria gate completion.
6. *Say what you can't verify:* Explicitly report limitations and mock boundaries.

### 2.3 Version 1.1.5 Technical Corrections Summary
This final specification pass addresses four verified technical findings prior to Milestone 1 authorization:
1. **Explicit Table Grants (Finding 1):** Removed blanket `ALTER DEFAULT PRIVILEGES ... GRANT DML TO orbit_app;`. Replaced with explicit categorized grants (Category A: Tenant tables; Category B: Read-only pricing catalogs; Category C: Zero-table-access routing lookups; Category D: Application-guarded identity tables).
2. **Ingress Process & Credential Boundary (Finding 2):** Defined isolated ingress service runtime (`apps/ingress`) holding `INGRESS_DATABASE_URL`. General API and dashboard services do not receive ingress credentials. Enforced cryptographic signature verification before database resolution.
3. **USD-Only Provider Cost Consistency (Finding 3 - Approach A):** Enforced `CHECK (currency = 'USD')` on `ai_model_pricing_schedules` and `ai_request_attempts`, harmonizing snapshot rates, provider liabilities (`incurred_provider_cost_usd`), and usage ledgers (`billed_amount_usd`) in USD.
4. **Outbound Side-Effect Idempotency & Safe Recovery (Finding 4):** Qualified outbound side-effects across distributed networks by provider capabilities (Tier 1: Native keys; Tier 2: Status reconciliation; Tier 3: High-risk blind retries), eliminated false "exactly-once" network claims, and introduced the `UNKNOWN_OUTCOME` quarantine and operator resolution protocol.

---

## 3. High-Level Architecture & Unified Security Flow

```mermaid
flowchart TD
    subgraph Ingress["Client Requests & Ingress"]
        WebDash["Dashboard Client (React)"]
        ChatWidget["Chat Widget (Iframe)"]
        Webhooks["Inbound Webhooks (Meta/Stripe)"]
    end

    subgraph AuthLayer["Authentication & Ingress Security"]
        DashAuth["Dashboard Auth: JWT Cookie (sub: userId)"]
        WidgetAuth["Visitor Capability Guard: WIDGET_SECRET + Origin + Rate Limit"]
        WebhookAuth["Webhook Guard: Cryptographic HMAC Signature Verification (Raw Body Buffer)"]
        IngressLookup["resolve_channel_routing(provider, external_id)\n(Dedicated orbit_ingress Role: ZERO table access, STRICT SECURITY DEFINER)"]
    end

    subgraph TenantResolution["Trusted TenantContext Derivation"]
        ReqOrgHeader["Client Header: X-Organization-Id"]
        VerifyMembership{"Verify Active Membership in DB/Redis"}
        MakeTenantContext["Construct Trusted TenantContext\n(userId, organizationId, role)"]
    end

    subgraph OutboxDispatcher["Webhook Outbox & Dispatch Engine"]
        OutboxTable["Transactional Outbox (webhook_events)\ndispatch_status: PENDING_DISPATCH"]
        ImmediateDispatch["Immediate HTTP Handler Dispatch\n(Claims dispatch_token -> Enqueues to BullMQ)"]
        DispatchSweeper["Background Dispatch Sweeper\n(FOR UPDATE SKIP LOCKED + BullMQ Job ID = event.id)"]
        BullMQQueue[("BullMQ Redis Queue: webhooks")]
    end

    subgraph ExecutionPlane["Service Execution & Transaction Boundaries"]
        NestServices["NestJS Application Services\n(Direct PrismaClient Injection Forbidden)"]
        WorkerJobs["BullMQ Worker Jobs (Payload: orgId, eventId)"]
        TenantRunner["TenantTransactionRunner\nBEGIN -> tx.$queryRaw(set_config) -> fn(tx) -> COMMIT"]
    end

    subgraph DataPlane["PostgreSQL 16 Engine"]
        RoleApp["Role: orbit_app (NOSUPERUSER, NOBYPASSRLS)"]
        RoleIngress["Role: orbit_ingress (NOSUPERUSER, NOBYPASSRLS, ZERO Table Access)"]
        RLS["PostgreSQL RLS Engine (FORCE ROW LEVEL SECURITY)"]
        Tables[("Tenant Tables with Composite Foreign Keys")]
    end

    WebDash --> DashAuth --> ReqOrgHeader
    ReqOrgHeader --> VerifyMembership
    DashAuth -.->|userId| VerifyMembership
    VerifyMembership -->|Valid| MakeTenantContext
    VerifyMembership -->|Invalid / Missing| Deny403["403 Forbidden"]

    ChatWidget --> WidgetAuth --> MakeTenantContext
    Webhooks --> WebhookAuth --> IngressLookup --> MakeTenantContext
    MakeTenantContext --> OutboxTable
    OutboxTable --> ImmediateDispatch --> BullMQQueue
    OutboxTable --> DispatchSweeper --> BullMQQueue

    MakeTenantContext --> NestServices
    NestServices --> TenantRunner
    BullMQQueue --> WorkerJobs --> TenantRunner

    IngressLookup -.-> RoleIngress
    TenantRunner --> RoleApp --> RLS --> Tables
```

---

## 4. PostgreSQL Database Security & Role Permissions

### 4.1 Security Boundary & Threat Model
- **Application Setting Boundary:** `app.current_org_id` is an application-established PostgreSQL session parameter set by the application role (`orbit_app`).
- **SQL Injection Reality:** RLS does **not** protect against arbitrary SQL injection; an attacker with arbitrary SQL capabilities can execute `SELECT set_config('app.current_org_id', 'target-org-id', true);` to hijack context.
- **True Function of RLS:** Protects against **accidental unscoped queries** (omitted `where` clauses, ORM join errors, or raw reporting bugs).
- **Mandatory Countermeasures:** All database interactions must use parameterized Prisma tagged template literals (`tx.$queryRaw`) or the Prisma query builder. Raw string concatenation is strictly prohibited by architectural linting.

### 4.2 Distinguishing Permission Layers
PostgreSQL security is partitioned into four distinct, non-overlapping layers:
1. **Database Connection Privileges:** Governs whether a TCP client can connect to the database.
2. **Schema Privileges:** Governs whether a connected role can resolve objects (`USAGE`) or create objects (`CREATE`) within a schema.
3. **Table & Sequence Privileges:** Governs which SQL operations (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) an application role may perform on objects.
4. **Row-Level Security Policies:** Governs which specific rows are visible or mutable during permitted table operations.

### 4.3 Database Roles & Provisioning Script
The provisioning script explicitly revokes `PUBLIC` database privileges and grants `CONNECT` to authorized roles in the correct sequence. `SUPERUSER` is strictly prohibited.

```sql
-- ============================================================================
-- 1. DATABASE ROLE CREATION (Non-Superuser)
-- ============================================================================
CREATE ROLE orbit_migrator WITH
  LOGIN
  PASSWORD 'REPLACE_WITH_MIGRATOR_SECRET'
  NOSUPERUSER
  BYPASSRLS
  NOCREATEDB
  NOCREATEROLE;

CREATE ROLE orbit_app WITH
  LOGIN
  PASSWORD 'REPLACE_WITH_APP_SECRET'
  NOSUPERUSER
  NOBYPASSRLS
  NOCREATEDB
  NOCREATEROLE;

CREATE ROLE orbit_ingress WITH
  LOGIN
  PASSWORD 'REPLACE_WITH_INGRESS_SECRET'
  NOSUPERUSER
  NOBYPASSRLS
  NOCREATEDB
  NOCREATEROLE;

-- ============================================================================
-- 2. DATABASE CONNECTION PRIVILEGES
-- ============================================================================
-- Revoke all default public permissions on the database
REVOKE ALL ON DATABASE orbit_db FROM PUBLIC;

-- Explicitly grant CONNECT to migration, runtime, and ingress roles
GRANT CONNECT ON DATABASE orbit_db TO orbit_migrator;
GRANT CONNECT ON DATABASE orbit_db TO orbit_app;
GRANT CONNECT ON DATABASE orbit_db TO orbit_ingress;

-- ============================================================================
-- 3. SCHEMA OWNERSHIP & PRIVILEGES
-- ============================================================================
-- Schema public is owned exclusively by orbit_migrator
ALTER SCHEMA public OWNER TO orbit_migrator;
GRANT USAGE, CREATE ON SCHEMA public TO orbit_migrator;
GRANT USAGE ON SCHEMA public TO orbit_app;
GRANT USAGE ON SCHEMA public TO orbit_ingress;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM orbit_app;
REVOKE CREATE ON SCHEMA public FROM orbit_ingress;

-- ============================================================================
-- 4. CATEGORIZED TABLE & SEQUENCE PERMISSIONS (Explicit Least-Privilege Grants)
-- ============================================================================
-- Sequences: Runtime role requires USAGE and SELECT to consume sequences
ALTER DEFAULT PRIVILEGES FOR ROLE orbit_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO orbit_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO orbit_app;

-- orbit_ingress receives ZERO direct table or sequence privileges
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM orbit_ingress;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM orbit_ingress;

-- Category A: Tenant-Domain Data Tables (Governed by PostgreSQL Row-Level Security)
-- orbit_app has full DML within tenant context; orbit_ingress has ZERO access
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  channels,
  channel_credentials,
  contacts,
  conversations,
  messages,
  webhook_events,
  ai_requests,
  ai_request_attempts,
  ai_reservations,
  ai_usage_events,
  usage_records,
  audit_logs,
  subscriptions
TO orbit_app;

-- Category B: System Reference Catalogs (Strictly Read-Only to Runtime Application)
-- DML is strictly reserved for orbit_migrator; orbit_app receives SELECT only
GRANT SELECT ON TABLE ai_model_pricing_schedules TO orbit_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE ai_model_pricing_schedules FROM orbit_app;

-- Category C: Routing Metadata Tables (Zero Direct Table Access)
-- Both orbit_app and orbit_ingress are denied direct table access; accessible strictly via SECURITY DEFINER functions
REVOKE ALL ON TABLE channel_routing_lookups FROM PUBLIC, orbit_app, orbit_ingress;

-- Category D: Global Identity & Membership Tables (Application-Guarded)
-- Accessed strictly by authentication and session verification services
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  users,
  user_sessions,
  organizations,
  organization_memberships
TO orbit_app;

-- Protocol for Future Migrations:
-- Blanket default DML grants (ALTER DEFAULT PRIVILEGES ... GRANT DML TO orbit_app) are PROHIBITED.
-- Every migration script executed by orbit_migrator must explicitly declare table-level GRANT
-- statements matching that table's exact security classification (Category A, B, C, or D).

-- Ensure btree_gist extension is available for temporal constraints
CREATE EXTENSION IF NOT EXISTS btree_gist;
```

### 4.4 Narrow Routing Lookup Table & SECURITY DEFINER Control
To completely prevent normal application code or compromised tenant queries from enumerating, reading, or tampering with routing mappings across organizations:

1. `channel_routing_lookups` is owned by `orbit_migrator`.
2. Direct table access on `channel_routing_lookups` is **strictly revoked from both `orbit_app` and `orbit_ingress`**.
3. Inbound ingress resolution is granted **exclusively to `orbit_ingress`** via `resolve_channel_routing()`. General application code (`orbit_app`) is denied execution of this function.
4. Channel management writes are granted **exclusively to `orbit_app`** via tenant-bounded functions `register_channel_routing()` and `deregister_channel_routing()`.
5. All functions enforce `SET search_path = public, pg_temp` and input validation.

```sql
-- ============================================================================
-- 5. CHANNEL ROUTING METADATA SCHEMA & ACCESS CONTROL
-- ============================================================================

-- Channels Table declaration including composite unique constraint
CREATE TABLE channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  provider VARCHAR(32) NOT NULL,          -- 'META_WHATSAPP', 'META_INSTAGRAM', 'WEB_CHAT'
  name VARCHAR(64) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'INACTIVE'
  config JSONB NOT NULL DEFAULT '{}',
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_channels_id_org UNIQUE (id, organization_id)
);

-- Routing Metadata Table
CREATE TABLE channel_routing_lookups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(32) NOT NULL,          -- 'META_WHATSAPP', 'META_INSTAGRAM', 'STRIPE'
  external_account_id VARCHAR(128) NOT NULL, -- e.g. Phone Number ID, IG Account ID, Stripe Account ID
  channel_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'INACTIVE'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Uniqueness Scope: An external identifier can belong to at most ONE organization
  CONSTRAINT uq_channel_routing_provider_ext UNIQUE (provider, external_account_id),
  
  -- Relational Integrity: Tying channel strictly to the same organization
  CONSTRAINT fk_routing_channel_org FOREIGN KEY (channel_id, organization_id)
    REFERENCES channels (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT fk_routing_org FOREIGN KEY (organization_id)
    REFERENCES organizations (id) ON DELETE CASCADE
);

-- Composite Index for tenant cleanup, joins, and soft-delete synchronization
CREATE INDEX idx_channel_routing_org_channel 
  ON channel_routing_lookups(organization_id, channel_id);

-- REVOKE DIRECT ACCESS: Neither orbit_app nor orbit_ingress can directly access this table
REVOKE ALL ON TABLE channel_routing_lookups FROM PUBLIC, orbit_app, orbit_ingress;

-- ============================================================================
-- 6. SECURITY DEFINER ROUTING FUNCTIONS
-- ============================================================================

-- Function 1: Webhook Ingress Lookup (Unauthenticated Pre-Tenant Resolution)
-- Strictly granted to orbit_ingress ONLY. orbit_app has NO execute permission.
CREATE OR REPLACE FUNCTION resolve_channel_routing(
  p_provider VARCHAR,
  p_external_account_id VARCHAR
)
RETURNS TABLE (
  channel_id UUID,
  organization_id UUID,
  status VARCHAR
)
LANGUAGE plpgsql
STRICT
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_provider IS NULL OR p_external_account_id IS NULL OR
     length(trim(p_provider)) = 0 OR length(trim(p_external_account_id)) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT c.channel_id, c.organization_id, c.status
  FROM channel_routing_lookups c
  WHERE c.provider = trim(p_provider)
    AND c.external_account_id = trim(p_external_account_id)
    AND c.status = 'ACTIVE'
  LIMIT 1;
END;
$$;

ALTER FUNCTION resolve_channel_routing(VARCHAR, VARCHAR) OWNER TO orbit_migrator;
REVOKE ALL ON FUNCTION resolve_channel_routing(VARCHAR, VARCHAR) FROM PUBLIC, orbit_app;
GRANT EXECUTE ON FUNCTION resolve_channel_routing(VARCHAR, VARCHAR) TO orbit_ingress;

-- Function 2: Authorized Channel Routing Registration (Tenant-Bounded)
-- Strictly granted to orbit_app ONLY. Validates channel existence, ownership, active status, and provider match.
CREATE OR REPLACE FUNCTION register_channel_routing(
  p_channel_id UUID,
  p_provider VARCHAR,
  p_external_account_id VARCHAR
)
RETURNS VOID
LANGUAGE plpgsql
STRICT
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_org UUID;
  v_channel_record RECORD;
  v_clean_provider VARCHAR;
  v_clean_ext_id VARCHAR;
BEGIN
  -- 1. Verify tenant context established via SET LOCAL
  v_current_org := NULLIF(current_setting('app.current_org_id', true), '')::UUID;
  IF v_current_org IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: tenant context app.current_org_id is not set'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 2. Clean input strings
  v_clean_provider := trim(p_provider);
  v_clean_ext_id := trim(p_external_account_id);
  IF length(v_clean_provider) = 0 OR length(v_clean_ext_id) = 0 THEN
    RAISE EXCEPTION 'Invalid parameters: provider and external account identifier must be non-empty'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- 3. Comprehensive channel verification: exists, belongs to tenant, not deleted, active, matching provider
  SELECT id, organization_id, provider, status, deleted_at
  INTO v_channel_record
  FROM channels
  WHERE id = p_channel_id AND organization_id = v_current_org;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unauthorized: channel does not exist in the active organization'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF v_channel_record.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invalid operation: cannot register routing for a deleted channel'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF v_channel_record.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Invalid operation: channel must be ACTIVE to register routing'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF v_channel_record.provider <> v_clean_provider THEN
    RAISE EXCEPTION 'Provider mismatch: channel provider % does not match requested routing provider %',
      v_channel_record.provider, v_clean_provider
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- 4. Atomic upsert: cannot claim an external account belonging to another tenant
  INSERT INTO channel_routing_lookups (
    channel_id,
    organization_id,
    provider,
    external_account_id,
    status,
    updated_at
  )
  VALUES (
    p_channel_id,
    v_current_org,
    v_clean_provider,
    v_clean_ext_id,
    'ACTIVE',
    NOW()
  )
  ON CONFLICT (provider, external_account_id)
  DO UPDATE SET
    channel_id = EXCLUDED.channel_id,
    status = 'ACTIVE',
    updated_at = NOW()
  WHERE channel_routing_lookups.organization_id = v_current_org;

  IF NOT FOUND AND EXISTS (
    SELECT 1 FROM channel_routing_lookups 
    WHERE provider = v_clean_provider AND external_account_id = v_clean_ext_id
  ) THEN
    RAISE EXCEPTION 'Conflict: external account identifier is already registered by another organization'
      USING ERRCODE = 'unique_violation';
  END IF;
END;
$$;

ALTER FUNCTION register_channel_routing(UUID, VARCHAR, VARCHAR) OWNER TO orbit_migrator;
REVOKE ALL ON FUNCTION register_channel_routing(UUID, VARCHAR, VARCHAR) FROM PUBLIC, orbit_ingress;
GRANT EXECUTE ON FUNCTION register_channel_routing(UUID, VARCHAR, VARCHAR) TO orbit_app;

-- Function 3: Authorized Channel Routing Deregistration (Tenant-Bounded)
CREATE OR REPLACE FUNCTION deregister_channel_routing(
  p_channel_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
STRICT
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_org UUID;
BEGIN
  v_current_org := NULLIF(current_setting('app.current_org_id', true), '')::UUID;
  IF v_current_org IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: tenant context app.current_org_id is not set'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  DELETE FROM channel_routing_lookups
  WHERE channel_id = p_channel_id AND organization_id = v_current_org;
END;
$$;

ALTER FUNCTION deregister_channel_routing(UUID) OWNER TO orbit_migrator;
REVOKE ALL ON FUNCTION deregister_channel_routing(UUID) FROM PUBLIC, orbit_ingress;
GRANT EXECUTE ON FUNCTION deregister_channel_routing(UUID) TO orbit_app;
```

### 4.5 Ingress Process Boundary, Credential Isolation & Security Architecture

1. **Dedicated Ingress Process & Service Boundary (`apps/ingress`):**
   - Webhook ingress runs within an isolated process boundary. In decoupled production deployments, this runs as a standalone lightweight container service (`apps/ingress` / `orbit-ingress-service`). In monolithic single-pod deployments, it executes within an encapsulated `WebhookIngressModule` possessing its own isolated database connection pool.
2. **Strict Credential Isolation (`INGRESS_DATABASE_URL`):**
   - The ingress service is provisioned **strictly** with `INGRESS_DATABASE_URL` (`postgresql://orbit_ingress:***@host:5432/orbit_db`, pool size: 5 connections).
   - Core API, dashboard backend, and worker services (`apps/api`, `apps/worker`) do **not** receive `INGRESS_DATABASE_URL` in their environment variables and cannot connect under the `orbit_ingress` role.
   - Conversely, the ingress service does **not** receive `DATABASE_URL` (`orbit_app`). It cannot connect as `orbit_app` and has zero database credentials to access tenant tables.
3. **Zero Direct Table Access for `orbit_ingress`:**
   - In PostgreSQL, `orbit_ingress` has **zero** table and sequence privileges (`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM orbit_ingress;`). It cannot query `users`, `conversations`, `messages`, `contacts`, or even `channel_routing_lookups` directly.
   - It is granted execute permission **strictly** on `resolve_channel_routing(:provider, :externalAccountId)`.
4. **Mandatory Signature Gating Before Database Lookup:**
   - Webhook ingress controllers execute cryptographic signature verification (`X-Hub-Signature-256`, `Stripe-Signature`) over the unparsed raw request body `Buffer` **before** querying `resolve_channel_routing()`.
   - Unauthenticated or forged webhook payloads are rejected immediately at the HTTP edge with HTTP 401/403 and **never hit the database**.
5. **Edge Rate Limiting & DoS Protection:**
   - Ingress endpoints are fronted by Redis token-bucket rate limiters (e.g. 100 webhook hits/second per provider endpoint) to absorb traffic spikes and volumetric attacks before database connections are utilized.
6. **Independent Credential Rotation:**
   - `orbit_ingress` credentials can be rotated independently in PostgreSQL and the ingress environment without recycling core application connection pools or disrupting active user sessions.
7. **Service Ingress Handoff Topologies:**
   - *Decoupled Ingress Service Topology (High-Scale Production):* The ingress service verifies HMAC -> resolves routing via `resolve_channel_routing` -> pushes the verified event payload `{ organizationId, channelId, provider, idempotencyKey, rawPayload }` directly to the BullMQ `ingress-webhooks` queue in Redis. The core ingestion worker (holding `DATABASE_URL` / `orbit_app`) dequeues the job and executes `TenantTransactionRunner.runWithTenant()` to persist into `webhook_events` within the transactional outbox.
   - *Encapsulated Direct Ingress Topology (Milestone 1 / Single-Pod):* `WebhookIngressModule` uses the dedicated `orbit_ingress` pool to verify HMAC and resolve `(organization_id, channel_id)`, then immediately passes the resolved context to `WebhookOutboxService`, which executes `TenantTransactionRunner.runWithTenant()` via `orbit_app` to persist the event in PostgreSQL. In both topologies, `orbit_ingress` itself never possesses table write privileges.

### 4.6 Concrete Reference RLS Policy
Applied to every tenant-owned table:
```sql
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON conversations
  FOR ALL
  TO orbit_app
  USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
```
**Missing Context Behavior:** If `app.current_org_id` is unset or empty, `current_setting('app.current_org_id', true)` returns `''` or `NULL`. `NULLIF(..., '')::uuid` evaluates to `NULL`. The comparison `organization_id = NULL` evaluates to `NULL` (falsy in SQL boolean logic). Consequently:
- `SELECT`, `UPDATE`, and `DELETE` return 0 rows.
- `INSERT` and `UPDATE` fail immediately with a policy violation error.

---

## 5. Complete Ingress Tenant-Context Flows

```mermaid
sequenceDiagram
    autonumber
    actor Client as Ingress (Dashboard / Widget / Webhook / Worker)
    participant Gateway as Ingress Guard & Validator
    participant Func as resolve_channel_routing() [orbit_ingress Role]
    participant DB as PostgreSQL / Redis Cache
    participant Service as Application Domain Service
    participant Runner as TenantTransactionRunner [orbit_app Role]

    alt Dashboard Request
        Client->>Gateway: GET /api/v1/inbox (Cookie: access_token, Header: X-Org-Id)
        Gateway->>DB: Verify membership: user_id + org_id + status='ACTIVE'
        Gateway->>Gateway: Construct TenantContext { userId, orgId, role }
    else Widget Request
        Client->>Gateway: POST /api/widget/message (Bearer: visitorToken, Origin: example.com)
        Gateway->>Gateway: Verify WIDGET_JWT_SECRET, Origin matches channel.allowed_domains
        Gateway->>Gateway: Construct TenantContext { visitorId, orgId, channelId, role: 'WIDGET_VISITOR' }
    else Webhook Ingestion
        Client->>Gateway: POST /api/webhooks/whatsapp (Payload, X-Hub-Signature-256)
        Gateway->>Gateway: Verify raw body HMAC-SHA256 using META_APP_SECRET
        Gateway->>Func: resolve_channel_routing(:provider, :phoneId) via orbit_ingress pool
        Note over Func: Executes as orbit_ingress.<br/>Zero table access; returns only 3 routing fields.<br/>(NO general table access, NO customer data)
        Func-->>Gateway: Routing Record { channelId, orgId, status: 'ACTIVE' }
        Gateway->>Gateway: Construct TenantContext { systemWebhook, orgId, channelId }
    else Background Worker Job
        Client->>Gateway: BullMQ Worker dequeues job { organizationId, eventId }
        Gateway->>Gateway: Construct TenantContext { worker, orgId }
    end

    Gateway->>Service: handleRequest(tenantContext)
    Service->>Runner: runWithTenant(tenantContext.orgId, fn(tx))
    Runner->>DB: BEGIN -> SELECT set_config('app.current_org_id', orgId, true)
    Runner->>DB: Execute protected queries on tx
    DB-->>Runner: Scoped results
    Runner->>DB: COMMIT
    Service-->>Client: Response
```

### 5.1 Ingress Details by Channel
1. **Dashboard Ingress:** Verified via HTTP-only JWT cookie (`sub: userId`). Header `X-Organization-Id` is treated as an unverified routing hint. Backend queries `organization_memberships` (`WHERE user_id = :userId AND organization_id = :orgId AND status = 'ACTIVE'`). Only verified memberships produce a trusted `TenantContext`.
2. **Widget Ingress:** Validates a signed visitor session token signed with `WIDGET_JWT_SECRET`. Claims: `{ sub: visitorId, channelId, orgId, type: 'WIDGET_VISITOR', exp }`. `WidgetGuard` enforces:
   - Request `Origin` matches `channels.config.allowed_domains`.
   - Token is restricted strictly to `/api/widget/*`. Any attempt to call dashboard routes returns 403.
   - Redis token-bucket rate limits: 10 msg/min per visitor, 50 session inits/min per IP.
3. **Webhook Ingress & Narrow Routing Lookup:**
   - Inbound webhook verifies signature via provider-specific verification adapter using the system-level platform secret (e.g. `META_APP_SECRET` or Stripe Webhook Endpoint Secret).
   - Inbound payload has no JWT or tenant header. To establish `TenantContext`, the backend extracts the external account identifier (e.g. Meta `phone_number_id` or Stripe account ID) and calls `resolve_channel_routing` using the dedicated `orbit_ingress` connection pool:
     ```sql
     SELECT channel_id, organization_id, status
     FROM resolve_channel_routing(:provider, :externalAccountId);
     ```
   - **Narrow Scope Guarantee:** Direct table queries on `channel_routing_lookups` are revoked from both `orbit_app` and `orbit_ingress`. If no record is found or status is not `ACTIVE`, the request is rejected immediately with 404/400.
   - Once `organization_id` is resolved, the webhook event is inserted into `webhook_events` within that tenant's transaction via `TenantTransactionRunner.runWithTenant(organizationId, ...)` using the standard `orbit_app` pool.
4. **Background Worker Ingress:** BullMQ jobs mandate an `organizationId` payload. Workers instantiate `TenantTransactionRunner.runWithTenant(job.data.organizationId, fn(tx))` before executing any domain logic.

---

## 6. Data Classification, Soft-Deletion & Retention

### 6.1 Entity Classification Matrix

| Table Name | Scope | Tenant Isolation Mechanism | Retention Window | Justification & Access Rules |
|---|---|---|---|---|
| `users` | **Global** | Identity Guard / Unique Email | Indefinite / GDPR Erasure | Global user identities across workspaces. Accessible strictly by authenticated user. |
| `user_sessions` | **Global** | `userId` Foreign Key | 30 Days | Refresh token sessions with rotation. Purged after revocation or expiry. |
| `organizations` | **Global / Root** | Membership Verification | Indefinite / Soft-Delete | Root tenant container. Read/write governed by verified membership role. |
| `organization_memberships` | **Global / Pivot** | `(userId, organizationId)` Unique | Active + 30 Days Audit | Bridges global users to tenant workspaces. Only visible to workspace members. |
| `channel_routing_lookups` | **Global / Routing** | SECURITY DEFINER Functions | Lifetime of Channel | Minimal routing table mapping external IDs to channels. Zero direct table access. Zero customer PII. |
| `channels` | **Tenant-Owned** | RLS + Composite FK | Indefinite / Soft-Delete | Communication endpoints. `ON DELETE RESTRICT`. |
| `channel_credentials` | **Tenant-Owned** | RLS + Composite FK | Lifetime of Channel | AES-256-GCM encrypted API keys per channel. Purged on channel removal. |
| `contacts` | **Tenant-Owned** | RLS + Composite FK | Active Customer Lifetime | CRM customer profiles isolated per tenant. Purged after grace period. |
| `conversations` | **Tenant-Owned** | RLS + Composite FK | Active Customer Lifetime | Customer inquiry threads. Anonymized on organization deletion. |
| `messages` | **Tenant-Owned** | RLS + Composite FK | Active Customer Lifetime | Customer and agent message history. Anonymized on organization deletion. |
| `webhook_events` | **Tenant-Owned** | RLS + Composite FK + Outbox | 30 Days Payload / 90 Days Metadata | Raw customer webhooks. Payloads wiped after 30 days. `ON DELETE RESTRICT`. |
| `ai_requests` | **Tenant-Owned** | RLS + Composite FK | 7 Years (Financial Audit) | Logical customer AI turns. `ON DELETE RESTRICT`. |
| `ai_model_pricing_schedules` | **Global / System** | Read-Only Catalog | Indefinite (Versioned) | Historical model pricing rate table with temporal exclusion constraints. Read-only for `orbit_app`. |
| `ai_request_attempts` | **Tenant-Owned** | RLS + Composite FK | 7 Years (Financial Audit) | Physical provider attempts and platform COGS liabilities. `ON DELETE RESTRICT`. |
| `ai_reservations` | **Tenant-Owned** | RLS + Composite FK | 30 Days (Operational) | Durable token quota reservation ledger. `ON DELETE CASCADE`. |
| `ai_usage_events` | **Tenant-Owned** | RLS + Composite FK | 7 Years (Statutory Tax) | Customer-billable ledger events. `ON DELETE RESTRICT`. |
| `usage_records` | **Tenant-Owned** | RLS + Composite Unique | 7 Years (Statutory Tax) | Monthly aggregate usage quotas. `ON DELETE RESTRICT`. |
| `audit_logs` | **Tenant-Owned** | RLS + `organization_id` FK | 365 Days | Immutable compliance audit trail. `ON DELETE RESTRICT`. |
| `subscriptions` | **Tenant-Owned** | RLS + `organization_id` FK | 7 Years (Statutory Tax) | Tenant billing tier and limits. `ON DELETE RESTRICT`. |

### 6.2 Organization Deletion & Retention Architecture
To resolve the conflict between foreign key cascading and statutory audit retention:
- **Normal Organization Deletion is Soft Deletion:** `organizations` includes `deleted_at TIMESTAMPTZ NULL` and `status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE'` (`ACTIVE`, `SUSPENDED`, `PENDING_DELETION`, `DELETED`).
- When a Business Owner requests organization deletion:
  1. Status transitions to `PENDING_DELETION`, setting `deleted_at = NOW()`.
  2. Active channels, webhooks, routing lookups, and AI response engines are disabled immediately:
     ```sql
     UPDATE channel_routing_lookups SET status = 'INACTIVE', updated_at = NOW() WHERE organization_id = :orgId;
     ```
  3. A 30-day grace period is observed before permanent data anonymization.
- **Audit & Financial Record Retention (`ON DELETE RESTRICT`):**
  - `audit_logs`: Retained for 365 days. Governed by `ON DELETE RESTRICT`.
  - `usage_records`, `subscriptions`, `ai_requests`, `ai_request_attempts`, and `ai_usage_events`: Retained for 7 years for platform COGS auditability, financial dispute defense, and tax compliance. Governed by `ON DELETE RESTRICT`.
  - An organization cannot be hard-deleted from PostgreSQL while dependent financial and audit records remain within their statutory retention windows.
- **Controlled Permanent Deletion Workflow:**
  1. *Phase 1 (Immediate):* Soft deletion (`deleted_at = NOW()`). All ingress endpoints reject tenant traffic.
  2. *Phase 2 (Post-Grace Period):* An automated purge worker permanently anonymizes customer CRM profiles, conversations, messages, and purges raw webhook payloads (`payload = '{}'`).
  3. *Phase 3 (Statutory Expiration):* After the 7-year statutory retention window lapses for financial and audit records, an authorized compliance archivist script archives the audit/billing ledger to long-term cold storage and completes the hard deletion.

---

## 7. Recoverable Webhook Ingestion & Transactional Outbox

### 7.1 Provider-Specific Verification & Secret Handling
Signature verification formats, secret storage, and handshake protocols differ fundamentally across providers and must not be conflated:

1. **Meta WhatsApp & Instagram Verification Architecture:**
   - **Meta App Secret (`META_APP_SECRET`):** Stored strictly as an application-level environment variable (e.g. `META_WHATSAPP_APP_SECRET` or `META_INSTAGRAM_APP_SECRET`). In Meta's architecture, webhooks are configured at the Meta App level; Meta signs **all** inbound webhook payloads directed to the application endpoint using the Meta App Secret.
   - **Inbound Signature Header:** `X-Hub-Signature-256` (format: `sha256=<hex_digest>`).
   - **Verification Algorithm:** Computes HMAC-SHA256 over the unparsed raw request body `Buffer` using `META_APP_SECRET`. Compares signatures using constant-time `crypto.timingSafeEqual`.
   - **Raw Body Buffer Requirement:** Express / NestJS must configure `json({ verify: (req, res, buf) => { req.rawBody = buf; } })` to ensure the exact raw byte buffer is preserved. Re-stringifying parsed JSON will alter whitespace or key ordering and break HMAC verification.
   - **Subscription Verification Token (`META_WEBHOOK_VERIFY_TOKEN`):** A distinct secret configured in the Meta App Dashboard and Orbit environment variables. Used **strictly** for handling Meta's GET subscription challenge handshake:
     `IF req.query['hub.mode'] === 'subscribe' AND req.query['hub.verify_token'] === process.env.META_WEBHOOK_VERIFY_TOKEN THEN RETURN res.send(req.query['hub.challenge'])`.
   - **Channel Credentials (Outbound Tokens):** Stored encrypted (AES-256-GCM) in `channel_credentials`. Used strictly for outbound Graph API calls (sending WhatsApp messages, replying to Instagram messages). They are **never** used for inbound signature verification because Meta does not sign inbound webhooks with channel access tokens.
2. **Stripe Verification Adapter (`StripeWebhookAdapter`):**
   - **Endpoint Secret:** Stripe Webhook Endpoint Secret (`STRIPE_WEBHOOK_SECRET`, `whsec_...`).
   - **Header:** `Stripe-Signature` (contains `t=<timestamp>,v1=<signature>`).
   - **Verification:** Computed using official `stripe.webhooks.constructEvent(rawBody, signature, secret)`. Replay attacks are prevented by rejecting timestamps where `abs(now - t) > 300` seconds.

### 7.2 Webhook Idempotency Guarantees
- Meta WhatsApp message IDs (`wamid.*`) are unique per WhatsApp Phone Number ID.
- Meta Instagram message IDs (`mid.*`) are unique per Instagram Scoped User ID / thread.
- Stripe event IDs (`evt_*`) are unique per Stripe account and live/test mode.
To prevent cross-tenant key collisions while ensuring exact duplicate deliveries are recognized, idempotency is scoped to:
```sql
CONSTRAINT uq_webhook_provider_event
  UNIQUE(organization_id, channel_id, provider, idempotency_key)
```

### 7.3 Webhook Outbox Schema
```sql
CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  channel_id UUID NOT NULL,
  provider VARCHAR(32) NOT NULL,          -- 'META_WHATSAPP', 'META_INSTAGRAM', 'STRIPE'
  idempotency_key VARCHAR(255) NOT NULL,  -- e.g. 'wamid.HBgL...' or 'evt_1...'
  
  -- Dispatcher State (Queue Enqueue Lifecycle)
  dispatch_status VARCHAR(24) NOT NULL DEFAULT 'PENDING_DISPATCH', -- 'PENDING_DISPATCH', 'DISPATCHED'
  dispatch_token UUID,                    -- Lease fencing token for dispatcher sweeper
  dispatch_expires_at TIMESTAMPTZ,        -- Dispatch lease expiration (30 seconds)
  
  -- Worker Processing State (Execution Lifecycle)
  processing_status VARCHAR(24) NOT NULL DEFAULT 'UNCLAIMED', -- 'UNCLAIMED', 'PROCESSING', 'PROCESSED', 'FAILED', 'DEAD_LETTER'
  payload JSONB NOT NULL,
  attempt_count INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  lease_token UUID,                       -- Cryptographic fencing token for worker execution
  lease_expires_at TIMESTAMPTZ,           -- Processing lease expiration (60 seconds)
  last_error TEXT,
  next_retry_at TIMESTAMPTZ,              -- Exponential backoff scheduling
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  
  CONSTRAINT uq_webhook_provider_event UNIQUE(organization_id, channel_id, provider, idempotency_key),
  CONSTRAINT fk_webhook_channel_org FOREIGN KEY (channel_id, organization_id)
    REFERENCES channels (id, organization_id) ON DELETE RESTRICT
);

-- Partial index for active dispatcher claims & sweeps
CREATE INDEX idx_webhook_dispatch_sweeper 
  ON webhook_events(dispatch_status, created_at, dispatch_expires_at)
  WHERE dispatch_status = 'PENDING_DISPATCH';

-- Partial index for active worker execution claims & recovery
CREATE INDEX idx_webhook_processing_sweeper 
  ON webhook_events(processing_status, lease_expires_at, next_retry_at)
  WHERE processing_status IN ('UNCLAIMED', 'PROCESSING');
```

### 7.4 Outbox Dispatch & Processing Lifecycle

```mermaid
stateDiagram-v2
    [*] --> PENDING_DISPATCH: Webhook Ingress (Atomic Insert)
    
    state DispatchLifecycle {
        PENDING_DISPATCH --> PENDING_DISPATCH: Immediate HTTP Handler / Sweeper claims dispatch_token
        PENDING_DISPATCH --> DISPATCHED: BullMQ enqueue succeeds (Job ID = event.id)
        DISPATCHED --> PENDING_DISPATCH: Stale Dispatched Sweeper resets if UNCLAIMED > 15m
    }

    state ProcessingPipeline {
        [*] --> UNCLAIMED: Event in Queue
        UNCLAIMED --> PROCESSING: Worker claims lease (lease_token + expires in 60s)
        PROCESSING --> PROCESSING: Worker heartbeat refreshes lease every 20s
        PROCESSING --> PROCESSED: Worker completes conditionally on lease_token
        PROCESSING --> UNCLAIMED: Lease expires without heartbeat -> Sweeper resets (attempt < max)
        PROCESSING --> DEAD_LETTER: Lease expires without heartbeat -> attempt >= max
        PROCESSED --> [*]
        DEAD_LETTER --> [*]
    }

    DISPATCHED --> UNCLAIMED: BullMQ Worker picks up job
```

#### 1. Dual Dispatch Architecture: Immediate vs. Sweeper Enqueue
Project Orbit implements **At-Least-Once Delivery to the Queue** and **Fenced Idempotent State Transitions in PostgreSQL**.

- **Path A: Immediate HTTP-Handler Enqueue (Low Latency):**
  1. The HTTP handler derives `organization_id` via `resolve_channel_routing()` using the `orbit_ingress` connection pool.
  2. Inside `TenantTransactionRunner.runWithTenant(organizationId, fn(tx))`, inserts into `webhook_events`:
     ```sql
     INSERT INTO webhook_events (
       organization_id, channel_id, provider, idempotency_key,
       payload, dispatch_status, dispatch_token, dispatch_expires_at, processing_status
     )
     VALUES (
       :orgId, :channelId, :provider, :idempotencyKey,
       :payload, 'PENDING_DISPATCH', :immediateToken, NOW() + INTERVAL '30 seconds', 'UNCLAIMED'
     )
     ON CONFLICT (organization_id, channel_id, provider, idempotency_key) DO NOTHING
     RETURNING id, dispatch_token;
     ```
  3. The database transaction commits.
  4. The HTTP handler enqueues to BullMQ using deterministic `jobId`:
     ```typescript
     await webhookQueue.add('process-webhook', {
       organizationId,
       eventId: event.id
     }, {
       jobId: event.id,
       removeOnComplete: 1000,
       removeOnFail: 5000
     });
     ```
  5. The handler acknowledges dispatch in PostgreSQL:
     ```sql
     UPDATE webhook_events
     SET dispatch_status = 'DISPATCHED',
         dispatch_token = NULL,
         dispatch_expires_at = NULL,
         updated_at = NOW()
     WHERE id = :id AND dispatch_token = :immediateToken;
     ```
  6. Responds HTTP 200 to provider.

- **Path B: Background Dispatch Sweeper (Fail-Safe Recovery):**
  If the HTTP handler crashed before step 4 or BullMQ was temporarily unavailable, the event sits in PostgreSQL with `dispatch_status = 'PENDING_DISPATCH'`. The Dispatch Sweeper runs every 10 seconds:
  ```sql
  WITH claimable AS (
    SELECT id
    FROM webhook_events
    WHERE dispatch_status = 'PENDING_DISPATCH'
      AND (dispatch_expires_at IS NULL OR dispatch_expires_at < NOW())
      AND created_at < NOW() - INTERVAL '5 seconds'
    ORDER BY created_at ASC
    LIMIT 100
    FOR UPDATE SKIP LOCKED
  )
  UPDATE webhook_events w
  SET dispatch_token = :sweeperToken,
      dispatch_expires_at = NOW() + INTERVAL '30 seconds',
      updated_at = NOW()
  FROM claimable
  WHERE w.id = claimable.id
  RETURNING w.id, w.organization_id, w.channel_id, w.dispatch_token;
  ```
  The sweeper enqueues each claimed row to BullMQ with `jobId = event.id`, and acknowledges dispatch using `WHERE id = :id AND dispatch_token = :sweeperToken`.

#### 2. Concrete Crash-Point Analysis & Deduplication Mechanics
PostgreSQL remains the durable source of truth. Redis and BullMQ act as transient delivery conduits.

| Crash Point | Failure Mode | Durable State in DB & Queue | Automatic Recovery Mechanism | Guarantee |
|---|---|---|---|---|
| **Crash Point 1** | Crash before or during DB insert | DB: None. Queue: None. Provider: Connection reset / 500. | Provider automatically retries HTTP webhook within seconds. | Safe: No partial state exists. |
| **Crash Point 2** | Crash after DB commit, before BullMQ enqueue call | DB: `PENDING_DISPATCH` with `dispatch_token`. Queue: None. | After 30s (`dispatch_expires_at < NOW()`), Dispatch Sweeper claims row via `SKIP LOCKED`, enqueues to BullMQ, and marks `DISPATCHED`. | Durable: Zero events lost. |
| **Crash Point 3** | Crash after BullMQ enqueue succeeds, before DB acknowledgement | DB: `PENDING_DISPATCH`. Queue: Job exists with `jobId = event.id`. | After 30s, Sweeper claims row and calls `queue.add(..., { jobId: event.id })`. BullMQ deduplicates identical `jobId`. Worker processes job atomically in DB. | Idempotent: No duplicate processing. |
| **Crash Point 4** | Redis restart or cache eviction while event marked `DISPATCHED` | DB: `dispatch_status = 'DISPATCHED'`, but `processing_status = 'UNCLAIMED'`. Queue: Job lost. | Stale Dispatched Sweeper detects `updated_at < NOW() - 15m`. Resets `dispatch_status = 'PENDING_DISPATCH'`. Dispatch Sweeper re-enqueues to BullMQ. | Durable: Lost Redis jobs recovered. |
| **Crash Point 5** | Worker crashes mid-execution | DB: `processing_status = 'PROCESSING'`, `lease_expires_at` in past. Queue: Stalled. | Processing Recovery Sweeper detects expired lease. Resets to `UNCLAIMED` with exponential backoff or marks `DEAD_LETTER` if `attempt_count >= max_attempts`. | Resilient: Poison pills quarantined. |

#### 3. Worker Processing Claim & External Side-Effect Idempotency
- **Worker Lease Claim:** Worker picks up BullMQ job and acquires an atomic processing lease:
  ```sql
  UPDATE webhook_events
  SET processing_status = 'PROCESSING',
      lease_token = :newWorkerLeaseToken,
      lease_expires_at = NOW() + INTERVAL '60 seconds',
      attempt_count = attempt_count + 1,
      updated_at = NOW()
  WHERE id = :id
    AND (processing_status = 'UNCLAIMED' OR (processing_status = 'PROCESSING' AND lease_expires_at < NOW()))
    AND (next_retry_at IS NULL OR next_retry_at <= NOW())
  RETURNING id, organization_id, payload, lease_token;
  ```
  If 0 rows are returned, another worker holds an active lease or the job is delayed by backoff.
- **Worker Lease Heartbeat:** Worker runs a 20-second interval timer:
  ```sql
  UPDATE webhook_events
  SET lease_expires_at = NOW() + INTERVAL '60 seconds',
      updated_at = NOW()
  WHERE id = :id AND lease_token = :myWorkerLeaseToken;
  ```
  If 0 rows are updated, the worker has lost the lease (e.g. network partition or freeze) and immediately aborts execution.
- **Outbound Side-Effect Idempotency by Provider Capability & Safe Operational Recovery:**
  When worker processing involves invoking external APIs (e.g. Meta Graph API for sending messages or Stripe API for billing actions), network partitions can occur after the external API accepted the request but before the worker persisted success in PostgreSQL.
  
  ##### 1. Network Realities & Rejection of False "Exactly-Once" Outbound Claims
  Over distributed networks, guaranteed physical "exactly-once" delivery across independent third-party APIs is mathematically impossible (the Two Generals' Problem). If a connection drops after transmission, no local database mechanism can guarantee whether the remote server processed the payload. Project Orbit guarantees **at-least-once internal delivery with idempotent local state transitions**, and qualifies outbound network side-effects strictly by external provider capability tiers:

  ##### 2. Outbound Provider Capability Tiers
  - **Tier 1: Native Deterministic Idempotency Keys (e.g. Stripe API, OpenAI API):**
    - The external platform natively supports idempotency headers (`Idempotency-Key: orbit_evt_${event_id}_${action_hash}`).
    - Retention: Stripe retains idempotency keys for 24 hours. OpenAI supports client request identifiers (`client_request_id`).
    - Guarantee: Re-transmitting the identical payload with the identical key is safe; the provider returns the cached response without double-charging or duplicate generation.
  - **Tier 2: Status Reconciliation & Unique External Identifiers (e.g. Meta WhatsApp Cloud API):**
    - Meta does not support arbitrary client idempotency headers on Graph API message sends, but accepts an optional client-assigned tracking token (`biz_opaque_callback_data`) and message delivery webhook correlation.
    - Protocol: Before issuing an outbound retry, the worker performs **Status Reconciliation Pre-Flight**: querying the channel conversation message status or checking webhook delivery logs to verify whether Meta already accepted or dispatched the message.
  - **Tier 3: Providers Lacking Idempotency or Status Query (High Duplicate Risk):**
    - For third-party APIs lacking both idempotency keys and queryable transaction status, blind automated retries risk severe duplicate customer messages or double billing.

  ##### 3. The UNKNOWN_OUTCOME Protocol & Safe Operational Recovery
  When an outbound API call fails ambiguously (socket hangup, HTTP 408/504 timeout, or unconfirmed 5xx server error) and outcome cannot be deterministically verified:
  1. *Do NOT Blindly Retry:* The worker aborts automatic retries to avoid duplicating external side effects.
  2. *Quarantine State:* The worker updates PostgreSQL:
     ```sql
     UPDATE webhook_events
     SET processing_status = 'UNKNOWN_OUTCOME',
         lease_token = NULL,
         lease_expires_at = NULL,
         next_retry_at = NULL,
         last_error = 'PROVIDER_TIMEOUT_UNCONFIRMED: ' || :errorMessage,
         updated_at = NOW()
     WHERE id = :id AND lease_token = :myWorkerLeaseToken;
     ```
  3. *Dispatch Operational Alert:* Publishes an urgent alert to Redis Pub/Sub (`orbit:alerts:side-effects`).
  4. *Automated Reconciliation Polling:* A background reconciliation worker periodically queries provider reporting endpoints or waits up to 15 minutes for delayed webhook callbacks.
  5. *Operator Resolution Console:* If unverified after 15 minutes, the incident escalates to the internal operational console:
     - `Mark Succeeded`: Operator inspects the provider portal (e.g., Meta WhatsApp Manager, Stripe Dashboard), confirms execution, and marks the event `PROCESSED`.
     - `Force Re-issue`: Operator confirms the payload never reached the provider and triggers a manual, logged re-dispatch.
     - `Abort`: Operator cancels the action, marks `FAILED`, releases token reservations, and creates an agent escalation task.
- **Fenced Conditional Completion:**
  ```sql
  UPDATE webhook_events
  SET processing_status = 'PROCESSED',
      processed_at = NOW(),
      lease_token = NULL,
      lease_expires_at = NULL,
      updated_at = NOW()
  WHERE id = :id AND lease_token = :myWorkerLeaseToken;
  ```
- **Processing Recovery Sweeper:** Runs every 15s querying expired worker leases:
  ```sql
  UPDATE webhook_events
  SET processing_status = CASE WHEN attempt_count >= max_attempts THEN 'DEAD_LETTER' ELSE 'UNCLAIMED' END,
      next_retry_at = CASE WHEN attempt_count >= max_attempts THEN NULL ELSE NOW() + (POWER(2, attempt_count) * INTERVAL '5 seconds') END,
      lease_token = NULL,
      lease_expires_at = NULL,
      updated_at = NOW()
  WHERE processing_status = 'PROCESSING'
    AND lease_expires_at < NOW();
  ```
  This protocol **never** steals actively heartbeating jobs (`lease_expires_at >= NOW()`).
- **Payload Retention:** Raw payloads are retained for 30 days. An automated cron replaces expired payloads with `{}` while preserving metadata.

---

## 8. AI Accounting: Requests, Attempts, Quotas & Costs

### 8.1 Schema Separation: Logical vs. Physical vs. Billable
A single customer turn (logical request) can involve multiple physical provider attempts (e.g. timeout on Attempt 1, successful fallback on Attempt 2). A single request ID cannot account for physical attempts or platform COGS liabilities.

```mermaid
erDiagram
    AI_REQUESTS ||--o{ AI_REQUEST_ATTEMPTS : has_attempts
    AI_REQUESTS ||--o| AI_RESERVATIONS : holds_reservation
    AI_REQUESTS ||--o| AI_USAGE_EVENTS : bills_as
    AI_MODEL_PRICING_SCHEDULES ||--o{ AI_REQUEST_ATTEMPTS : prices_attempt

    AI_REQUESTS {
        uuid id PK
        uuid organization_id FK
        uuid conversation_id
        varchar idempotency_key
        varchar status
        timestamptz created_at
    }

    AI_MODEL_PRICING_SCHEDULES {
        uuid id PK
        varchar provider
        varchar canonical_model
        varchar pricing_version
        decimal prompt_token_rate_per_m
        decimal completion_token_rate_per_m
        varchar currency
        timestamptz effective_from
        timestamptz effective_to
    }

    AI_REQUEST_ATTEMPTS {
        uuid id PK
        uuid request_id FK
        uuid organization_id FK
        int attempt_number
        varchar provider
        varchar model
        varchar canonical_model
        varchar provider_attempt_id
        varchar status
        int prompt_tokens
        int completion_tokens
        int total_tokens
        varchar pricing_version
        decimal prompt_rate_per_m
        decimal completion_rate_per_m
        varchar cost_currency
        decimal incurred_provider_cost_usd
        varchar cost_reconciliation_status
        boolean is_tenant_billable
    }

    AI_RESERVATIONS {
        uuid id PK
        uuid request_id FK
        uuid organization_id FK
        int estimated_tokens
        uuid fencing_token
        varchar status
        timestamptz heartbeat_at
    }

    AI_USAGE_EVENTS {
        uuid id PK
        uuid request_id FK
        uuid organization_id FK
        int total_tokens
        decimal billed_amount_usd
        timestamptz created_at
    }
```

### 8.2 Entity Definitions & Schema
```sql
-- 1. Logical AI Request (The Customer Turn)
CREATE TABLE ai_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  conversation_id UUID,
  idempotency_key VARCHAR(255) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'COMPLETED', 'FAILED', 'ABANDONED'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_ai_requests_id_org UNIQUE (id, organization_id),
  CONSTRAINT uq_ai_requests_org_idempotency UNIQUE (organization_id, idempotency_key)
);

-- 2. System Model Pricing Schedules Catalog
-- Relational versioning of provider rates over time. Read-only for orbit_app.
-- Enforces temporal non-overlapping ranges per provider and canonical model via btree_gist.
CREATE TABLE ai_model_pricing_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(32) NOT NULL,            -- 'OPENAI', 'ANTHROPIC', 'MOCK'
  canonical_model VARCHAR(64) NOT NULL,     -- 'gpt-4o-mini', 'claude-3-5-sonnet'
  model_alias VARCHAR(64),                  -- 'gpt-4o-mini-latest', 'gpt-4o-mini-2024-07-18'
  pricing_version VARCHAR(32) NOT NULL,     -- '2024-07-18-v1', '2024-10-01-v1'
  prompt_token_rate_per_m DECIMAL(10, 6) NOT NULL,     -- Currency units per 1,000,000 prompt tokens
  completion_token_rate_per_m DECIMAL(10, 6) NOT NULL, -- Currency units per 1,000,000 completion tokens
  currency VARCHAR(8) NOT NULL DEFAULT 'USD',
  effective_from TIMESTAMPTZ NOT NULL,
  effective_to TIMESTAMPTZ,                 -- NULL indicates currently active schedule
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_pricing_currency_usd CHECK (currency = 'USD'),
  CONSTRAINT uq_pricing_provider_model_version UNIQUE (provider, canonical_model, pricing_version),
  CONSTRAINT ex_pricing_no_overlap EXCLUDE USING gist (
    provider WITH =,
    canonical_model WITH =,
    tstzrange(effective_from, COALESCE(effective_to, 'infinity'::timestamptz), '[)') WITH &&
  )
);

CREATE INDEX idx_pricing_lookup 
  ON ai_model_pricing_schedules (provider, canonical_model, effective_from, effective_to);

GRANT SELECT ON ai_model_pricing_schedules TO orbit_app;

-- 3. Physical Provider Attempts (Raw Invocations & Platform COGS)
-- Stores immutable rate snapshots for 100% financial reproducibility.
-- NO hardcoded defaults for pricing_version or cost_currency.
CREATE TABLE ai_request_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  attempt_number INT NOT NULL,
  provider VARCHAR(32) NOT NULL,            -- 'OPENAI', 'MOCK'
  model VARCHAR(64) NOT NULL,               -- Model requested (e.g. 'gpt-4o-mini-2024-07-18')
  canonical_model VARCHAR(64) NOT NULL,     -- Canonical model resolved (e.g. 'gpt-4o-mini')
  provider_attempt_id VARCHAR(128),         -- e.g. OpenAI x-request-id header if received
  status VARCHAR(32) NOT NULL,              -- 'SUCCESS', 'TIMEOUT', 'PROVIDER_5XX', 'CLIENT_ERROR'
  prompt_tokens INT,
  completion_tokens INT,
  total_tokens INT,
  
  -- Frozen Rate Snapshot (Strictly USD-Denominated)
  pricing_version VARCHAR(32) NOT NULL,     -- Applied schedule version (e.g. '2024-07-18-v1')
  prompt_rate_per_m DECIMAL(10, 6) NOT NULL,     -- Snapshot rate active at attempt time (USD per 1M tokens)
  completion_rate_per_m DECIMAL(10, 6) NOT NULL, -- Snapshot rate active at attempt time (USD per 1M tokens)
  cost_currency VARCHAR(8) NOT NULL DEFAULT 'USD', -- Persisted strictly from matching schedule's currency
  incurred_provider_cost_usd DECIMAL(10, 6),     -- Platform COGS liability in USD (NULL until calculated)
  cost_reconciliation_status VARCHAR(32) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'KNOWN', 'ESTIMATED', 'UNKNOWN', 'RECONCILED'
  is_tenant_billable BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT chk_attempt_currency_usd CHECK (cost_currency = 'USD'),
  CONSTRAINT fk_attempts_request_org FOREIGN KEY (request_id, organization_id)
    REFERENCES ai_requests (id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT uq_ai_attempts_request_attempt UNIQUE (request_id, attempt_number)
);

CREATE UNIQUE INDEX idx_attempts_provider_attempt_id
  ON ai_request_attempts (provider, provider_attempt_id)
  WHERE provider_attempt_id IS NOT NULL;

-- 4. Durable Quota Reservation Ledger (Ephemeral, Purged after 30 Days)
CREATE TABLE ai_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL UNIQUE,
  organization_id UUID NOT NULL,
  estimated_tokens INT NOT NULL,
  fencing_token UUID NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'RESERVED', -- 'RESERVED', 'COMMITTED', 'RELEASED', 'ABANDONED'
  heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_reservations_request_org FOREIGN KEY (request_id, organization_id)
    REFERENCES ai_requests (id, organization_id) ON DELETE CASCADE
);

-- 5. Customer Billable Usage Ledger (Exactly-Once Billing per Request)
CREATE TABLE ai_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL UNIQUE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  total_tokens INT NOT NULL,
  billed_amount_usd DECIMAL(10, 6) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_usage_events_request_org FOREIGN KEY (request_id, organization_id)
    REFERENCES ai_requests (id, organization_id) ON DELETE RESTRICT
);
```

### 8.3 Dynamic Pricing Versioning & Historical Reproducibility
Hardcoded default pricing strings in schemas or code risk silently assigning obsolete rates to future invocations:
1. **Dynamic Schedule Selection:** At invocation time, the AI engine resolves the model string to its canonical name and queries the active schedule:
   ```sql
   SELECT pricing_version, prompt_token_rate_per_m, completion_token_rate_per_m, currency
   FROM ai_model_pricing_schedules
   WHERE provider = :provider
     AND canonical_model = :canonicalModel
     AND effective_from <= NOW()
     AND (effective_to IS NULL OR effective_to > NOW())
   ORDER BY effective_from DESC
   LIMIT 1;
   ```
2. **Missing Schedule Fail-Closed Protocol:** If no valid pricing schedule exists for the requested `(provider, canonical_model)`, the invocation fails pre-flight with `MissingPricingScheduleException`. The system never guesses rates or fabricates zero. If an unconfigured provider call somehow occurs, it is flagged with `cost_reconciliation_status = 'UNKNOWN'` and `incurred_provider_cost_usd = NULL` (never 0.00).
3. **Exact Mathematical Calculation:** Cost calculations strictly adhere to unit precision:
   $$\text{Cost} = \left(\text{prompt\_tokens} \times \frac{\text{prompt\_token\_rate\_per\_m}}{1\,000\,000}\right) + \left(\text{completion\_tokens} \times \frac{\text{completion\_token\_rate\_per\_m}}{1\,000\,000}\right)$$
   Values are stored with 6 decimal places (`DECIMAL(10, 6)`), ensuring exact fractional-cent accuracy.
4. **Immutable Snapshot on Every Attempt:** The selected rates are recorded in `ai_request_attempts`. When a provider changes prices, an administrator inserts a new schedule with a new `effective_from` date and sets `effective_to` on the prior version. Past attempts remain completely reproducible because they link to frozen snapshot rates.
5. **Provider Pricing Currency Alignment: Approach A (USD-Only Architecture):**
   Project Orbit adopts **Approach A (USD-Only Provider Pricing Schedules)** for initial production:
   - *Upstream Vendor Alignment:* Upstream foundation model providers (OpenAI, Anthropic) price and invoice API consumption exclusively in US Dollars (USD).
   - *Elimination of FX Rounding & Audit Drift:* Permitting arbitrary currencies in pricing schedules prior to multi-currency billing introduces foreign exchange (FX) conversion discrepancies, temporal exchange rate lookups, and audit drift in statutory COGS ledgers.
   - *Database-Level Guardrails:* `CONSTRAINT chk_pricing_currency_usd CHECK (currency = 'USD')` on `ai_model_pricing_schedules` and `CONSTRAINT chk_attempt_currency_usd CHECK (cost_currency = 'USD')` on `ai_request_attempts` guarantee that non-USD rates cannot be entered accidentally.
   - *End-to-End Currency Consistency:* All rate tables (`prompt_token_rate_per_m`, `completion_token_rate_per_m`), attempt snapshots (`prompt_rate_per_m`, `completion_rate_per_m`), COGS liabilities (`incurred_provider_cost_usd`), and retail usage events (`billed_amount_usd`) operate with exact decimal precision in USD (`DECIMAL(10, 6)`).
   - *Future Multi-Currency Roadmap:* If non-USD regional AI providers are introduced in future milestones, a dedicated historical exchange rate ledger (`currency_exchange_rates`) and versioned conversion pipeline will be introduced via a formal migration.

### 8.4 Separation of Platform COGS vs. Tenant Billing
Platform cost accounting and customer retail billing represent separate financial ledgers and must never be conflated:

1. **Platform COGS (Cost of Goods Sold):** Recorded in `ai_request_attempts.incurred_provider_cost_usd`. This reflects the expense owed to the model vendor (e.g. OpenAI). It is tracked for every physical invocation, including timeouts and retries, to establish the company's financial liabilities and tax-deductible expenses.
2. **Tenant-Billable Usage:** Recorded in `ai_usage_events`. This reflects the commercial usage consumed by the customer. Exactly **one** billable event is created per successful turn (`UNIQUE(request_id)`). If the platform retries an attempt due to an OpenAI 500 error or a timeout, the failed attempts are marked `is_tenant_billable = false`. The customer is never billed for platform infrastructure failures.
3. **Tenant Subscription & Usage Pricing:** Commercial retail pricing is governed by the organization's `subscriptions` tier (e.g. $49/month including 100,000 tokens, +$15 per 50,000 token overage pack). Provider cost ($0.15/1M tokens) is distinct from tenant retail price.

### 8.5 Cost Accounting States & Reconciliation
Costs are never silently defaulted to zero. The state machine explicitly accounts for all liabilities:

| State | Description | Incurred Cost Value | Rate Snapshot Recorded | Billable to Tenant? |
|---|---|---|---|---|
| `PENDING` | Attempt in flight; tokens not yet known. | `NULL` | Selected Schedule Snapshot | No |
| `KNOWN` | Provider returned exact completion tokens. | Exact formula: `(prompt * rate_in / 1M) + (completion * rate_out / 1M)`. | Frozen Snapshot | Yes (if successful attempt) |
| `ESTIMATED` | Client-side timeout (e.g. 30s) or severed socket before completion headers returned. | Conservative upper-bound: `(prompt * rate_in / 1M) + (max_tokens_budget * rate_out / 1M)`. | Frozen Snapshot | No (Platform COGS Liability) |
| `UNKNOWN` | Abrupt worker crash or socket reset before prompt tokens were recorded. | `NULL` (explicitly flagged for offline invoice audit). Never converted to 0.00. | Selected Schedule Snapshot | No (Platform COGS Liability) |
| `RECONCILED` | Audited against provider monthly invoice / reporting ledger. | Reconciled invoice line-item amount. | Audit ledger reference | Internal reporting only |

1. **Handling Timeouts & Platform COGS:**
   - On a 30s client-side timeout, Attempt 1 logs `status = 'TIMEOUT', cost_reconciliation_status = 'ESTIMATED', incurred_provider_cost_usd = calculateMaxCost(prompt_tokens, max_tokens, prompt_rate_per_m, completion_rate_per_m)`.
   - Attempt 1 is flagged `is_tenant_billable = false`.
   - Month-end reconciliation ingests OpenAI's invoice CSV, comparing vendor charges against the sum of `incurred_provider_cost_usd` and logging variances.
2. **Handling Retries:**
   - Attempt 2 succeeds. It logs `status = 'SUCCESS', cost_reconciliation_status = 'KNOWN', is_tenant_billable = true`.
   - The customer turn completes, and Attempt 2 tokens are committed to `ai_usage_events`.
   - `UNIQUE(request_id)` on `ai_usage_events` guarantees exactly-once customer billing.
3. **Aggregate Invoice Reconciliation Limitations:**
   - OpenAI monthly invoices represent aggregate account-level billing, not request-by-request receipts. Individual requests are correlated where provider usage exports provide `x-request-id` / `provider_attempt_id`. Aggregate discrepancies are recorded in a platform reconciliation variance ledger rather than attempting to force artificial line-item precision onto an aggregate invoice.

---

## 9. Evidence-Based AI Grounding & Verification

Vector similarity measures retrieval relevance, **never** factual correctness. We strictly distinguish deterministic source validation from natural-language inference (NLI).

```mermaid
flowchart TD
    RetrievedChunks["pgvector Chunks (Filtered by orgId)"] --> SimCheck{"Cosine Similarity >= min_threshold?"}
    SimCheck -->|No| AbstainLowRel["Abstain & Escalate\n(Reason: LOW_RELEVANCE)"]
    SimCheck -->|Yes| PromptAssembly["Assemble Prompt with Immutable Chunk Map\n[Source: chunk-uuid-1]"]

    PromptAssembly --> ModelGen["Model Generates Candidate Answer\nwith In-Text Source Citations"]

    ModelGen --> DetCheck{"Deterministic Backend Citation Validation\nDoes every cited ID exist in the retrieved chunk map?"}
    DetCheck -->|Invalid / Fabricated ID| RejectFab["Reject Answer & Escalate\n(Reason: INVALID_CITATION_ID)"]
    DetCheck -->|Valid Citations| ExtractiveFactCheck{"Extractive Fact Verification\nDo dates, prices & SKUs exist verbatim in cited chunks?"}

    ExtractiveFactCheck -->|Hallucinated Entity| RejectHalluc["Reject Answer & Escalate\n(Reason: UNGROUNDED_ENTITY)"]
    ExtractiveFactCheck -->|Facts Grounded| ContradictionCheck{"Contradiction Detection\nDo cited sources conflict?"}

    ContradictionCheck -->|Conflict Detected| AbstainConflict["Abstain & Escalate\n(Reason: CONTRADICTORY_EVIDENCE)"]
    ContradictionCheck -->|Consistent| Deliver["Deliver Answer to Customer"]
```

### 9.1 Deterministic Source Validation (Backend Code)
- When chunks are assembled into the prompt, the backend records an immutable map: `Map<chunkId, ChunkMetadata>`.
- Chunks are labeled with explicit, verifiable IDs: `[Source: chunk-uuid-1]`.
- The backend output parser extracts all citation tokens.
- **Verification Rule:** Every citation ID must exist in the retrieved chunk map for that request. Model-generated source labels are **never** trusted. If the model generates an unknown or fabricated chunk ID, the answer is immediately rejected and escalated.
- **Extractive Fact Verification:** Extracted entities (numbers, prices, delivery windows) must match substring or regex patterns in cited chunk text.

### 9.2 Natural-Language Inference (NLI) & Abstention
- For complex inquiries, candidate answers are evaluated for semantic entailment against retrieved sources.
- **Insufficient-Evidence Abstention:** When knowledge is absent, the model is bound by system prompt contract to state *"I do not have sufficient information regarding that, but I can connect you with our team."* and invoke `escalate_to_human`.
- Evaluation strategy: Automated CI benchmarks on shared domain datasets (`evals/benchmarks/ecommerce.json`), supplemented by tenant-specific evaluation when >50 verified FAQs exist.

---

## 10. PostgreSQL RLS Integration Testing Strategy

Unit tests and mocks cannot prove RLS correctness. Real integration tests must execute against a real PostgreSQL 16 database using the restricted `orbit_app` runtime role (`tests/integration/rls-isolation.spec.ts`).

### 10.1 Required Test Specifications
1. **Cross-Tenant Reads:** Tenant A queries Tenant B's conversations -> returns 0 rows.
2. **Cross-Tenant Writes:** Tenant A updates Tenant B's record -> affects 0 rows.
3. **Cross-Tenant Inserts:** Tenant A inserts record with Tenant B's `organization_id` -> fails with `WITH CHECK` policy violation error.
4. **Missing Context Fails Closed:** Executing queries without setting `app.current_org_id` returns 0 rows on reads and throws policy violations on writes.
5. **Interactive Transaction Connection Binding:** Verifies that `SET LOCAL app.current_org_id` is executed via `$queryRaw` on the exact same database connection used by subsequent Prisma queries inside the interactive transaction.
6. **Connection Pool Leak Prevention:** Verifies that when a connection is returned to the pool after `COMMIT` or `ROLLBACK`, subsequent queries on that pooled connection without a new tenant context return 0 rows (no leaked session parameters across requests).
7. **Dynamic Tenant Switching:** Verifies that switching tenants requires a new transaction and that no residual visibility from Tenant A persists when executing as Tenant B.
8. **Runtime Role Restrictions:** Verifies that tests execute strictly under the `orbit_app` role (`NOSUPERUSER, NOBYPASSRLS`). Direct bypass attempts via raw SQL return 0 rows.
9. **Role Privilege Boundaries & Security Definer Restrictions:**
   - Verifies that `orbit_ingress` role CANNOT execute `SELECT`, `INSERT`, `UPDATE`, or `DELETE` on any database table (throws permission denied error).
   - Verifies that `orbit_ingress` CAN execute `resolve_channel_routing()`.
   - Verifies that `orbit_app` CANNOT execute `resolve_channel_routing()` (throws permission denied error).
   - Verifies that `orbit_app` CANNOT execute `INSERT`, `UPDATE`, `DELETE`, or `TRUNCATE` on `ai_model_pricing_schedules` (throws permission denied error; read-only `SELECT` permitted).
   - Verifies that `orbit_app` and `orbit_ingress` CANNOT directly query `channel_routing_lookups` (throws permission denied error).
   - Verifies that `register_channel_routing()` fails if the referenced channel is soft-deleted, inactive, belongs to another organization, or specifies a mismatched provider.
   - Verifies that `ai_model_pricing_schedules` and `ai_request_attempts` reject non-USD currencies with `CHECK` constraint violations.

> [!NOTE]
> **Verification Status:** Static relational schema integrity, composite foreign key consistency, role permissions, and state transition contracts have been verified via static schema validation scripts and Gravitas discipline. Live PostgreSQL execution tests remain conceptual at this planning phase and will be executed when Milestone 1 implementation is authorized.

---

## 11. Monorepo Structure & Milestone 1 Scope

### 11.1 Proposed Monorepo Structure
```text
orbit-saas/
│
├── .agents/                      # Local Gravitas framework (Preserved locally, not committed)
│
├── apps/
│   ├── web/                      # React 18+ / Vite Single Page App (Dashboard)
│   ├── api/                      # NestJS Core REST & WebSocket Application
│   ├── widget/                   # Lightweight Embeddable Customer Chat Widget
│   └── worker/                   # BullMQ Asynchronous Background Worker
│
├── packages/
│   ├── shared/                   # Core types, interfaces, enums, DTO contracts
│   ├── validation/               # Shared Zod validation schemas
│   ├── ui/                       # Reusable UI component library (Tailwind + Radix)
│   ├── config/                   # Centralized validated environment configuration
│   └── integrations/             # Channel adapter contracts and mock implementations
│
├── prisma/
│   ├── schema.prisma             # Source of truth PostgreSQL schema
│   ├── migrations/               # Immutable database migration history
│   └── seed.ts                   # Demo organization & realistic sample data seeder
│
├── docs/
│   ├── PROJECT_CONTEXT.md        # Core product vision & rules
│   └── ARCHITECTURE.md           # Production system architecture specification
│
├── tests/
│   ├── integration/              # Real PostgreSQL RLS isolation test suite
│   └── e2e/                      # Playwright E2E browser tests
│
├── docker-compose.yml            # Local PostgreSQL 16 (pgvector) + Redis 7
├── .env.example                  # Documented environment template
├── .gitignore
├── skills-lock.json              # Pinned skill dependencies
├── package.json                  # Root monorepo workspace definition
└── README.md
```

### 11.2 Milestone 1 Scope & Acceptance Criteria
Milestone 1 remains strictly locked to foundational infrastructure:
1. **Monorepo Foundation:** Modern npm workspaces (`apps/web`, `apps/api`, `packages/shared`, `packages/validation`, `packages/config`).
2. **Docker Compose:** PostgreSQL 16 (`pgvector`) + Redis 7 Alpine.
3. **Database Roles, Migrations & Categorized Permissions:** `orbit_migrator` (DDL, `NOSUPERUSER, BYPASSRLS`), `orbit_app` (`NOSUPERUSER, NOBYPASSRLS`), and `orbit_ingress` (`NOSUPERUSER, NOBYPASSRLS, ZERO Table Access`). Core entities: `User`, `Organization`, `OrganizationMembership`, `UserSession`, `channels`, `channel_routing_lookups`, `ai_model_pricing_schedules`. Explicit categorized table permissions eliminating blanket default DML. Isolated ingress connection pool configuration (`INGRESS_DATABASE_URL`). USD-only provider pricing constraint (`CHECK (currency = 'USD')`).
4. **TenantTransactionRunner:** Implementation of transactional `SET LOCAL` runner with composite foreign keys and RLS policies.
5. **Authentication & Sessions:** User registration, login with Argon2id, HTTP-only JWT cookies, refresh token rotation with theft reuse detection, and session revocation.
6. **Unified TenantContext & Authorization:** `TenantGuard` verifying active membership before creating trusted `TenantContext`.
7. **Automated RLS Tenant-Isolation Test Suite:** Integration tests executing against real PostgreSQL proving cross-tenant isolation and role privilege boundaries.
8. **Minimal Authenticated Dashboard:** React dashboard displaying user profile, active organization, workspace switcher, and logout.

---

*End of Architecture Specification.*
