# Gravitas Audit Decision Record — Milestone 0 (M0)
## Complete Product Audit & Master Blueprint

**Record ID:** `ADR-20261119-M0-MASTER-BLUEPRINT`  
**Date:** 2026-11-19  
**Status:** `ACCEPTED & ENFORCED`  
**Author:** Principal Technical Architect & Security Auditor (Orbit Core Team)  
**Task Mode:** `plan` (Read-Only Planning, Blueprinting, & Governance; no mutation of application code, database schema, or production configuration)

---

## 1. Ground Truth & Environment Baseline

### 1.1 Git Repository State
- **Repository:** `https://github.com/HarshParyani33/orbit`
- **Branch:** `main`
- **Audited Commit SHA:** `bed9fce4cc82585c5676e4f5ad75468bae3ed0f8`
- **Commit Subject:** `chore: ignore references directory containing asset images`
- **Working Tree:** Clean (verified via `git status`)

### 1.2 Gravitas Doctor Diagnostic Output
Executed `python .agents/skills/gravitas/scripts/doctor.py` with the following authoritative JSON output:
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
**Diagnostic Finding:** Gravitas operates in **Core Skill Mode** (self-governed invariant adherence and explicit decision records). Native Antigravity CLI and daemon hooks are absent; governance is upheld by strict execution discipline.

---

## 2. Policy Record & Governance Contract

```json
{
  "mode": "plan",
  "planning": "deep",
  "context_depth": "dependency",
  "verification_depth": "impact",
  "delegation": "none",
  "reason_codes": [
    "master-architecture-blueprint",
    "three-surface-product-parity",
    "read-only-audit",
    "zero-mutation-contract"
  ],
  "allowed_write_scope": [
    "docs/product-blueprint/*"
  ]
}
```

### Gravitas Invariant Adherence
1. **Ground before mutating:** Every finding and architectural recommendation is grounded in direct inspection of actual codebase files (`apps/api`, `apps/web`, `apps/widget`, `apps/worker`, `packages/*`, `prisma/schema.prisma`) and 22 visual reference screenshots.
2. **Stay in declared scope:** Scope is strictly bounded to the blueprint deliverables under `docs/product-blueprint/`. Zero changes are made to application code, database schemas, or package dependencies.
3. **Completion needs evidence:** Milestone 0 completion is validated by verifying that all 12 blueprint deliverables exist, have verified internal cross-references, and strictly reflect repo reality.
4. **Never exact-retry a failure:** Any diagnostic failure or missing reference is investigated and documented with exact root causes before proceeding.
5. **Satisfy the contract:** Architectural parity across the 3 distinct product surfaces (Public Website, Business Workspace, Platform Admin) is established without flattening permission models or collapsing tenant isolation.
6. **Say what cannot be verified:** Inaccessible private pages, internal third-party proprietary architectures (e.g., SagePilot internal microservice code), and mock-only features are explicitly disclosed.

---

## 3. Reference Material Grounding

The blueprint synthesizes three grounded reference domains:

### 3.1 Visual Workspace Screenshots (`references/`)
Direct visual inspection of 22 screenshots extracted from live SagePilot workspace sessions:
1. `image(1).png`: Growth plan active widget, credit consumption meter (7,304 of 7,500 left), billing navigation.
2. `image(2).png`: Open tickets dashboard (backlog, sub-status distribution, priority breakdown, inferred CSAT breakdown, age distribution, agent/channel age breakdown).
3. `image(3).png`: Performance reporting (AI vs Human TAT adherence, CSAT trends, response time distribution, resolution time distribution).
4. `image(4).png`: Ticket trends (volume over time, message breakdown, CSAT trends, tag distribution, channel distribution).
5. `image(5).png`: Workforce support analytics (median response times, resolution times, queue tracking, agent workload).
6. `image(6).png`: AI agent deflection trend (daily stacked AI vs human handled tickets, deflection % line curve).
7. `image(7).png`: Busiest times heatmap (hourly conversation/message heatmaps, agent activity heatmaps).
8. `image(8).png`: CSAT analytics (inferred vs survey CSAT, 1-5 star distribution, agent CSAT performance).
9. `image(9).png`: Touchpoints funnel (interactions to closure distribution, touchpoints by handler).
10. `image(10).png`: Journey & campaign message delivery status (Delivered, Read, Failed, Retrying, Scheduled).
11. `image(20261119-085206).png`: "Pulse" Insights AI (conversational business intelligence over tickets, CSVs, orders).
12. `image(20261119-085219).png`: Social engagement overview (comment handling flow, Sankey diagram, moderation states, DM handoffs).
13. `image(20261119-085243).png`: Master Inbox & Ticket view (3-column layout: ticket filters, conversation thread with Shopify order cards, internal notes, AI badges, right-side metadata drawer).
14. `image(20261119-085254).png`: Tickets navigation drawer (All, In Queue, Open, Reopened, Mentions, Assigned, Snoozed, Awaiting, Escalated, Needs Reply).
15. `image(20261119-085314).png`: Social engagement timeline (Instagram posts, stories, Twitter threads, moderation pills).
16. `image(20261119-085324).png`: Social comment moderation (feed/ad comments, initiate DM, hide/delete actions).
17. `image(20261119-085337).png`: Customers / CRM directory (unified contacts, channels, pagination across 5,630+ records).
18. `image(20261119-085415).png`: AI Agents directory (Chat Agents, Voice Agents, Social Agents, deployment channels).
19. `image(20261119-085446).png`: Billing & subscription management (Growth plan $99.99/mo, credit quotas, top-ups).
20. `image(20261119-090424).png`: Developer, Billing & Personal settings navigation tree.
21. `image(20261119-090430).png`: Integrations marketplace (57+ integrations across Commerce, Shipping, Returns, Loyalty, Payments, Webhooks).
22. `image(20261119-090431).png`: Workspace, AI & Agents, Ticket Management, and Marketing settings navigation tree.

### 3.2 Public Product & Architecture Documentation
- Public domain verification of `https://www.sagepilot.ai/` via web search.
- Verified AI workforce composition: Support Agent, Voice Agent, Social Media Manager, Operations Agent (COD confirmation, NDR recovery), Marketing Suite.
- Verified customer proof points: Plum (12x surge, 94% deflection), Aachho (60k tickets/mo), Ugaoo, Bonkers Corner, Cityfurnish, RedTape.
- Verified MCP server architecture and webhook ingestion capabilities.

### 3.3 Existing Orbit Repository Inspection
- Monorepo: Turborepo with `apps/api` (NestJS), `apps/web` (React/Vite), `apps/widget` (TypeScript/DOM), `apps/worker` (BullMQ), `packages/db` (`prisma/schema.prisma`), `packages/integrations`, `packages/config`, `packages/validation`.
- Security baseline: PostgreSQL Row-Level Security (RLS) with session variable `app.current_organization_id`.
- Active CI Status: GitHub Actions run [#44349163259](https://github.com/HarshParyani33/orbit/actions/runs/44349163259) passing 300 tests.

---

## 4. Deliverable Roster

Milestone 0 produces 12 comprehensive blueprint documents under `docs/product-blueprint/`:

| # | Deliverable | Primary Focus |
|---|-------------|---------------|
| 1 | `PRODUCT_SCOPE.md` | Exhaustive feature scope across Public Website, Business Workspace, and Platform Admin |
| 2 | `FEATURE_VERIFICATION_MATRIX.md` | Feature-by-feature A–F classification with source code links, tests, and gap analysis |
| 3 | `PRODUCT_ARCHITECTURE.md` | Monorepo layout, micro-frontends/apps, backend services, schema models, RLS, queues |
| 4 | `USER_JOURNEYS.md` | 15+ comprehensive workflows across 5 personas (Visitor, Owner, Agent, Platform Admin, Customer) |
| 5 | `RBAC_AND_TENANT_MODEL.md` | Tenant boundaries, PostgreSQL RLS, permission matrices, impersonation security |
| 6 | `INTEGRATION_CATALOG.md` | 57+ apps (Commerce, Shipping, Returns, Loyalty, Payments, Channels, MCP, Webhooks) |
| 7 | `AI_AND_CREDIT_ARCHITECTURE.md` | Multi-agent orchestration, multi-provider routing (OpenAI/Groq/OpenRouter), credit ledger |
| 8 | `IMPLEMENTATION_ROADMAP.md` | Phased delivery plan (M1–M7) with dependency graphs, milestones, and risk factors |
| 9 | `ACCEPTANCE_CRITERIA.md` | Testable, verifiable acceptance criteria for every major capability |
| 10 | `COST_AND_INFRASTRUCTURE_PLAN.md` | Dev, staging, and production hosting costs, unit economics, and gross margins |
| 11 | `OPEN_DECISIONS.md` | Architecture and product trade-offs requiring product-owner decisions |
| 12 | `AUDIT_DECISION_RECORD.md` | This formal governance, baseline, and evidence record |

---

## 5. Explicit Limitations & Unknowns (Invariant 6)

1. **Third-Party Internal Architecture:** SagePilot’s proprietary backend code, internal database schemas, and proprietary LLM prompt templates cannot be inspected. Parity is defined against observed product capabilities, workflows, UI layouts, and standard modern SaaS architecture patterns.
2. **External Vendor Test Credentials:** Meta WhatsApp Cloud API, Instagram Graph API, Twilio Voice SIP, Shopify App Store production credentials, and Stripe Live keys are not connected in this local environment; mock adapters and simulated payloads are documented where live calls cannot execute.
3. **Database Local Daemon:** The local Windows Docker daemon is offline; schema models and RLS policies are grounded in `prisma/schema.prisma` and authoritative CI test runs on GitHub Actions.
