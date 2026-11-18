-- ==============================================================================
-- PROJECT ORBIT — MILESTONE 3 SLICE 3.5: COMMERCIAL BILLING & SUBSCRIPTIONS
-- ==============================================================================

-- 1. Create subscriptions table
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "stripe_customer_id" VARCHAR(128),
    "stripe_subscription_id" VARCHAR(128),
    "plan_tier" VARCHAR(32) NOT NULL DEFAULT 'FREE',
    "status" VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    "current_period_start" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "current_period_end" TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days'),
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "seat_limit" INT NOT NULL DEFAULT 5,
    "ai_token_allowance" INT NOT NULL DEFAULT 100000,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uq_subscriptions_id_org" UNIQUE ("id", "organization_id"),
    CONSTRAINT "uq_subscriptions_org" UNIQUE ("organization_id"),
    CONSTRAINT "uq_subscriptions_stripe_sub" UNIQUE ("stripe_subscription_id"),
    CONSTRAINT "fk_subscriptions_organization" FOREIGN KEY ("organization_id")
        REFERENCES "organizations"("id") ON DELETE RESTRICT
);

-- 2. Create indexes
CREATE INDEX "idx_subscriptions_org" ON "subscriptions"("organization_id");
CREATE INDEX "idx_subscriptions_stripe_customer" ON "subscriptions"("stripe_customer_id");
CREATE INDEX "idx_subscriptions_status" ON "subscriptions"("status");

-- 3. Enable and enforce Row Level Security (RLS)
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscriptions" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_subscriptions ON "subscriptions"
  FOR ALL
  TO orbit_app
  USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::UUID)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::UUID);

-- 4. Grant least privilege permissions to orbit_app
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "subscriptions" TO orbit_app;
