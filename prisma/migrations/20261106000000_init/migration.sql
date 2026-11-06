-- ==============================================================================
-- PROJECT ORBIT — INITIAL POSTGRESQL MIGRATION (20261106000000_init)
-- Conforms to docs/ARCHITECTURE.md v1.1.5
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gist";
CREATE EXTENSION IF NOT EXISTS "vector";

-- 2. GLOBAL IDENTITY & MEMBERSHIP TABLES (Category D)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(128) NOT NULL,
  family_id UUID NOT NULL DEFAULT gen_random_uuid(),
  is_revoked BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_token_hash ON user_sessions(token_hash);

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(128) NOT NULL,
  slug VARCHAR(64) NOT NULL UNIQUE,
  status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE organization_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(24) NOT NULL DEFAULT 'MEMBER',
  status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_membership_org_user UNIQUE (organization_id, user_id)
);

CREATE INDEX idx_memberships_user_id ON organization_memberships(user_id);

-- 3. TENANT-DOMAIN DATA TABLES (Category A — Governed by RLS)
CREATE TABLE channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  provider VARCHAR(32) NOT NULL,
  name VARCHAR(64) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
  config JSONB NOT NULL DEFAULT '{}',
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_channels_id_org UNIQUE (id, organization_id)
);

CREATE INDEX idx_channels_org ON channels(organization_id);

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  channel_id UUID NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'OPEN',
  title VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_conversations_id_org UNIQUE (id, organization_id),
  CONSTRAINT fk_conversations_channel_org FOREIGN KEY (channel_id, organization_id)
    REFERENCES channels (id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX idx_conversations_org_status ON conversations(organization_id, status);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  conversation_id UUID NOT NULL,
  sender_type VARCHAR(24) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_messages_conversation_org FOREIGN KEY (conversation_id, organization_id)
    REFERENCES conversations (id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX idx_messages_org_conversation ON messages(organization_id, conversation_id);

-- 4. ROUTING METADATA (Category C — Zero Direct Table Access)
CREATE TABLE channel_routing_lookups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(32) NOT NULL,
  external_account_id VARCHAR(128) NOT NULL,
  channel_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_channel_routing_provider_ext UNIQUE (provider, external_account_id),
  CONSTRAINT fk_routing_channel_org FOREIGN KEY (channel_id, organization_id)
    REFERENCES channels (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT fk_routing_org FOREIGN KEY (organization_id)
    REFERENCES organizations (id) ON DELETE CASCADE
);

CREATE INDEX idx_channel_routing_org_channel ON channel_routing_lookups(organization_id, channel_id);

-- 5. SYSTEM MODEL PRICING CATALOG (Category B — Strictly Read-Only to Runtime)
CREATE TABLE ai_model_pricing_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(32) NOT NULL,
  canonical_model VARCHAR(64) NOT NULL,
  model_alias VARCHAR(64),
  pricing_version VARCHAR(32) NOT NULL,
  prompt_token_rate_per_m DECIMAL(10, 6) NOT NULL,
  completion_token_rate_per_m DECIMAL(10, 6) NOT NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'USD',
  effective_from TIMESTAMPTZ NOT NULL,
  effective_to TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_pricing_currency_usd CHECK (currency = 'USD'),
  CONSTRAINT uq_pricing_provider_model_version UNIQUE (provider, canonical_model, pricing_version),
  CONSTRAINT ex_pricing_no_overlap EXCLUDE USING gist (
    provider WITH =,
    canonical_model WITH =,
    tstzrange(effective_from, COALESCE(effective_to, 'infinity'::timestamptz), '[)') WITH &&
  )
);

CREATE INDEX idx_pricing_lookup ON ai_model_pricing_schedules (provider, canonical_model, effective_from, effective_to);

-- ==============================================================================
-- 6. SECURITY DEFINER ROUTING FUNCTIONS
-- ==============================================================================

-- Function 1: Webhook Ingress Lookup (Pre-tenant context, granted to orbit_ingress ONLY)
CREATE OR REPLACE FUNCTION resolve_channel_routing(
  p_provider VARCHAR,
  p_external_account_id VARCHAR
)
RETURNS TABLE (
  channel_id UUID,
  organization_id UUID,
  status VARCHAR
)
LANGUAGE plpgsql
STRICT
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_provider IS NULL OR p_external_account_id IS NULL OR
     length(trim(p_provider)) = 0 OR length(trim(p_external_account_id)) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT c.channel_id, c.organization_id, c.status
  FROM channel_routing_lookups c
  WHERE c.provider = trim(p_provider)
    AND c.external_account_id = trim(p_external_account_id)
    AND c.status = 'ACTIVE'
  LIMIT 1;
END;
$$;

ALTER FUNCTION resolve_channel_routing(VARCHAR, VARCHAR) OWNER TO orbit_migrator;
REVOKE ALL ON FUNCTION resolve_channel_routing(VARCHAR, VARCHAR) FROM PUBLIC, orbit_app;
GRANT EXECUTE ON FUNCTION resolve_channel_routing(VARCHAR, VARCHAR) TO orbit_ingress;

-- Function 2: Authorized Channel Routing Registration (Tenant-Bounded)
CREATE OR REPLACE FUNCTION register_channel_routing(
  p_channel_id UUID,
  p_provider VARCHAR,
  p_external_account_id VARCHAR
)
RETURNS VOID
LANGUAGE plpgsql
STRICT
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_org UUID;
  v_channel_record RECORD;
  v_clean_provider VARCHAR;
  v_clean_ext_id VARCHAR;
BEGIN
  v_current_org := NULLIF(current_setting('app.current_org_id', true), '')::UUID;
  IF v_current_org IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: tenant context app.current_org_id is not set'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_clean_provider := trim(p_provider);
  v_clean_ext_id := trim(p_external_account_id);
  IF length(v_clean_provider) = 0 OR length(v_clean_ext_id) = 0 THEN
    RAISE EXCEPTION 'Invalid parameters: provider and external account identifier must be non-empty'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT id, organization_id, provider, status, deleted_at
  INTO v_channel_record
  FROM channels
  WHERE id = p_channel_id AND organization_id = v_current_org;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unauthorized: channel does not exist in the active organization'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF v_channel_record.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invalid operation: cannot register routing for a deleted channel'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF v_channel_record.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Invalid operation: channel must be ACTIVE to register routing'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF v_channel_record.provider <> v_clean_provider THEN
    RAISE EXCEPTION 'Provider mismatch: channel provider % does not match requested routing provider %',
      v_channel_record.provider, v_clean_provider
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  INSERT INTO channel_routing_lookups (
    channel_id,
    organization_id,
    provider,
    external_account_id,
    status,
    updated_at
  )
  VALUES (
    p_channel_id,
    v_current_org,
    v_clean_provider,
    v_clean_ext_id,
    'ACTIVE',
    NOW()
  )
  ON CONFLICT (provider, external_account_id)
  DO UPDATE SET
    channel_id = EXCLUDED.channel_id,
    status = 'ACTIVE',
    updated_at = NOW()
  WHERE channel_routing_lookups.organization_id = v_current_org;

  IF NOT FOUND AND EXISTS (
    SELECT 1 FROM channel_routing_lookups 
    WHERE provider = v_clean_provider AND external_account_id = v_clean_ext_id
  ) THEN
    RAISE EXCEPTION 'Conflict: external account identifier is already registered by another organization'
      USING ERRCODE = 'unique_violation';
  END IF;
END;
$$;

ALTER FUNCTION register_channel_routing(UUID, VARCHAR, VARCHAR) OWNER TO orbit_migrator;
REVOKE ALL ON FUNCTION register_channel_routing(UUID, VARCHAR, VARCHAR) FROM PUBLIC, orbit_ingress;
GRANT EXECUTE ON FUNCTION register_channel_routing(UUID, VARCHAR, VARCHAR) TO orbit_app;

-- Function 3: Authorized Channel Routing Deregistration (Tenant-Bounded)
CREATE OR REPLACE FUNCTION deregister_channel_routing(
  p_channel_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
STRICT
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_org UUID;
BEGIN
  v_current_org := NULLIF(current_setting('app.current_org_id', true), '')::UUID;
  IF v_current_org IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: tenant context app.current_org_id is not set'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  DELETE FROM channel_routing_lookups
  WHERE channel_id = p_channel_id AND organization_id = v_current_org;
END;
$$;

ALTER FUNCTION deregister_channel_routing(UUID) OWNER TO orbit_migrator;
REVOKE ALL ON FUNCTION deregister_channel_routing(UUID) FROM PUBLIC, orbit_ingress;
GRANT EXECUTE ON FUNCTION deregister_channel_routing(UUID) TO orbit_app;

-- ==============================================================================
-- 7. ROW-LEVEL SECURITY (RLS) POLICIES ON TENANT TABLES
-- ==============================================================================

ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_channels ON channels
  FOR ALL
  TO orbit_app
  USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_conversations ON conversations
  FOR ALL
  TO orbit_app
  USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_messages ON messages
  FOR ALL
  TO orbit_app
  USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

-- ==============================================================================
-- 8. CATEGORIZED TABLE PERMISSIONS (Explicit Least-Privilege Grants)
-- ==============================================================================

-- Category A: Tenant Data Tables
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE channels, conversations, messages TO orbit_app;

-- Category B: System Reference Catalogs (Strictly Read-Only to Runtime)
GRANT SELECT ON TABLE ai_model_pricing_schedules TO orbit_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE ai_model_pricing_schedules FROM orbit_app;

-- Category C: Routing Metadata (Zero Direct Table Access)
REVOKE ALL ON TABLE channel_routing_lookups FROM PUBLIC, orbit_app, orbit_ingress;

-- Category D: Global Identity & Membership Tables
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE users, user_sessions, organizations, organization_memberships TO orbit_app;

-- Ingress Role: Zero table access
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM orbit_ingress;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM orbit_ingress;
