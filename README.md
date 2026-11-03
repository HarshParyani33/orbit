# Project Orbit — Multi-Tenant AI Customer Engagement SaaS

Project Orbit is a modern, production-minded multi-tenant customer engagement and support platform designed to manage conversations across website chat, WhatsApp, and Instagram in a unified inbox with grounded AI assistance.

---

## 📖 Project Documentation

- **[Project Context & Requirements](docs/PROJECT_CONTEXT.md)**: Product vision, user roles, business stages, and core functional modules.
- **[System Architecture Specification](docs/ARCHITECTURE.md)**: Production architecture, PostgreSQL Row-Level Security (RLS) execution model, tenant isolation, AI grounding, and webhook outbox design.

---

## 🛠️ Architecture Highlights

- **Backend:** NestJS modular monolith with REST APIs, WebSockets, and BullMQ background workers.
- **Frontend:** React 18+ (Vite) dashboard and embeddable customer chat widget.
- **Database & Storage:** PostgreSQL 16 with `pgvector` extension for semantic retrieval, Redis 7 for caching and queues.
- **Multi-Tenancy:** Defense-in-depth isolation utilizing PostgreSQL Row-Level Security (`FORCE ROW LEVEL SECURITY`), composite foreign keys, and application-level tenant guards.
- **AI Engine:** Provider-independent abstraction supporting live OpenAI models (`gpt-4o`, `text-embedding-3-small`) and an offline, deterministic mock provider for local demoing.
- **Integrations:** Omnichannel adapter interface for Website Chat, WhatsApp Business, and Instagram Messaging with recoverable transactional outbox event processing.

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

