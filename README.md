# Project Orbit — Multi-Tenant AI Customer Engagement SaaS

Project Orbit is a modern, production-minded multi-tenant customer engagement and support platform designed to manage conversations across website chat, WhatsApp, and Instagram in a unified inbox with grounded AI assistance.

---

## 📖 Project Documentation

- **[Project Context & Requirements](docs/PROJECT_CONTEXT.md)**: Product vision, user roles, business stages, and core functional modules.
- **[System Architecture Specification (v1.1.5)](docs/ARCHITECTURE.md)**: Production architecture, PostgreSQL Row-Level Security (RLS) execution model, tenant isolation, AI grounding, and webhook outbox design.
- **[Milestone 1 Architectural Decisions](docs/decisions/MILESTONE_1_DECISIONS.md)**: Milestone 1 baseline, scope, security boundaries, and deferrals.
- **[Milestone 1 Implementation Report](docs/MILESTONE_1_IMPLEMENTATION_REPORT.md)**: Comprehensive implementation evidence, test results, and verification logs.
- **[Milestone 1 Security Review](docs/MILESTONE_1_SECURITY_REVIEW.md)**: Detailed security correction report (IDOR prevention, atomic refresh locking, CSRF, suspended accounts, atomicity).

---

## 🛠️ Architecture Highlights

- **Backend (`apps/api`):** NestJS modular monolith with REST APIs, WebSocket gateways, and Prisma ORM.
- **Frontend (`apps/web`):** React 18+ (Vite) single-page dashboard with Tailwind CSS, React Hook Form, and TanStack Query.
- **Worker (`apps/worker`):** Background worker foundation for BullMQ asynchronous jobs.
- **Database & Storage:** PostgreSQL 16 with `pgvector` extension and Redis 7 Alpine.
- **Defense-in-Depth Multi-Tenancy:**
  - Application-level `TenantGuard` verifying active workspace memberships.
  - Transaction-scoped PostgreSQL RLS (`SET LOCAL app.current_org_id`).
  - Composite foreign keys enforcing relational isolation.
  - Categorized least-privilege database roles (`orbit_migrator`, `orbit_app`, `orbit_ingress`).
- **Authentication & Sessions:**
  - Argon2id password hashing.
  - HTTP-only, secure, `SameSite=Lax` cookies.
  - Short-lived JWT access tokens + rotated refresh tokens.
  - Automatic refresh token reuse / theft detection.

---

## 🚀 Getting Started

### Prerequisites

- **Node.js:** v20+ LTS (Tested on v24.11.1)
- **npm:** v10+ (Tested on v11.6.2)
- **Docker & Docker Compose:** PostgreSQL 16 (`pgvector/pgvector:pg16`) and Redis 7 (`redis:7-alpine`)

### Quick Setup

```bash
# 1. Clone the repository
git clone https://github.com/HarshParyani33/orbit.git
cd orbit

# 2. Install monorepo dependencies
npm install

# 3. Configure environment variables
cp .env.example .env

# 4. Start PostgreSQL 16 & Redis 7 containers
docker compose up -d

# 5. Apply database migrations
npm run db:migrate

# 6. Seed demo organizations & users
npm run db:seed

# 7. Run production build across all workspaces
npm run build

# 8. Run integration test suite
npm run test:integration

# 9. Start development servers
npm run dev
```

### Seeded Credentials for Testing

| Email | Password | Role | Organization |
|---|---|---|---|
| `owner@acme.com` | `OrbitPassword123!` | OWNER | Acme Corporation (`acme`) |
| `member@acme.com` | `OrbitPassword123!` | MEMBER | Acme Corporation (`acme`) |
| `owner@beta.com` | `OrbitPassword123!` | OWNER | Beta Labs (`beta`) |

---

## 🧪 Verification & Testing

Project Orbit requires real database integration tests, not just unit mocks:

```bash
# Run RLS tenant-isolation, database permissions & auth integration tests
npm run test:integration

# Run TypeScript type check across all workspaces
npm run typecheck

# Run ESLint across monorepo
npm run lint
```

---

## ⚙️ Engineering Discipline

This project adheres strictly to **Gravitas** reliability runtime invariants:
1. Ground before mutating.
2. Stay in declared scope.
3. Completion needs evidence.
4. Never exact-retry a failure.
5. Satisfy the contract.
6. Say what you cannot verify.

Skill dependencies are pinned in `skills-lock.json`.

---

## 📄 License

Proprietary — All rights reserved.
