# Decision Record: Milestone 7 (M7) — Platform-Owner Super-Admin Control Plane (Surface C) & Public Website (Surface A)

## Status
ACCEPTED & COMPLETED

## Date
2026-11-19

## Context & Problem Statement
With Milestones M1 through M6 complete (Hardened Multi-Tenant Foundation, Core Helpdesk & CRM, AI Workforce Studio, E-Commerce Connectors, Social & Pulse BI, and AI Voice & Marketing), Project Orbit requires the final architectural deliverables to achieve 100% full functional parity across all three product surfaces:
1. **Surface A: Public Website & Acquisition Engine (`apps/marketing`):**
   - High-converting Next.js marketing homepage with Hero, Social Proof, and an interactive Support ROI Calculator.
   - Transparent, volume-based pricing model (`/pricing`) comparing Starter ($29/mo), Growth ($99.99/mo), and Enterprise tiers.
   - Real-world brand case studies (`/customers`) featuring Plum Beauty (94% deflection, 12x surge), Aachho Ethnic Wear (60k tickets/mo automated), and Freecultr (multilingual AI).
   - Dedicated enterprise demo booking portal (`/demo`) with automated qualification and lead capture.
   - Comprehensive Integrations Catalog (`/integrations`) across E-Commerce, Couriers, Messaging Channels, AI Telephony, and Developer Protocols (MCP).
   - Privacy Policy (`/privacy`) and Terms of Service (`/terms`) detailing RLS, envelope encryption, and SOC-2 data governance.
2. **Surface C: Platform-Owner Super-Admin Control Plane (`apps/admin`):**
   - Dedicated super-administrative application with distinct security boundary (`orbit_admin`).
   - Global multi-tenant organization directory with operational kill-switches (`ACTIVE` vs `SUSPENDED`).
   - Auditable Tenant Impersonation Engine (AC-C1): Issues cryptographically signed, short-lived JWTs (maximum 30-minute expiry) with mandatory justification prompt and immutable audit logging.
   - Global AI Gateway & Circuit Breakers (AC-C2): Real-time upstream provider telemetry (OpenAI, Groq, OpenRouter), manual circuit breaker trip/reset controls, and automated failover routing.
   - Financial Unit Economics & Gross Margin Assurance (AC-C3): Real-time MRR, ARR, provider token COGS calculation, and automated flagging for tenants with gross margin < 75%.
   - Platform Administrative Audit Trail: Immutable, reverse-chronological log of all operator operations, impersonation sessions, and breaker overrides.

## Gravitas Invariants Enforced
1. **Ground before mutating:** Inspected existing `ResilientAiGateway`, `TokenService`, `PrismaService`, and `apps/admin/src/App.tsx`.
2. **Stay in declared scope:** Focus strictly on Milestone 7: Super-Admin Control Plane, Global AI Routing & Circuit Breakers, Impersonation Engine, Financial Margins, and Public Website Pages.
3. **Completion needs fresh evidence:** Verified through 119 unit tests across 22 test suites and 8 Playwright browser tests, clean monorepo builds across all 11 packages, and zero type errors.
4. **Never exact-retry a failure:** Systematic diagnosis and correction of any schema or type discrepancies.
5. **Satisfy the contract:** Maintained strict isolation between tenant data and super-admin privileged actions. Impersonation sessions require mandatory reasons and 30-minute maximum expiry.
6. **Say what cannot be verified:** Physical hardware FIDO2 keys and production Stripe webhooks are simulated in the local test suite using cryptographic JWT validation and test signatures.

## Architecture & Technical Decisions

### 1. NestJS Platform Admin Module (`apps/api/src/admin`)
- `AdminService`:
  - `listTenants`: Fetches all organizations with subscription plan, member count, remaining credits, monthly billing spend, raw provider COGS, and calculated gross margin percentage.
  - `setTenantStatus`: Updates operational status (`ACTIVE` vs `SUSPENDED`) and appends immutable audit entry.
  - `createImpersonationSession`: Validates mandatory justification reason (fails closed if missing), verifies tenant existence, generates 30-minute short-lived JWT with `[Impersonated]` claims, and logs to `platform_audit_logs`.
  - `getCircuitBreakers`: Returns real-time latency, consecutive failures, and breaker states (`CLOSED`, `OPEN`, `HALF_OPEN`) for OpenAI, Groq, and OpenRouter.
  - `tripCircuitBreaker`: Manually trips or resets breaker state with operator audit trail.
  - `getGrossMargins`: Calculates platform-wide MRR, ARR, raw LLM token costs, gross margin %, and flags tenants with gross margin < 75% for SRE review.
  - `getAuditLogs` & `logAudit`: Immutable audit record storage and retrieval.
- `AdminController`:
  - Exposes `/api/admin/tenants`, `/api/admin/tenants/:id/status`, `/api/admin/impersonate`, `/api/admin/gateway/circuit-breakers`, `/api/admin/gateway/circuit-breakers/:provider/trip`, `/api/admin/margins`, `/api/admin/audit-logs`.
  - Registered in `apps/api/src/app.module.ts`.

### 2. Frontend Super-Admin Control Plane (`apps/admin/src/App.tsx`)
- Connected live to `/api/admin` endpoints with resilient fallback.
- Interactive Impersonation Modal (AC-C1): Prompting mandatory justification reason, optional ticket ID, and generating active session banner with 30-minute countdown and direct cockpit launch button.
- AI Gateway & Circuit Breakers (AC-C2): Provider cards displaying latency, consecutive failures, and one-click manual trip/reset buttons.
- Revenue & Gross Margins Dashboard (AC-C3): Metric scorecards (MRR, Provider COGS, Gross Margin %, Total Active Credits) and automated warning card for flagged deficit tenants.
- Platform Audit Trail: Real-time event log tracking operator identity, target organization, action type, and justification.

### 3. Public Marketing Surface A (`apps/marketing`)
- Completed `/integrations`: Comprehensive directory across E-Commerce (Shopify, WooCommerce), Channels (WhatsApp, Instagram, Web Chat), Logistics (Shiprocket), AI & Voice (Twilio, OpenAI, Groq), and Developer (MCP, Webhooks).
- Completed `/terms` and `/privacy`: Explicit legal disclosure of multi-tenant RLS boundaries, envelope encryption, credit reset policies, and GDPR Right-to-be-Forgotten data deletion.
- Updated `RootLayout` navigation and footer links.

## Verification Evidence
- `npm run test:unit`: 119 unit tests passing across 22 test files (`tests/unit/platform-admin.spec.ts` 9/9 passing).
- `npm run test:browser`: 8/8 Playwright multi-tab browser tests passing.
- `npm run typecheck`: Monorepo TypeScript check exited with code 0.
- `npm run build`: Monorepo build exited with code 0 across all 11 packages and applications.
