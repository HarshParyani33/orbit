-- ==============================================================================
-- PROJECT ORBIT — POSTGRESQL LOCAL DEVELOPMENT & CI ROLE PROVISIONING SCRIPT
-- ==============================================================================
--
-- [SECURITY BOUNDARY NOTICE — LOCAL DEVELOPMENT & CI ONLY]
-- This script is intended STRICTLY for local containerized development and CI.
-- Production deployments MUST NEVER use this script.
--
-- In production and staging environments, PostgreSQL roles and credentials MUST
-- be provisioned using cloud-managed IAM / Terraform infrastructure with
-- independently generated and rotated secrets (e.g. AWS Secrets Manager, GCP Secret Manager).
-- ==============================================================================

-- 1. Read Environment-Driven Role Credentials (psql \getenv)
-- Allows docker-compose / CI to inject credentials dynamically.
\getenv env_node_env NODE_ENV
\getenv env_migrator_pass ORBIT_MIGRATOR_PASSWORD
\getenv env_app_pass ORBIT_APP_PASSWORD
\getenv env_ingress_pass ORBIT_INGRESS_PASSWORD

-- Fallback to local development passwords ONLY if container environment variables are unset
\if :{?env_migrator_pass}
\else
  \set env_migrator_pass 'orbit_migrator_pass'
\endif

\if :{?env_app_pass}
\else
  \set env_app_pass 'orbit_app_pass'
\endif

\if :{?env_ingress_pass}
\else
  \set env_ingress_pass 'orbit_ingress_pass'
\endif

-- 1b. Strict Environment Boundary Enforcement:
-- If NODE_ENV is set to production or staging, default development passwords MUST NOT be used!
DO $$
DECLARE
  v_node_env text := NULLIF(:'env_node_env', '');
  v_migrator_pass text := :'env_migrator_pass';
  v_app_pass text := :'env_app_pass';
  v_ingress_pass text := :'env_ingress_pass';
BEGIN
  IF v_node_env IN ('production', 'staging') THEN
    IF v_migrator_pass = 'orbit_migrator_pass' OR v_app_pass = 'orbit_app_pass' OR v_ingress_pass = 'orbit_ingress_pass' THEN
      RAISE EXCEPTION 'FATAL SECURITY VIOLATION: Default development database passwords cannot be used when NODE_ENV is %! Independent production secrets are required.', v_node_env;
    END IF;
  END IF;
END $$;

-- 2. Create Non-Superuser Database Roles (Without hardcoded passwords)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'orbit_migrator') THEN
    CREATE ROLE orbit_migrator WITH
      LOGIN
      NOSUPERUSER
      BYPASSRLS
      NOCREATEDB
      NOCREATEROLE;
  END IF;

  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'orbit_app') THEN
    CREATE ROLE orbit_app WITH
      LOGIN
      NOSUPERUSER
      NOBYPASSRLS
      NOCREATEDB
      NOCREATEROLE;
  END IF;

  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'orbit_ingress') THEN
    CREATE ROLE orbit_ingress WITH
      LOGIN
      NOSUPERUSER
      NOBYPASSRLS
      NOCREATEDB
      NOCREATEROLE;
  END IF;
END $$;

-- 3. Apply Environment-Driven Passwords Safely (psql literal interpolation prevents SQL injection)
ALTER ROLE orbit_migrator WITH PASSWORD :'env_migrator_pass';
ALTER ROLE orbit_app WITH PASSWORD :'env_app_pass';
ALTER ROLE orbit_ingress WITH PASSWORD :'env_ingress_pass';

-- 4. Database Connection Privileges
REVOKE ALL ON DATABASE orbit_db FROM PUBLIC;
GRANT CONNECT ON DATABASE orbit_db TO orbit_migrator;
GRANT CONNECT ON DATABASE orbit_db TO orbit_app;
GRANT CONNECT ON DATABASE orbit_db TO orbit_ingress;

-- 5. Schema Ownership & Privileges
ALTER SCHEMA public OWNER TO orbit_migrator;
GRANT USAGE, CREATE ON SCHEMA public TO orbit_migrator;
GRANT USAGE ON SCHEMA public TO orbit_app;
GRANT USAGE ON SCHEMA public TO orbit_ingress;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM orbit_app;
REVOKE CREATE ON SCHEMA public FROM orbit_ingress;

-- 6. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gist";
CREATE EXTENSION IF NOT EXISTS "vector";

-- 7. Sequences Default Privileges for orbit_app
ALTER DEFAULT PRIVILEGES FOR ROLE orbit_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO orbit_app;

-- 8. Guarantee Zero Table/Sequence Access for orbit_ingress
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM orbit_ingress;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM orbit_ingress;
