import { describe, it, expect, afterAll } from 'vitest';
import { Client } from 'pg';

describe('PostgreSQL Database Role Least-Privilege & Boundary Tests', () => {
  const appClient = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  const ingressClient = new Client({
    connectionString: process.env.INGRESS_DATABASE_URL,
  });

  const migratorClient = new Client({
    connectionString: process.env.MIGRATION_DATABASE_URL,
  });

  afterAll(async () => {
    await appClient.end().catch(() => {});
    await ingressClient.end().catch(() => {});
    await migratorClient.end().catch(() => {});
  });

  describe('1. orbit_app Runtime Role Restrictions', () => {
    it('is not a superuser and does not have BYPASSRLS or CREATEDB', async () => {
      await appClient.connect();
      const res = await appClient.query(
        "SELECT rolname, rolsuper, rolbypassrls, rolcreatedb FROM pg_roles WHERE rolname = 'orbit_app'"
      );

      expect(res.rows[0].rolname).toBe('orbit_app');
      expect(res.rows[0].rolsuper).toBe(false);
      expect(res.rows[0].rolbypassrls).toBe(false);
      expect(res.rows[0].rolcreatedb).toBe(false);
    });

    it('cannot execute DDL (CREATE TABLE throws permission denied)', async () => {
      await expect(
        appClient.query('CREATE TABLE evil_table (id INT PRIMARY KEY)')
      ).rejects.toThrow(/permission denied/i);
    });

    it('can SELECT from ai_model_pricing_schedules (Category B Read-Only)', async () => {
      const res = await appClient.query('SELECT * FROM ai_model_pricing_schedules');
      expect(res.rows.length).toBeGreaterThan(0);
    });

    it('CANNOT INSERT into ai_model_pricing_schedules (Category B DML denied)', async () => {
      await expect(
        appClient.query(
          "INSERT INTO ai_model_pricing_schedules (provider, canonical_model, pricing_version, prompt_token_rate_per_m, completion_token_rate_per_m, currency, effective_from) VALUES ('MOCK', 'test-model', 'v1', 0.1, 0.2, 'USD', NOW())"
        )
      ).rejects.toThrow(/permission denied/i);
    });

    it('CANNOT UPDATE or DELETE ai_model_pricing_schedules', async () => {
      await expect(
        appClient.query("UPDATE ai_model_pricing_schedules SET prompt_token_rate_per_m = 0.99")
      ).rejects.toThrow(/permission denied/i);

      await expect(
        appClient.query("DELETE FROM ai_model_pricing_schedules")
      ).rejects.toThrow(/permission denied/i);
    });

    it('CANNOT directly SELECT or query channel_routing_lookups (Category C Zero Access)', async () => {
      await expect(
        appClient.query('SELECT * FROM channel_routing_lookups')
      ).rejects.toThrow(/permission denied/i);
    });

    it('CANNOT execute resolve_channel_routing() (reserved exclusively for orbit_ingress)', async () => {
      await expect(
        appClient.query("SELECT * FROM resolve_channel_routing('WEB_CHAT', 'test_id')")
      ).rejects.toThrow(/permission denied/i);
    });
  });

  describe('2. orbit_ingress Ingress Role Restrictions', () => {
    it('is not a superuser and does not have BYPASSRLS', async () => {
      await ingressClient.connect();
      const res = await ingressClient.query(
        "SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'orbit_ingress'"
      );

      expect(res.rows[0].rolname).toBe('orbit_ingress');
      expect(res.rows[0].rolsuper).toBe(false);
      expect(res.rows[0].rolbypassrls).toBe(false);
    });

    it('has ZERO direct table access (cannot query users, channels, or conversations)', async () => {
      await expect(ingressClient.query('SELECT * FROM users')).rejects.toThrow(/permission denied/i);
      await expect(ingressClient.query('SELECT * FROM channels')).rejects.toThrow(/permission denied/i);
      await expect(ingressClient.query('SELECT * FROM conversations')).rejects.toThrow(/permission denied/i);
      await expect(ingressClient.query('SELECT * FROM channel_routing_lookups')).rejects.toThrow(/permission denied/i);
    });

    it('CAN execute resolve_channel_routing() SECURITY DEFINER function', async () => {
      const res = await ingressClient.query(
        "SELECT * FROM resolve_channel_routing('WEB_CHAT', 'non_existent_external_id')"
      );
      // Execution succeeds and returns empty set for unrouted identifier
      expect(res.rows).toHaveLength(0);
    });
  });

  describe('3. Database Constraints & Schema Invariants', () => {
    it('rejects non-USD currency in pricing schedules with CHECK constraint violation', async () => {
      await migratorClient.connect();
      await expect(
        migratorClient.query(
          "INSERT INTO ai_model_pricing_schedules (provider, canonical_model, pricing_version, prompt_token_rate_per_m, completion_token_rate_per_m, currency, effective_from) VALUES ('OPENAI', 'test-eur', 'v1', 0.1, 0.2, 'EUR', NOW())"
        )
      ).rejects.toThrow(/chk_pricing_currency_usd/i);
    });
  });
});
