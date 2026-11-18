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
import {
  ChunkingEngine,
  MockEmbeddingProvider,
} from '@orbit/integrations';

describe('Milestone 4 Slice 4.2: Knowledge Ingestion, Chunking & Embedding Pipeline Tests', () => {
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
  });

  afterAll(async () => {
    try {
      await runner.runWithTenant(orgAId, async (tx) => {
        await tx.knowledgeDocument.deleteMany({
          where: { title: { startsWith: 'Ingestion Test' } },
        });
      });
      await runner.runWithTenant(orgBId, async (tx) => {
        await tx.knowledgeDocument.deleteMany({
          where: { title: { startsWith: 'Ingestion Test' } },
        });
      });
    } catch {
      // Ignore cleanup errors
    }
    await app.close();
  });

  describe('1. Chunking Engine Tests', () => {
    it('segments short text into a single chunk with estimated token count', () => {
      const text = 'This is a short FAQ answer regarding shipping times.';
      const chunks = ChunkingEngine.chunkText(text, { maxChunkSize: 1500 });

      expect(chunks).toHaveLength(1);
      expect(chunks[0].chunkIndex).toBe(0);
      expect(chunks[0].chunkText).toBe(text);
      expect(chunks[0].tokenCount).toBe(Math.ceil(text.length / 4));
    });

    it('segments long multi-paragraph document into sequential chunks with overlap', () => {
      const paragraph1 = 'Introduction: Orbit provides omnichannel AI customer engagement tools. '.repeat(15);
      const paragraph2 = 'Pricing details: Starter plan is $29/mo, Pro plan is $99/mo with unlimited seats. '.repeat(15);
      const paragraph3 = 'Security policies: All customer data is isolated with PostgreSQL Row Level Security. '.repeat(15);

      const fullText = `${paragraph1}\n\n${paragraph2}\n\n${paragraph3}`;
      const chunks = ChunkingEngine.chunkText(fullText, { maxChunkSize: 800, chunkOverlap: 100 });

      expect(chunks.length).toBeGreaterThan(2);
      expect(chunks[0].chunkIndex).toBe(0);
      expect(chunks[1].chunkIndex).toBe(1);
      expect(chunks[2].chunkIndex).toBe(2);
      expect(chunks.every((c) => c.tokenCount > 0)).toBe(true);
    });
  });

  describe('2. Mock Embedding Provider Tests', () => {
    it('generates deterministic 1536-dimensional L2 unit vectors', async () => {
      const provider = new MockEmbeddingProvider(1536);
      const embedding = await provider.generateEmbedding('Return policy and warranty terms');

      expect(embedding).toHaveLength(1536);

      // Verify L2 norm = 1.0 (unit vector)
      const sumSq = embedding.reduce((acc, val) => acc + val * val, 0);
      const norm = Math.sqrt(sumSq);
      expect(norm).toBeCloseTo(1.0, 3);
    });

    it('generates identical vectors for identical text inputs', async () => {
      const provider = new MockEmbeddingProvider(1536);
      const vec1 = await provider.generateEmbedding('Business hours: Monday to Friday 9 AM to 5 PM');
      const vec2 = await provider.generateEmbedding('Business hours: Monday to Friday 9 AM to 5 PM');

      expect(vec1).toEqual(vec2);
    });
  });

  describe('3. Knowledge Base Ingestion Service Tests', () => {
    let createdDocId: string;

    it('ingests document, segments chunks, and stores vector embeddings atomically', async () => {
      const doc = await knowledgeService.createDocument(orgAId, {
        title: 'Ingestion Test: Company Refund & Return Policy',
        sourceType: 'POLICY',
        content: `Standard Refund Policy:\n\nCustomers are eligible for a 100% full refund within 30 days of purchase.\n\nExceptions:\n\nCustom enterprise licenses and non-refundable migration fees are excluded.`,
        metadata: { category: 'legal', priority: 1 },
      });

      expect(doc).toBeDefined();
      expect(doc.id).toBeDefined();
      expect(doc.organizationId).toBe(orgAId);
      expect(doc.title).toBe('Ingestion Test: Company Refund & Return Policy');
      expect(doc.chunkCount).toBeGreaterThan(0);
      createdDocId = doc.id;

      // Verify chunks exist in DB
      const chunks = await runner.runWithTenant(orgAId, async (tx) => {
        return tx.knowledgeChunk.findMany({
          where: { documentId: doc.id },
        });
      });

      expect(chunks.length).toBe(doc.chunkCount);
      expect(chunks[0].chunkText).toContain('Standard Refund Policy');
    });

    it('retrieves paginated documents with accurate chunk count', async () => {
      const result = await knowledgeService.listDocuments(orgAId, {
        page: 1,
        limit: 10,
        search: 'Refund & Return Policy',
      });

      expect(result.data.length).toBeGreaterThan(0);
      const found = result.data.find((d) => d.id === createdDocId);
      expect(found).toBeDefined();
      expect(found?.chunkCount).toBeGreaterThan(0);
    });

    it('retrieves single document with complete chunk breakdown', async () => {
      const doc = await knowledgeService.getDocument(orgAId, createdDocId);

      expect(doc.id).toBe(createdDocId);
      expect(doc.chunks.length).toBeGreaterThan(0);
      expect(doc.chunks[0].chunkIndex).toBe(0);
      expect(doc.chunks[0].chunkText).toBeDefined();
    });

    it('enforces multi-tenant isolation: Tenant B cannot list or get Tenant A document', async () => {
      const resultB = await knowledgeService.listDocuments(orgBId);
      expect(resultB.data.some((d) => d.id === createdDocId)).toBe(false);

      await expect(
        knowledgeService.getDocument(orgBId, createdDocId),
      ).rejects.toThrow();

      await expect(
        knowledgeService.deleteDocument(orgBId, createdDocId),
      ).rejects.toThrow();
    });

    it('deleting document cascades to delete all stored vector chunks', async () => {
      // Create ephemeral document to delete
      const ephemeralDoc = await knowledgeService.createDocument(orgAId, {
        title: 'Ingestion Test: Temporary Deprecated Notes',
        sourceType: 'MANUAL_ENTRY',
        content: 'This note will be deleted to test cascading removal of vector embeddings.',
      });

      // Confirm chunks exist
      const beforeChunks = await runner.runWithTenant(orgAId, async (tx) => {
        return tx.knowledgeChunk.count({ where: { documentId: ephemeralDoc.id } });
      });
      expect(beforeChunks).toBeGreaterThan(0);

      // Delete document
      const deleteResult = await knowledgeService.deleteDocument(orgAId, ephemeralDoc.id);
      expect(deleteResult.success).toBe(true);

      // Verify document and chunks are gone
      const afterChunks = await runner.runWithTenant(orgAId, async (tx) => {
        return tx.knowledgeChunk.count({ where: { documentId: ephemeralDoc.id } });
      });
      expect(afterChunks).toBe(0);
    });
  });

  describe('4. Knowledge HTTP API Endpoints & Auth Guard Tests', () => {
    let apiDocId: string;

    it('POST /api/knowledge/documents creates document with valid JWT and active tenant', async () => {
      const res = await fetch(`${baseUrl}/api/knowledge/documents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
          'X-Organization-ID': orgAId,
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({
          title: 'Ingestion Test: HTTP API Knowledge Guide',
          sourceType: 'FAQ',
          content: 'Frequently Asked Questions about our API rate limits and Webhook headers.',
          metadata: { author: 'Engineering' },
        }),
      });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.id).toBeDefined();
      expect(json.data.chunkCount).toBeGreaterThan(0);
      apiDocId = json.data.id;
    });

    it('POST /api/knowledge/documents fails without authentication (401 Unauthorized)', async () => {
      const res = await fetch(`${baseUrl}/api/knowledge/documents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({
          title: 'Unauthenticated Document',
          sourceType: 'FAQ',
          content: 'Should be rejected immediately by JwtAuthGuard.',
        }),
      });

      expect(res.status).toBe(401);
    });

    it('GET /api/knowledge/documents lists documents for authenticated tenant', async () => {
      const res = await fetch(`${baseUrl}/api/knowledge/documents?page=1&limit=10`, {
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'X-Organization-ID': orgAId,
          'X-Requested-With': 'XMLHttpRequest',
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.data.length).toBeGreaterThan(0);
      expect(json.data.data.some((d: any) => d.id === apiDocId)).toBe(true);
    });

    it('GET /api/knowledge/documents/:id retrieves single document for authenticated tenant', async () => {
      const res = await fetch(`${baseUrl}/api/knowledge/documents/${apiDocId}`, {
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'X-Organization-ID': orgAId,
          'X-Requested-With': 'XMLHttpRequest',
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.id).toBe(apiDocId);
      expect(json.data.chunks.length).toBeGreaterThan(0);
    });

    it('GET /api/knowledge/documents/:id blocks cross-tenant access (404 Not Found under Tenant B)', async () => {
      const res = await fetch(`${baseUrl}/api/knowledge/documents/${apiDocId}`, {
        headers: {
          Authorization: `Bearer ${tokenB}`,
          'X-Organization-ID': orgBId,
          'X-Requested-With': 'XMLHttpRequest',
        },
      });

      expect(res.status).toBe(404);
    });

    it('DELETE /api/knowledge/documents/:id deletes document and cascades chunk removal', async () => {
      const res = await fetch(`${baseUrl}/api/knowledge/documents/${apiDocId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'X-Organization-ID': orgAId,
          'X-Requested-With': 'XMLHttpRequest',
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      // Verify 404 on subsequent get
      const verifyRes = await fetch(`${baseUrl}/api/knowledge/documents/${apiDocId}`, {
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'X-Organization-ID': orgAId,
          'X-Requested-With': 'XMLHttpRequest',
        },
      });

      expect(verifyRes.status).toBe(404);
    });
  });
});
