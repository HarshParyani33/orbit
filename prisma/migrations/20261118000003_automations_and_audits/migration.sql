-- CreateTable: automation_rules
CREATE TABLE "automation_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "trigger" VARCHAR(32) NOT NULL,
    "conditions" JSONB NOT NULL DEFAULT '[]',
    "actions" JSONB NOT NULL DEFAULT '[]',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uq_automation_rules_id_org" UNIQUE ("id", "organization_id"),
    CONSTRAINT "fk_automation_rules_organization" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT
);

-- CreateTable: automation_execution_audits
CREATE TABLE "automation_execution_audits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "trigger" VARCHAR(32) NOT NULL,
    "matched" BOOLEAN NOT NULL DEFAULT false,
    "actions_executed" JSONB NOT NULL DEFAULT '[]',
    "status" VARCHAR(24) NOT NULL DEFAULT 'SUCCESS',
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_execution_audits_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uq_automation_audits_id_org" UNIQUE ("id", "organization_id"),
    CONSTRAINT "fk_automation_audits_rule" FOREIGN KEY ("rule_id", "organization_id") REFERENCES "automation_rules"("id", "organization_id") ON DELETE CASCADE,
    CONSTRAINT "fk_automation_audits_conversation" FOREIGN KEY ("conversation_id", "organization_id") REFERENCES "conversations"("id", "organization_id") ON DELETE CASCADE
);

-- CreateIndexes
CREATE INDEX "automation_rules_organization_id_trigger_enabled_idx" ON "automation_rules"("organization_id", "trigger", "enabled");
CREATE INDEX "automation_execution_audits_organization_id_conversation_idx" ON "automation_execution_audits"("organization_id", "conversation_id");
CREATE INDEX "automation_execution_audits_organization_id_rule_id_idx" ON "automation_execution_audits"("organization_id", "rule_id");

-- Row Level Security (RLS) Enforcement
ALTER TABLE "automation_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "automation_rules" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_automation_rules ON "automation_rules"
  FOR ALL
  TO orbit_app
  USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::UUID)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::UUID);

ALTER TABLE "automation_execution_audits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "automation_execution_audits" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_automation_audits ON "automation_execution_audits"
  FOR ALL
  TO orbit_app
  USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::UUID)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::UUID);

-- Least Privilege Grants to orbit_app
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "automation_rules" TO orbit_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "automation_execution_audits" TO orbit_app;
