-- ==============================================================================
-- PROJECT ORBIT — MILESTONE 4 SLICE 4.1: MULTI-TENANT KNOWLEDGE BASE & PGVECTOR
-- ==============================================================================

-- 1. Ensure pgvector extension is enabled
CREATE EXTENSION IF NOT EXISTS "vector";

-- 2. Create knowledge_documents table
CREATE TABLE "knowledge_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "source_type" VARCHAR(50) NOT NULL DEFAULT 'MANUAL_ENTRY',
    "content" TEXT NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_documents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uq_knowledge_documents_id_org" UNIQUE ("id", "organization_id"),
    CONSTRAINT "fk_knowledge_documents_organization" FOREIGN KEY ("organization_id")
        REFERENCES "organizations"("id") ON DELETE CASCADE
);

-- 3. Create knowledge_chunks table
CREATE TABLE "knowledge_chunks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "chunk_index" INT NOT NULL,
    "chunk_text" TEXT NOT NULL,
    "token_count" INT NOT NULL DEFAULT 0,
    "embedding" vector(1536) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_chunks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uq_knowledge_chunks_id_org" UNIQUE ("id", "organization_id"),
    CONSTRAINT "fk_knowledge_chunks_document_org" FOREIGN KEY ("document_id", "organization_id")
        REFERENCES "knowledge_documents"("id", "organization_id") ON DELETE CASCADE,
    CONSTRAINT "fk_knowledge_chunks_organization" FOREIGN KEY ("organization_id")
        REFERENCES "organizations"("id") ON DELETE RESTRICT
);

-- 4. Create indexes
CREATE INDEX "idx_knowledge_documents_org" ON "knowledge_documents"("organization_id");
CREATE INDEX "idx_knowledge_documents_org_status" ON "knowledge_documents"("organization_id", "status");
CREATE INDEX "idx_knowledge_chunks_org_doc" ON "knowledge_chunks"("organization_id", "document_id");
CREATE INDEX "idx_knowledge_chunks_embedding" ON "knowledge_chunks" USING hnsw ("embedding" vector_cosine_ops);

-- 5. Enable and enforce Row Level Security (RLS)
ALTER TABLE "knowledge_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "knowledge_documents" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_knowledge_documents ON "knowledge_documents"
  FOR ALL
  TO orbit_app
  USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::UUID)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::UUID);

ALTER TABLE "knowledge_chunks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "knowledge_chunks" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_knowledge_chunks ON "knowledge_chunks"
  FOR ALL
  TO orbit_app
  USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::UUID)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::UUID);

-- 6. Grant least privilege permissions to orbit_app
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "knowledge_documents" TO orbit_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "knowledge_chunks" TO orbit_app;
