import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { TenantTransactionRunner } from '../../apps/api/src/tenancy/tenant-transaction-runner';
import { PrismaService } from '../../apps/api/src/prisma/prisma.service';

describe('Milestone 4 Slice 4.1: Multi-Tenant Knowledge Base & pgvector RLS Isolation', () => {
  let prisma: PrismaService;
  let runner: TenantTransactionRunner;

  let orgAId: string;
  let orgBId: string;

  // Helper to generate a normalized 1536-dimensional mock vector
  function generateVector(dimension = 1536, seed = 1): string {
    const values: number[] = [];
    let sumSq = 0;
    for (let i = 0; i < dimension; i++) {
      const val = Math.sin(i * seed + 1);
      values.push(val);
      sumSq += val * val;
    }
    const norm = Math.sqrt(sumSq);
    const normalized = values.map((v) => Number((v / norm).toFixed(6)));
    return `[${normalized.join(',')}]`;
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    runner = new TenantTransactionRunner(prisma);

    const orgA = await prisma.organization.findUniqueOrThrow({ where: { slug: 'acme' } });
    const orgB = await prisma.organization.findUniqueOrThrow({ where: { slug: 'beta' } });
    orgAId = orgA.id;
    orgBId = orgB.id;
  });

  afterAll(async () => {
    // Cleanup any test documents created during testing
    try {
      await runner.runWithTenant(orgAId, async (tx) => {
        await tx.knowledgeDocument.deleteMany({
          where: { title: { startsWith: 'Test Knowledge' } },
        });
      });
      await runner.runWithTenant(orgBId, async (tx) => {
        await tx.knowledgeDocument.deleteMany({
          where: { title: { startsWith: 'Test Knowledge' } },
        });
      });
    } catch {
      // Ignore cleanup errors
    }
    await prisma.$disconnect();
  });

  it('1. Tenant A can create a knowledge document inside tenant context', async () => {
    const doc = await runner.runWithTenant(orgAId, async (tx) => {
      return tx.knowledgeDocument.create({
        data: {
          organizationId: orgAId,
          title: 'Test Knowledge Document A',
          sourceType: 'FAQ',
          content: 'Frequently Asked Questions about our SaaS platform.',
          status: 'ACTIVE',
          metadata: { category: 'billing', version: 1 },
        },
      });
    });

    expect(doc).toBeDefined();
    expect(doc.id).toBeDefined();
    expect(doc.organizationId).toBe(orgAId);
    expect(doc.title).toBe('Test Knowledge Document A');
    expect(doc.status).toBe('ACTIVE');
  });

  it('2. Tenant A can insert knowledge chunks with 1536-dim vector embeddings', async () => {
    const doc = await runner.runWithTenant(orgAId, async (tx) => {
      return tx.knowledgeDocument.findFirstOrThrow({
        where: { title: 'Test Knowledge Document A' },
      });
    });

    const chunkId = randomUUID();
    const vectorStr = generateVector(1536, 42);

    await runner.runWithTenant(orgAId, async (tx) => {
      await tx.$executeRaw`
        INSERT INTO "knowledge_chunks" (
          "id", "organization_id", "document_id", "chunk_index", "chunk_text", "token_count", "embedding", "metadata"
        ) VALUES (
          ${chunkId}::uuid,
          ${orgAId}::uuid,
          ${doc.id}::uuid,
          0,
          'Pricing details: Starter plan costs $29/mo, Pro plan costs $99/mo.',
          15,
          ${vectorStr}::vector,
          '{"section": "pricing"}'::jsonb
        )
      `;
    });

    // Verify chunk was stored
    const chunks = await runner.runWithTenant(orgAId, async (tx) => {
      return tx.knowledgeChunk.findMany({
        where: { documentId: doc.id },
      });
    });

    expect(chunks).toHaveLength(1);
    expect(chunks[0].chunkText).toContain('Starter plan costs $29/mo');
    expect(chunks[0].tokenCount).toBe(15);
  });

  it('3. Tenant A can execute pgvector cosine similarity search (<=>)', async () => {
    const queryVector = generateVector(1536, 42); // Same seed -> high cosine similarity ~ 1.0

    const results = await runner.runWithTenant(orgAId, async (tx) => {
      return tx.$queryRaw<Array<{ id: string; chunk_text: string; similarity: number }>>`
        SELECT 
          "id", 
          "chunk_text",
          1 - ("embedding" <=> ${queryVector}::vector) AS similarity
        FROM "knowledge_chunks"
        WHERE 1 - ("embedding" <=> ${queryVector}::vector) >= 0.8
        ORDER BY "embedding" <=> ${queryVector}::vector ASC
        LIMIT 5;
      `;
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].chunk_text).toContain('Starter plan costs $29/mo');
    expect(results[0].similarity).toBeGreaterThan(0.99);
  });

  it('4. Tenant B CANNOT read Tenant A knowledge documents (RLS isolation)', async () => {
    const docs = await runner.runWithTenant(orgBId, async (tx) => {
      return tx.knowledgeDocument.findMany({
        where: { title: 'Test Knowledge Document A' },
      });
    });

    expect(docs).toHaveLength(0);
  });

  it('5. Tenant B CANNOT read Tenant A knowledge chunks via relational query (RLS isolation)', async () => {
    const chunks = await runner.runWithTenant(orgBId, async (tx) => {
      return tx.knowledgeChunk.findMany();
    });

    // Zero chunks from Tenant A visible
    expect(chunks).toHaveLength(0);
  });

  it('6. Tenant B CANNOT read Tenant A knowledge chunks via pgvector similarity search (RLS isolation)', async () => {
    const queryVector = generateVector(1536, 42);

    const results = await runner.runWithTenant(orgBId, async (tx) => {
      return tx.$queryRaw<Array<{ id: string; similarity: number }>>`
        SELECT 
          "id",
          1 - ("embedding" <=> ${queryVector}::vector) AS similarity
        FROM "knowledge_chunks"
        ORDER BY "embedding" <=> ${queryVector}::vector ASC
        LIMIT 5;
      `;
    });

    // PostgreSQL RLS automatically filters out Tenant A chunks from raw vector similarity search
    expect(results).toHaveLength(0);
  });

  it('7. Tenant B CANNOT update Tenant A knowledge documents (affects 0 rows)', async () => {
    const docA = await runner.runWithTenant(orgAId, async (tx) => {
      return tx.knowledgeDocument.findFirstOrThrow({
        where: { title: 'Test Knowledge Document A' },
      });
    });

    const updateResult = await runner.runWithTenant(orgBId, async (tx) => {
      return tx.knowledgeDocument.updateMany({
        where: { id: docA.id },
        data: { title: 'Hacked Title by Tenant B' },
      });
    });

    expect(updateResult.count).toBe(0);

    // Verify Tenant A document remains unchanged
    const unchangedDoc = await runner.runWithTenant(orgAId, async (tx) => {
      return tx.knowledgeDocument.findUniqueOrThrow({ where: { id: docA.id } });
    });
    expect(unchangedDoc.title).toBe('Test Knowledge Document A');
  });

  it('8. Tenant B CANNOT insert a chunk referencing Tenant A document (composite FK violation)', async () => {
    const docA = await runner.runWithTenant(orgAId, async (tx) => {
      return tx.knowledgeDocument.findFirstOrThrow({
        where: { title: 'Test Knowledge Document A' },
      });
    });

    const chunkId = randomUUID();
    const vectorStr = generateVector(1536, 99);

    // Attempting to insert a chunk under Tenant B pointing to Tenant A document violates fk_knowledge_chunks_document_org
    await expect(
      runner.runWithTenant(orgBId, async (tx) => {
        await tx.$executeRaw`
          INSERT INTO "knowledge_chunks" (
            "id", "organization_id", "document_id", "chunk_index", "chunk_text", "token_count", "embedding"
          ) VALUES (
            ${chunkId}::uuid,
            ${orgBId}::uuid,
            ${docA.id}::uuid,
            0,
            'Malicious cross-tenant chunk insertion',
            10,
            ${vectorStr}::vector
          )
        `;
      }),
    ).rejects.toThrow();
  });

  it('9. Queries without active tenant context fail closed', async () => {
    // Direct query on orbit_app connection without app.current_org_id set returns 0 rows
    const docs = await prisma.knowledgeDocument.findMany();
    expect(docs).toHaveLength(0);

    const chunks = await prisma.knowledgeChunk.findMany();
    expect(chunks).toHaveLength(0);
  });

  it('10. Deleting a knowledge document cascades to delete its knowledge chunks', async () => {
    const doc = await runner.runWithTenant(orgAId, async (tx) => {
      return tx.knowledgeDocument.create({
        data: {
          organizationId: orgAId,
          title: 'Test Knowledge Ephemeral Doc',
          sourceType: 'POLICY',
          content: 'Ephemeral policy to be deleted.',
        },
      });
    });

    const chunkId = randomUUID();
    const vectorStr = generateVector(1536, 123);

    await runner.runWithTenant(orgAId, async (tx) => {
      await tx.$executeRaw`
        INSERT INTO "knowledge_chunks" (
          "id", "organization_id", "document_id", "chunk_index", "chunk_text", "token_count", "embedding"
        ) VALUES (
          ${chunkId}::uuid,
          ${orgAId}::uuid,
          ${doc.id}::uuid,
          0,
          'Ephemeral chunk to be cascade deleted.',
          8,
          ${vectorStr}::vector
        )
      `;
    });

    // Confirm chunk exists
    const beforeCount = await runner.runWithTenant(orgAId, async (tx) => {
      return tx.knowledgeChunk.count({ where: { documentId: doc.id } });
    });
    expect(beforeCount).toBe(1);

    // Delete document
    await runner.runWithTenant(orgAId, async (tx) => {
      await tx.knowledgeDocument.delete({ where: { id: doc.id } });
    });

    // Confirm chunk was cascaded
    const afterCount = await runner.runWithTenant(orgAId, async (tx) => {
      return tx.knowledgeChunk.count({ where: { documentId: doc.id } });
    });
    expect(afterCount).toBe(0);
  });
});
