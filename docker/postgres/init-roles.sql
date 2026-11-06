-- ==============================================================================
-- PROJECT ORBIT — POSTGRESQL INITIAL ROLE PROVISIONING SCRIPT
-- ==============================================================================

-- 1. Create Non-Superuser Database Roles
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'orbit_migrator') THEN
    CREATE ROLE orbit_migrator WITH
      LOGIN
      PASSWORD 'orbit_migrator_pass'
      NOSUPERUSER
      BYPASSRLS
      NOCREATEDB
      NOCREATEROLE;
  END IF;

  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'orbit_app') THEN
    CREATE ROLE orbit_app WITH
      LOGIN
      PASSWORD 'orbit_app_pass'
      NOSUPERUSER
      NOBYPASSRLS
      NOCREATEDB
      NOCREATEROLE;
  END IF;

  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'orbit_ingress') THEN
    CREATE ROLE orbit_ingress WITH
      LOGIN
      PASSWORD 'orbit_ingress_pass'
      NOSUPERUSER
      NOBYPASSRLS
      NOCREATEDB
      NOCREATEROLE;
  END IF;
END $$;

-- 2. Database Connection Privileges
REVOKE ALL ON DATABASE orbit_db FROM PUBLIC;
GRANT CONNECT ON DATABASE orbit_db TO orbit_migrator;
GRANT CONNECT ON DATABASE orbit_db TO orbit_app;
GRANT CONNECT ON DATABASE orbit_db TO orbit_ingress;

-- 3. Schema Ownership & Privileges
ALTER SCHEMA public OWNER TO orbit_migrator;
GRANT USAGE, CREATE ON SCHEMA public TO orbit_migrator;
GRANT USAGE ON SCHEMA public TO orbit_app;
GRANT USAGE ON SCHEMA public TO orbit_ingress;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM orbit_app;
REVOKE CREATE ON SCHEMA public FROM orbit_ingress;

-- 4. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gist";
CREATE EXTENSION IF NOT EXISTS "vector";

-- 5. Sequences Default Privileges for orbit_app
ALTER DEFAULT PRIVILEGES FOR ROLE orbit_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO orbit_app;

-- 6. Guarantee Zero Table/Sequence Access for orbit_ingress
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM orbit_ingress;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM orbit_ingress;
