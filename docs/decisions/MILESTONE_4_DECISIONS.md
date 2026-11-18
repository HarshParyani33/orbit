# Project Orbit — Milestone 4 Architecture & Engineering Decisions
## Knowledge Base Embeddings, pgvector, Vector RAG Pipeline & Multi-Tenant Knowledge Retrieval

This document records the architectural and engineering decisions for **Milestone 4**, establishing a multi-tenant knowledge retrieval pipeline, pgvector semantic search, chunking engine, evidence-based AI grounding, and citation validation under Gravitas Core Skill Mode governance.

---

## Decision 35: Multi-Tenant Knowledge Base Relational & Vector Schema with pgvector (Milestone 4 Slice 4.1)

- **Status:** APPROVED & VERIFIED (Commit pending, local 10/10 tests green)
- **Date:** 2026-11-18
- **Context:**
  Project Orbit requires a multi-tenant knowledge base allowing businesses to define FAQs, product specs, policies, and reference documentation. The AI assistant must retrieve relevant snippets without ever leaking data across tenant boundaries, and ground answers strictly in retrieved evidence.
  
  PostgreSQL 16 with the `pgvector` extension serves as the unified relational and vector store, maintaining architectural simplicity and strict transactional RLS guarantees.

- **Decision:**
  1. **Relational & Vector Data Model:**
     - `knowledge_documents`:
       - `id`: UUID PRIMARY KEY
       - `organization_id`: UUID NOT NULL REFERENCES `organizations(id)` ON DELETE CASCADE
       - `title`: VARCHAR(255) NOT NULL
       - `source_type`: VARCHAR(50) NOT NULL (`FAQ`, `MANUAL_ENTRY`, `DOCUMENT_UPLOAD`, `POLICY`)
       - `content`: TEXT NOT NULL
       - `status`: VARCHAR(50) NOT NULL DEFAULT `'ACTIVE'` (`DRAFT`, `PROCESSING`, `ACTIVE`, `ARCHIVED`)
       - `metadata`: JSONB NOT NULL DEFAULT `'{}'`
       - `created_at`, `updated_at`: TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
       - `CONSTRAINT uq_knowledge_documents_id_org UNIQUE (id, organization_id)`
     - `knowledge_chunks`:
       - `id`: UUID PRIMARY KEY
       - `organization_id`: UUID NOT NULL
       - `document_id`: UUID NOT NULL
       - `chunk_index`: INT NOT NULL
       - `chunk_text`: TEXT NOT NULL
       - `token_count`: INT NOT NULL DEFAULT 0
       - `embedding`: `vector(1536)` NOT NULL
       - `metadata`: JSONB NOT NULL DEFAULT `'{}'`
       - `created_at`: TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
       - `CONSTRAINT uq_knowledge_chunks_id_org UNIQUE (id, organization_id)`
       - `CONSTRAINT fk_knowledge_chunks_document_org FOREIGN KEY (document_id, organization_id) REFERENCES knowledge_documents(id, organization_id) ON DELETE CASCADE`
       - `CONSTRAINT fk_knowledge_chunks_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT`
  2. **Row-Level Security (RLS) Policy:**
     - Both `knowledge_documents` and `knowledge_chunks` have RLS forced (`FORCE ROW LEVEL SECURITY`).
     - Tenant isolation policy:
       `USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::UUID)`
       `WITH CHECK (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::UUID)`
     - Unauthenticated queries without `app.current_org_id` fail closed with 0 rows on reads and check violation errors on writes.
  3. **HNSW Vector Indexing:**
     - Create HNSW index on `knowledge_chunks (embedding vector_cosine_ops)` to accelerate cosine distance nearest-neighbor queries (`<=>`).
  4. **Least-Privilege Role Grants:**
     - `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE knowledge_documents TO orbit_app;`
     - `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE knowledge_chunks TO orbit_app;`

- **Evidence & Verification:**
  - Authored migration `20261118000007_knowledge_base`.
  - Updated `prisma/schema.prisma` with `KnowledgeDocument` and `KnowledgeChunk`.
  - Authored and executed automated integration test suite `tests/integration/knowledge-schema-rls.spec.ts` (10 tests) verifying:
    - Tables exist with correct column types, primary keys, and foreign keys.
    - Composite unique constraint `[id, organization_id]` and cascading delete from document to chunks.
    - Multi-tenant RLS isolation: Tenant B cannot read or modify Tenant A's documents or chunks.
    - Vector column insertion and cosine distance query `<=>` within RLS boundary.
    - Missing tenant context fails closed.
  - Monorepo full test suite: 263/263 passed across 23 test suites.
  - Quality gates: `tsc --build` (typecheck), `eslint .` (lint), and `npm run build` (build for all 9 workspaces) exit code 0.

