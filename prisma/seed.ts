import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL,
    },
  },
});

async function main() {
  console.log('[Seed] Seeding Project Orbit initial data...');

  const passwordHash = await argon2.hash('OrbitPassword123!', {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
  });

  // 1. Seed Pricing Schedules (Category B)
  const gpt4oMini = await prisma.aiModelPricingSchedule.upsert({
    where: {
      uq_pricing_provider_model_version: {
        provider: 'OPENAI',
        canonicalModel: 'gpt-4o-mini',
        pricingVersion: '2024-07-18-v1',
      },
    },
    update: {},
    create: {
      provider: 'OPENAI',
      canonicalModel: 'gpt-4o-mini',
      modelAlias: 'gpt-4o-mini-latest',
      pricingVersion: '2024-07-18-v1',
      promptTokenRatePerM: 0.15,
      completionTokenRatePerM: 0.60,
      currency: 'USD',
      effectiveFrom: new Date('2024-07-18T00:00:00Z'),
    },
  });
  console.log('[Seed] Pricing schedule created:', gpt4oMini.canonicalModel);

  // 2. Seed Users
  const userAcmeOwner = await prisma.user.upsert({
    where: { email: 'owner@acme.com' },
    update: {},
    create: {
      email: 'owner@acme.com',
      name: 'Alice Owner',
      passwordHash,
      status: 'ACTIVE',
    },
  });

  const userAcmeMember = await prisma.user.upsert({
    where: { email: 'member@acme.com' },
    update: {},
    create: {
      email: 'member@acme.com',
      name: 'Bob Member',
      passwordHash,
      status: 'ACTIVE',
    },
  });

  const userBetaOwner = await prisma.user.upsert({
    where: { email: 'owner@beta.com' },
    update: {},
    create: {
      email: 'owner@beta.com',
      name: 'Carol Beta Owner',
      passwordHash,
      status: 'ACTIVE',
    },
  });

  // 3. Seed Organizations
  const orgAcme = await prisma.organization.upsert({
    where: { slug: 'acme' },
    update: {},
    create: {
      name: 'Acme Corporation',
      slug: 'acme',
      status: 'ACTIVE',
    },
  });

  const orgBeta = await prisma.organization.upsert({
    where: { slug: 'beta' },
    update: {},
    create: {
      name: 'Beta Labs',
      slug: 'beta',
      status: 'ACTIVE',
    },
  });

  // 4. Seed Memberships
  await prisma.organizationMembership.upsert({
    where: {
      uq_membership_org_user: {
        organizationId: orgAcme.id,
        userId: userAcmeOwner.id,
      },
    },
    update: {},
    create: {
      organizationId: orgAcme.id,
      userId: userAcmeOwner.id,
      role: 'OWNER',
      status: 'ACTIVE',
    },
  });

  await prisma.organizationMembership.upsert({
    where: {
      uq_membership_org_user: {
        organizationId: orgAcme.id,
        userId: userAcmeMember.id,
      },
    },
    update: {},
    create: {
      organizationId: orgAcme.id,
      userId: userAcmeMember.id,
      role: 'MEMBER',
      status: 'ACTIVE',
    },
  });

  await prisma.organizationMembership.upsert({
    where: {
      uq_membership_org_user: {
        organizationId: orgBeta.id,
        userId: userBetaOwner.id,
      },
    },
    update: {},
    create: {
      organizationId: orgBeta.id,
      userId: userBetaOwner.id,
      role: 'OWNER',
      status: 'ACTIVE',
    },
  });

  // 5. Seed Channels
  await prisma.channel.upsert({
    where: {
      id: '00000000-0000-0000-0000-000000000001',
    },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      organizationId: orgAcme.id,
      name: 'Acme Web Chat',
      provider: 'WEB_CHAT',
      status: 'ACTIVE',
      config: { allowed_domains: ['acme.com', 'localhost'] },
    },
  });

  await prisma.channel.upsert({
    where: {
      id: '00000000-0000-0000-0000-000000000002',
    },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000002',
      organizationId: orgBeta.id,
      name: 'Beta Web Chat',
      provider: 'WEB_CHAT',
      status: 'ACTIVE',
      config: { allowed_domains: ['beta.com', 'localhost'] },
    },
  });

  console.log('[Seed] Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('[Seed] Error during seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
