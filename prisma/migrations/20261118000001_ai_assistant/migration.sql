-- ==============================================================================
-- PROJECT ORBIT — MILESTONE 2 SLICE 2.5: AI ASSISTANT FOUNDATION & COST LEDGER
-- ==============================================================================

-- 1. Create ai_configurations table
CREATE TABLE ai_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name VARCHAR(128) NOT NULL,
  system_instructions TEXT NOT NULL,
  policy_rules JSONB NOT NULL DEFAULT '[]',
  provider VARCHAR(32) NOT NULL DEFAULT 'MOCK',
  model VARCHAR(64) NOT NULL DEFAULT 'gpt-4o-mini',
  temperature NUMERIC(3, 2) NOT NULL DEFAULT 0.3,
  status VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
  version INT NOT NULL DEFAULT 1,
  approved_at TIMESTAMPTZ,
  approved_by_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_ai_configs_id_org UNIQUE (id, organization_id)
);

CREATE INDEX idx_ai_configs_org_status ON ai_configurations(organization_id, status);

-- 2. Create ai_requests table
CREATE TABLE ai_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  conversation_id UUID NOT NULL,
  idempotency_key VARCHAR(255) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_ai_requests_id_org UNIQUE (id, organization_id),
  CONSTRAINT uq_ai_requests_org_idempotency UNIQUE (organization_id, idempotency_key)
);

CREATE INDEX idx_ai_requests_org_conversation ON ai_requests(organization_id, conversation_id);

-- 3. Create ai_request_attempts table
CREATE TABLE ai_request_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  request_id UUID NOT NULL,
  provider VARCHAR(32) NOT NULL,
  model VARCHAR(64) NOT NULL,
  prompt_tokens INT NOT NULL DEFAULT 0,
  completion_tokens INT NOT NULL DEFAULT 0,
  incurred_cost_usd NUMERIC(10, 6),
  cost_reconciliation_status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  is_tenant_billable BOOLEAN NOT NULL DEFAULT false,
  status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_ai_request_attempts_id_org UNIQUE (id, organization_id),
  CONSTRAINT fk_ai_request_attempts_request_org FOREIGN KEY (request_id, organization_id)
    REFERENCES ai_requests (id, organization_id) ON DELETE CASCADE
);

CREATE INDEX idx_ai_request_attempts_org_request ON ai_request_attempts(organization_id, request_id);

-- 4. Create ai_usage_events table
CREATE TABLE ai_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  request_id UUID NOT NULL UNIQUE,
  total_tokens INT NOT NULL,
  billable_amount_usd NUMERIC(10, 6) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_ai_usage_request_org UNIQUE (request_id, organization_id),
  CONSTRAINT uq_ai_usage_events_id_org UNIQUE (id, organization_id),
  CONSTRAINT fk_ai_usage_events_request_org FOREIGN KEY (request_id, organization_id)
    REFERENCES ai_requests (id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX idx_ai_usage_events_org_created ON ai_usage_events(organization_id, created_at);

-- 5. Row-Level Security (RLS) on AI tenant tables
ALTER TABLE ai_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_configurations FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_ai_configurations ON ai_configurations
  FOR ALL
  TO orbit_app
  USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE ai_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_requests FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_ai_requests ON ai_requests
  FOR ALL
  TO orbit_app
  USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE ai_request_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_request_attempts FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_ai_request_attempts ON ai_request_attempts
  FOR ALL
  TO orbit_app
  USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE ai_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_events FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_ai_usage_events ON ai_usage_events
  FOR ALL
  TO orbit_app
  USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

-- 6. Table Permissions to orbit_app
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ai_configurations, ai_requests, ai_request_attempts, ai_usage_events TO orbit_app;
