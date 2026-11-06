import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, Prisma } from '@prisma/client';
import { TenantTransactionRunner } from '../../apps/api/src/tenancy/tenant-transaction-runner';
import { PrismaService } from '../../apps/api/src/prisma/prisma.service';

describe('PostgreSQL Row-Level Security & Tenant Isolation Tests', () => {
  let prisma: PrismaService;
  let runner: TenantTransactionRunner;

  let orgAId: string;
  let orgBId: string;
  let channelAId: string;
  let channelBId: string;

  beforeAll(async () => {
    // Connect to PostgreSQL strictly using orbit_app runtime credentials
    prisma = new PrismaService();
    await prisma.$connect();
    runner = new TenantTransactionRunner(prisma);

    // Fetch seeded Organizations A and B
    const orgA = await prisma.organization.findUniqueOrThrow({ where: { slug: 'acme' } });
    const orgB = await prisma.organization.findUniqueOrThrow({ where: { slug: 'beta' } });
    orgAId = orgA.id;
    orgBId = orgB.id;

    // Fetch seeded channels inside their respective tenant contexts (RLS requires active context)
    const chA = await runner.runWithTenant(orgAId, async (tx) => {
      return tx.channel.findFirstOrThrow({ where: { organizationId: orgAId } });
    });
    const chB = await runner.runWithTenant(orgBId, async (tx) => {
      return tx.channel.findFirstOrThrow({ where: { organizationId: orgBId } });
    });
    channelAId = chA.id;
    channelBId = chB.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('1. Tenant A can read its own channels inside tenant context', async () => {
    const channels = await runner.runWithTenant(orgAId, async (tx) => {
      return tx.channel.findMany();
    });

    expect(channels.length).toBeGreaterThan(0);
    expect(channels.every((c) => c.organizationId === orgAId)).toBe(true);
  });

  it('2. Tenant A CANNOT see Tenant B channels (RLS blocks cross-tenant reads)', async () => {
    const channels = await runner.runWithTenant(orgAId, async (tx) => {
      return tx.channel.findMany({
        where: { id: channelBId },
      });
    });

    // Returns 0 rows because RLS filters out Tenant B records
    expect(channels).toHaveLength(0);
  });

  it('3. Tenant A CANNOT update Tenant B records (affects 0 rows)', async () => {
    const updateResult = await runner.runWithTenant(orgAId, async (tx) => {
      return tx.channel.updateMany({
        where: { id: channelBId },
        data: { name: 'Hacked by Tenant A' },
      });
    });

    expect(updateResult.count).toBe(0);

    // Verify channel B name remains untouched
    const channelB = await runner.runWithTenant(orgBId, async (tx) => {
      return tx.channel.findUnique({ where: { id: channelBId } });
    });
    expect(channelB?.name).toBe('Beta Web Chat');
  });

  it('4. Tenant A inserting a record with Tenant B organization_id fails with RLS policy violation', async () => {
    await expect(
      runner.runWithTenant(orgAId, async (tx) => {
        return tx.conversation.create({
          data: {
            organizationId: orgBId, // Intentional spoofing: inserting for Tenant B while in Tenant A context
            channelId: channelAId,
            title: 'Spoofed conversation',
          },
        });
      })
    ).rejects.toThrow();
  });

  it('5. Missing tenant context fails closed (0 rows returned or policy violation)', async () => {
    // Direct query on standard client without establishing app.current_org_id
    const channels = await prisma.channel.findMany();
    // With FORCE ROW LEVEL SECURITY and NULL context, organization_id = NULL evaluates to falsy
    expect(channels).toHaveLength(0);

    // Direct write without tenant context fails with policy violation
    await expect(
      prisma.conversation.create({
        data: {
          organizationId: orgAId,
          channelId: channelAId,
          title: 'Unscoped insert',
        },
      })
    ).rejects.toThrow();
  });

  it('6. Connection pool parameter leak prevention (SET LOCAL is automatically discarded on commit)', async () => {
    // 1. Run a valid transaction in Tenant A
    await runner.runWithTenant(orgAId, async (tx) => {
      const res = await tx.channel.findMany();
      expect(res.length).toBeGreaterThan(0);
      return res;
    });

    // 2. Perform query on root client (which reuses pooled connections)
    // Verify that app.current_org_id is empty/NULL and no records leak
    const channelsAfter = await prisma.channel.findMany();
    expect(channelsAfter).toHaveLength(0);
  });

  it('7. Omitted application WHERE filter is still completely isolated by RLS', async () => {
    // Deliberately omit `where: { organizationId: orgAId }`
    const allVisibleChannels = await runner.runWithTenant(orgAId, async (tx) => {
      return tx.channel.findMany(); // Unfiltered query
    });

    expect(allVisibleChannels.length).toBeGreaterThan(0);
    // Guarantees zero cross-contamination
    expect(allVisibleChannels.some((c) => c.organizationId === orgBId)).toBe(false);
  });
});
