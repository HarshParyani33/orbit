-- ==============================================================================
-- PROJECT ORBIT — MILESTONE 3 SLICE 3.4: MESSAGE MEDIA ATTACHMENTS & STORAGE
-- ==============================================================================

-- 1. Ensure composite unique constraint on messages (id, organization_id)
ALTER TABLE "messages" ADD CONSTRAINT "uq_messages_id_org" UNIQUE ("id", "organization_id");

-- 2. Create message_attachments table
CREATE TABLE "message_attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "file_type" VARCHAR(128) NOT NULL,
    "file_size" INT NOT NULL,
    "storage_key" VARCHAR(512) NOT NULL,
    "storage_provider" VARCHAR(32) NOT NULL DEFAULT 'LOCAL',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uq_message_attachments_id_org" UNIQUE ("id", "organization_id"),
    CONSTRAINT "fk_message_attachments_message_org" FOREIGN KEY ("message_id", "organization_id")
        REFERENCES "messages"("id", "organization_id") ON DELETE CASCADE,
    CONSTRAINT "fk_message_attachments_organization" FOREIGN KEY ("organization_id")
        REFERENCES "organizations"("id") ON DELETE RESTRICT
);

-- 3. Create indexes
CREATE INDEX "idx_message_attachments_org_message" ON "message_attachments"("organization_id", "message_id");
CREATE INDEX "idx_message_attachments_org_created" ON "message_attachments"("organization_id", "created_at");

-- 4. Enable and enforce Row Level Security (RLS)
ALTER TABLE "message_attachments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "message_attachments" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_message_attachments ON "message_attachments"
  FOR ALL
  TO orbit_app
  USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::UUID)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::UUID);

-- 5. Grant least privilege permissions to orbit_app
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "message_attachments" TO orbit_app;
