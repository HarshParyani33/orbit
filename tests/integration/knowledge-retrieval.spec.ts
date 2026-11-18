import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/app.config';
import { PrismaService } from '../../apps/api/src/prisma/prisma.service';
import { TenantTransactionRunner } from '../../apps/api/src/tenancy/tenant-transaction-runner';
import { TokenService } from '../../apps/api/src/auth/token.service';
import { KnowledgeService } from '../../apps/api/src/knowledge/knowledge.service';

describe('Milestone 4 Slice 4.3: Multi-Tenant Vector Retrieval Engine & Semantic Search Tests', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  let runner: TenantTransactionRunner;
  let tokenService: TokenService;
  let knowledgeService: KnowledgeService;

  let orgAId: string;
  let orgBId: string;
  let userAId: string;
  let userBId: string;
  let tokenA: string;
  let tokenB: string;

  let docSlaId: string;
  let docWarrantyId: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { rawBody: true, logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();

    prisma = app.get(PrismaService);
    runner = app.get(TenantTransactionRunner);
    tokenService = app.get(TokenService);
    knowledgeService = app.get(KnowledgeService);

    // Fetch seeded Organizations and Users
    const orgA = await prisma.organization.findUniqueOrThrow({ where: { slug: 'acme' } });
    const orgB = await prisma.organization.findUniqueOrThrow({ where: { slug: 'beta' } });
    orgAId = orgA.id;
    orgBId = orgB.id;

    const userA = await prisma.user.findFirstOrThrow({
      where: { memberships: { some: { organizationId: orgAId } } },
    });
    const userB = await prisma.user.findFirstOrThrow({
      where: { memberships: { some: { organizationId: orgBId } } },
    });
    userAId = userA.id;
    userBId = userB.id;

    tokenA = tokenService.generateAccessToken({
      sub: userAId,
      email: userA.email,
      name: userA.name,
    });

    tokenB = tokenService.generateAccessToken({
      sub: userBId,
      email: userB.email,
      name: userB.name,
    });

    // Seed Tenant A Knowledge Documents
    const docSla = await knowledgeService.createDocument(orgAId, {
      title: 'Retrieval Test: SLA & Response Times',
      sourceType: 'POLICY',
      content:
        'SLA Response Guarantees: Enterprise tier customers receive 24/7 dedicated support with a guaranteed first response time under 15 minutes. Pro tier customers receive priority response within 2 hours during business hours.',
      metadata: { category: 'sla' },
    });
    docSlaId = docSla.id;

    const docWarranty = await knowledgeService.createDocument(orgAId, {
      title: 'Retrieval Test: Warranty & Hardware Returns',
      sourceType: 'POLICY',
      content:
        'Hardware Warranty & Return Policy: All devices come with a 2-year manufacturer limited warranty. Customers may return unopened products within 30 days for a full refund.',
      metadata: { category: 'warranty' },
    });
    docWarrantyId = docWarranty.id;
  });

  afterAll(async () => {
    try {
      await runner.runWithTenant(orgAId, async (tx) => {
        await tx.knowledgeDocument.deleteMany({
          where: { title: { startsWith: 'Retrieval Test' } },
        });
      });
      await runner.runWithTenant(orgBId, async (tx) => {
        await tx.knowledgeDocument.deleteMany({
          where: { title: { startsWith: 'Retrieval Test' } },
        });
      });
    } catch {
      // Ignore cleanup errors
    }
    await app.close();
  });

  describe('1. Semantic Vector Retrieval Service Tests', () => {
    it('retrieves relevant chunks with high cosine similarity for matching query', async () => {
      const searchResult = await knowledgeService.searchSimilarChunks(orgAId, {
        query:
          'SLA Response Guarantees: Enterprise tier customers receive 24/7 dedicated support with a guaranteed first response time under 15 minutes. Pro tier customers receive priority response within 2 hours during business hours.',
        minSimilarity: 0.8,
        limit: 5,
      });

      expect(searchResult.totalMatched).toBeGreaterThan(0);
      expect(searchResult.results[0].documentId).toBe(docSlaId);
      expect(searchResult.results[0].documentTitle).toBe('Retrieval Test: SLA & Response Times');
      expect(searchResult.results[0].similarity).toBeGreaterThan(0.95);
      expect(searchResult.results[0].chunkText).toContain('guaranteed first response time under 15 minutes');
    });

    it('filters out chunks below minSimilarity threshold', async () => {
      // With minSimilarity set to an impossible threshold, 0 chunks should match
      const searchResult = await knowledgeService.searchSimilarChunks(orgAId, {
        query: 'What is the refund policy for hardware?',
        minSimilarity: 0.9999,
        limit: 5,
      });

      expect(searchResult.totalMatched).toBe(0);
      expect(searchResult.results).toHaveLength(0);
    });

    it('respects limit constraint on retrieved results', async () => {
      const searchResult = await knowledgeService.searchSimilarChunks(orgAId, {
        query: 'Hardware warranty and returns policy 30 days refund',
        minSimilarity: 0.0,
        limit: 1,
      });

      expect(searchResult.results.length).toBeLessThanOrEqual(1);
    });
  });

  describe('2. Multi-Tenant Vector RLS Isolation Tests', () => {
    it('Tenant B CANNOT retrieve Tenant A knowledge chunks via vector search', async () => {
      // Tenant B searches with identical query that matched Tenant A SLA document
      const searchResultB = await knowledgeService.searchSimilarChunks(orgBId, {
        query:
          'SLA Response Guarantees: Enterprise tier customers receive 24/7 dedicated support with a guaranteed first response time under 15 minutes.',
        minSimilarity: 0.0, // lowest possible threshold
        limit: 10,
      });

      // PostgreSQL RLS ensures zero chunks from Tenant A are visible or matched
      expect(searchResultB.totalMatched).toBe(0);
      expect(searchResultB.results).toHaveLength(0);
    });

    it('Tenant B retrieves only its own chunks when searching', async () => {
      // Seed Tenant B document
      const docB = await knowledgeService.createDocument(orgBId, {
        title: 'Retrieval Test: Beta Corp Delivery Times',
        sourceType: 'FAQ',
        content: 'Beta Corp ships all orders within 48 hours via express delivery.',
      });

      const searchResultB = await knowledgeService.searchSimilarChunks(orgBId, {
        query: 'Beta Corp ships all orders within 48 hours via express delivery.',
        minSimilarity: 0.8,
        limit: 5,
      });

      expect(searchResultB.totalMatched).toBeGreaterThan(0);
      expect(searchResultB.results[0].documentId).toBe(docB.id);
      expect(searchResultB.results[0].documentTitle).toBe('Retrieval Test: Beta Corp Delivery Times');

      // Verify Tenant A cannot see Tenant B chunk
      const searchResultA = await knowledgeService.searchSimilarChunks(orgAId, {
        query: 'Beta Corp ships all orders within 48 hours via express delivery.',
        minSimilarity: 0.8,
        limit: 5,
      });
      expect(searchResultA.results.some((r) => r.documentId === docB.id)).toBe(false);
    });
  });

  describe('3. HTTP Search API & Auth Guard Tests', () => {
    it('POST /api/knowledge/search executes semantic vector search for authenticated tenant', async () => {
      const res = await fetch(`${baseUrl}/api/knowledge/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
          'X-Organization-ID': orgAId,
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({
          query:
            'Hardware Warranty & Return Policy: All devices come with a 2-year manufacturer limited warranty. Customers may return unopened products within 30 days for a full refund.',
          minSimilarity: 0.8,
          limit: 5,
        }),
      });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.totalMatched).toBeGreaterThan(0);
      expect(json.data.results[0].documentId).toBe(docWarrantyId);
      expect(json.data.results[0].similarity).toBeGreaterThan(0.95);
    });

    it('POST /api/knowledge/search rejects unauthenticated requests (401 Unauthorized)', async () => {
      const res = await fetch(`${baseUrl}/api/knowledge/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({
          query: 'What is your warranty policy?',
        }),
      });

      expect(res.status).toBe(401);
    });

    it('POST /api/knowledge/search rejects queries exceeding length limit (400 Bad Request)', async () => {
      const res = await fetch(`${baseUrl}/api/knowledge/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
          'X-Organization-ID': orgAId,
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({
          query: 'A'.repeat(1001), // exceeds 1000 char limit
        }),
      });

      expect(res.status).toBe(400);
    });
  });
});
