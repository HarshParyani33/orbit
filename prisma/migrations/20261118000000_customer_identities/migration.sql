-- ==============================================================================
-- PROJECT ORBIT — MILESTONE 2 SLICE 2.4: CUSTOMER IDENTITIES & PROFILES
-- ==============================================================================

-- 1. Create customers table
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name VARCHAR(128) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(64),
  metadata JSONB NOT NULL DEFAULT '{}',
  merged_into_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_customers_id_org UNIQUE (id, organization_id),
  CONSTRAINT fk_customers_merged_into FOREIGN KEY (merged_into_id, organization_id)
    REFERENCES customers (id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX idx_customers_org_email ON customers(organization_id, email);
CREATE INDEX idx_customers_org_phone ON customers(organization_id, phone);
CREATE INDEX idx_customers_org_created ON customers(organization_id, created_at);

-- 2. Create customer_channel_identities table
CREATE TABLE customer_channel_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  customer_id UUID NOT NULL,
  channel_id UUID NOT NULL,
  provider VARCHAR(32) NOT NULL,
  external_id VARCHAR(128) NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_channel_identities_channel_ext UNIQUE (channel_id, external_id),
  CONSTRAINT uq_channel_identities_id_org UNIQUE (id, organization_id),
  CONSTRAINT fk_channel_identities_customer_org FOREIGN KEY (customer_id, organization_id)
    REFERENCES customers (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT fk_channel_identities_channel_org FOREIGN KEY (channel_id, organization_id)
    REFERENCES channels (id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX idx_channel_identities_org_customer ON customer_channel_identities(organization_id, customer_id);

-- 3. Create customer_merge_audits table
CREATE TABLE customer_merge_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  source_customer_id UUID NOT NULL,
  target_customer_id UUID NOT NULL,
  performed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reason VARCHAR(255) NOT NULL,
  snapshot JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_merge_audits_source_org FOREIGN KEY (source_customer_id, organization_id)
    REFERENCES customers (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT fk_merge_audits_target_org FOREIGN KEY (target_customer_id, organization_id)
    REFERENCES customers (id, organization_id) ON DELETE CASCADE
);

CREATE INDEX idx_merge_audits_org_target ON customer_merge_audits(organization_id, target_customer_id);
CREATE INDEX idx_merge_audits_org_source ON customer_merge_audits(organization_id, source_customer_id);

-- 4. Alter conversations table
ALTER TABLE conversations ADD COLUMN customer_id UUID;

ALTER TABLE conversations ADD CONSTRAINT fk_conversations_customer_org
  FOREIGN KEY (customer_id, organization_id)
  REFERENCES customers (id, organization_id) ON DELETE RESTRICT;

CREATE INDEX idx_conversations_org_customer ON conversations(organization_id, customer_id);

-- 5. Row-Level Security (RLS) on new tenant-domain tables
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_customers ON customers
  FOR ALL
  TO orbit_app
  USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE customer_channel_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_channel_identities FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_customer_identities ON customer_channel_identities
  FOR ALL
  TO orbit_app
  USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE customer_merge_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_merge_audits FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_customer_merge_audits ON customer_merge_audits
  FOR ALL
  TO orbit_app
  USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

-- 6. Role Permissions (Explicit Least-Privilege Grants to orbit_app)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE customers, customer_channel_identities, customer_merge_audits TO orbit_app;
