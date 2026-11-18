-- CreateTable: webhook_events
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "idempotency_key" VARCHAR(255) NOT NULL,
    "dispatch_status" VARCHAR(24) NOT NULL DEFAULT 'PENDING_DISPATCH',
    "dispatch_token" UUID,
    "dispatch_expires_at" TIMESTAMPTZ,
    "processing_status" VARCHAR(24) NOT NULL DEFAULT 'UNCLAIMED',
    "payload" JSONB NOT NULL,
    "attempt_count" INT NOT NULL DEFAULT 0,
    "max_attempts" INT NOT NULL DEFAULT 5,
    "lease_token" UUID,
    "lease_expires_at" TIMESTAMPTZ,
    "last_error" TEXT,
    "next_retry_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uq_webhook_events_id_org" UNIQUE ("id", "organization_id"),
    CONSTRAINT "uq_webhook_provider_event" UNIQUE ("organization_id", "channel_id", "provider", "idempotency_key"),
    CONSTRAINT "fk_webhook_channel_org" FOREIGN KEY ("channel_id", "organization_id") REFERENCES "channels"("id", "organization_id") ON DELETE RESTRICT,
    CONSTRAINT "fk_webhook_events_organization" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT
);

-- CreateIndexes
CREATE INDEX "idx_webhook_dispatch_sweeper" ON "webhook_events"("dispatch_status", "created_at", "dispatch_expires_at") WHERE "dispatch_status" = 'PENDING_DISPATCH';
CREATE INDEX "idx_webhook_processing_sweeper" ON "webhook_events"("processing_status", "lease_expires_at", "next_retry_at") WHERE "processing_status" IN ('UNCLAIMED', 'PROCESSING');
CREATE INDEX "idx_webhook_org_created" ON "webhook_events"("organization_id", "created_at");

-- Row Level Security (RLS) Enforcement
ALTER TABLE "webhook_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_events" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_webhook_events ON "webhook_events"
  FOR ALL
  TO orbit_app
  USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::UUID)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::UUID);

-- Least Privilege Grants to orbit_app
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "webhook_events" TO orbit_app;
