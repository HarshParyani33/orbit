# Project Orbit — Milestone 4 Architecture & Engineering Decisions
## Knowledge Base Embeddings, pgvector, Vector RAG Pipeline & Multi-Tenant Knowledge Retrieval

This document records the architectural and engineering decisions for **Milestone 4**, establishing a multi-tenant knowledge retrieval pipeline, pgvector semantic search, chunking engine, evidence-based AI grounding, and citation validation under Gravitas Core Skill Mode governance.

---

## Decision 35: Multi-Tenant Knowledge Base Relational & Vector Schema with pgvector (Milestone 4 Slice 4.1)

- **Status:** APPROVED & VERIFIED (Commit `6df68d1`, CI Run `44337436477`)
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
  - **GitHub Actions CI Verification:** [CI Run #44337436477](https://github.com/HarshParyani33/orbit/actions/runs/44337436477) completed with conclusion `success` across all 17 pipeline steps.

---

## Decision 36: Embedding Service, Chunking Engine & Multi-Tenant Ingestion Pipeline (Milestone 4 Slice 4.2)

- **Status:** APPROVED & VERIFIED (Commit pending, local 15/15 tests green)
- **Date:** 2026-11-18
- **Context:**
  Having established the relational and pgvector schema in Slice 4.1, Project Orbit requires an automated knowledge ingestion pipeline that:
  1. Accepts rich multi-tenant document content (FAQs, policies, product guides).
  2. Intelligently segments text into coherent semantically bounded chunks with configurable token boundaries and overlap.
  3. Computes 1536-dimensional vector embeddings via `IEmbeddingProvider` abstraction (supporting `MockEmbeddingProvider` for offline deterministic testing and `OpenAiEmbeddingProvider` for production `text-embedding-3-small`).
  4. Stores the document and its embedded chunks atomically inside `TenantTransactionRunner.runWithTenant(organizationId)`.
  5. Provides a validated REST API (`KnowledgeController` and `KnowledgeService`) for document creation, paginated listing, retrieval with chunk counts, and deletion.

- **Decision:**
  1. **Chunking Engine (`ChunkingEngine` in `@orbit/integrations`):**
     - Text chunking with natural boundary detection (paragraphs `\n\n`, then sentences `. `, then words).
     - Default chunk size: ~500 tokens (~2000 chars), overlap: ~50 tokens (~200 chars).
     - Emits `ChunkResult` containing `chunkIndex`, `chunkText`, and approximate `tokenCount`.
  2. **Embedding Provider Abstraction (`IEmbeddingProvider` in `@orbit/integrations`):**
     - Methods: `generateEmbedding(text: string): Promise<number[]>` and `generateEmbeddings(texts: string[]): Promise<number[][]>`.
     - `MockEmbeddingProvider`: Generates deterministic, L2-normalized 1536-dimensional unit vectors (`sum(v_i^2) = 1.0`). Ensures consistent cosine similarity tests without external API dependencies.
     - `OpenAiEmbeddingProvider`: Interfaces with OpenAI's `text-embedding-3-small` (1536 dimensions) for live production workloads.
  3. **Multi-Tenant Ingestion Service (`KnowledgeService` in `@orbit/api`):**
     - `createDocument(orgId, dto)`:
       - Runs within interactive transaction setting `app.current_org_id`.
       - Inserts `knowledge_documents` row.
       - Runs `ChunkingEngine.chunkText(dto.content)`.
       - Obtains embeddings from `IEmbeddingProvider`.
       - Persists chunks into `knowledge_chunks` with parameterized `${vectorStr}::vector` binding.
     - `listDocuments(orgId, query)`: Paginated document list with associated chunk counts.
     - `getDocument(orgId, docId)`: Retrieves document details and chunk breakdown.
     - `deleteDocument(orgId, docId)`: Atomically deletes document and cascades chunk removal.
  4. **Validation & API Contracts (`@orbit/validation`):**
     - `CreateKnowledgeDocumentSchema`: enforces title (1-255 chars), sourceType (`FAQ`, `MANUAL_ENTRY`, `DOCUMENT_UPLOAD`, `POLICY`), content (1-100,000 chars), and optional JSON metadata.
     - `ListKnowledgeDocumentsQuerySchema`: validates page and limit parameters.
  5. **API Endpoints (`KnowledgeController`):**
     - Protected by `JwtAuthGuard` and `TenantGuard`.
     - `POST /api/knowledge/documents`
     - `GET /api/knowledge/documents`
     - `GET /api/knowledge/documents/:id`
     - `DELETE /api/knowledge/documents/:id`

- **Evidence & Verification:**
  - Implemented `ChunkingEngine` and `IEmbeddingProvider` (`MockEmbeddingProvider`, `OpenAiEmbeddingProvider`) in `@orbit/integrations`.
  - Implemented `KnowledgeService` and `KnowledgeController` in `@orbit/api`.
  - Added validation schemas and DTOs in `@orbit/validation`.
  - Authored and executed automated integration test suite `tests/integration/knowledge-ingestion.spec.ts` (15 tests) verifying:
    - Text chunking with natural boundary detection and token estimation.
    - Deterministic 1536-dimensional L2 unit vector generation.
    - End-to-end document creation with automatic chunking and vector persistence.
    - Paginated document listing with accurate chunk counts.
    - Single document retrieval with complete chunk breakdown.
    - Multi-tenant isolation: Tenant B cannot list, retrieve, or delete Tenant A's documents or chunks.
    - Document deletion cascading to all stored vector chunks.
    - HTTP API endpoints with `JwtAuthGuard` and `TenantGuard` authentication and authorization.
  - Monorepo full test suite: 278/278 passed across all 24 test suites.
  - Quality gates: `tsc --build` (typecheck), `eslint .` (lint), and `npm run build` (build for all 9 workspaces) exit code 0.



