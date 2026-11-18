import {
  Injectable,
  Inject,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantTransactionRunner } from '../tenancy/tenant-transaction-runner';
import {
  IEmbeddingProvider,
  MockEmbeddingProvider,
  ChunkingEngine,
} from '@orbit/integrations';
import {
  CreateKnowledgeDocumentInput,
  ListKnowledgeDocumentsQuery,
  createKnowledgeDocumentSchema,
  listKnowledgeDocumentsQuerySchema,
} from '@orbit/validation';

export interface KnowledgeDocumentSummary {
  id: string;
  organizationId: string;
  title: string;
  sourceType: string;
  content: string;
  status: string;
  metadata: unknown;
  chunkCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedKnowledgeDocuments {
  data: KnowledgeDocumentSummary[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);
  private embeddingProvider: IEmbeddingProvider;

  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(TenantTransactionRunner)
    private readonly tenantRunner: TenantTransactionRunner,
  ) {
    this.embeddingProvider = new MockEmbeddingProvider(1536);
  }

  public setEmbeddingProvider(provider: IEmbeddingProvider): void {
    this.embeddingProvider = provider;
  }

  public getEmbeddingProvider(): IEmbeddingProvider {
    return this.embeddingProvider;
  }

  /**
   * Ingests a new document: segments content into chunks, generates vector embeddings,
   * and persists both document and chunks atomically within tenant transaction.
   */
  public async createDocument(
    orgId: string,
    rawInput: CreateKnowledgeDocumentInput,
  ): Promise<KnowledgeDocumentSummary> {
    const input = createKnowledgeDocumentSchema.parse(rawInput);

    // 1. Chunk content
    const chunks = ChunkingEngine.chunkText(input.content);

    // 2. Compute vector embeddings
    const texts = chunks.map((c) => c.chunkText);
    const embeddings = await this.embeddingProvider.generateEmbeddings(texts);

    // 3. Persist atomically inside tenant RLS transaction
    return this.tenantRunner.runWithTenant(orgId, async (tx) => {
      const doc = await tx.knowledgeDocument.create({
        data: {
          organizationId: orgId,
          title: input.title,
          sourceType: input.sourceType,
          content: input.content,
          status: 'ACTIVE',
          metadata: (input.metadata as Prisma.InputJsonValue) ?? {},
        },
      });

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const embedding = embeddings[i];
        const chunkId = randomUUID();
        const vectorStr = `[${embedding.join(',')}]`;

        await tx.$executeRaw`
          INSERT INTO "knowledge_chunks" (
            "id", "organization_id", "document_id", "chunk_index", "chunk_text", "token_count", "embedding", "metadata"
          ) VALUES (
            ${chunkId}::uuid,
            ${orgId}::uuid,
            ${doc.id}::uuid,
            ${chunk.chunkIndex},
            ${chunk.chunkText},
            ${chunk.tokenCount},
            ${vectorStr}::vector,
            '{}'::jsonb
          )
        `;
      }

      this.logger.log(
        `Created knowledge document ${doc.id} with ${chunks.length} chunks for org ${orgId}`,
      );

      return {
        id: doc.id,
        organizationId: doc.organizationId,
        title: doc.title,
        sourceType: doc.sourceType,
        content: doc.content,
        status: doc.status,
        metadata: doc.metadata,
        chunkCount: chunks.length,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    });
  }

  /**
   * Retrieves paginated documents with chunk counts for an organization.
   */
  public async listDocuments(
    orgId: string,
    rawQuery?: ListKnowledgeDocumentsQuery,
  ): Promise<PaginatedKnowledgeDocuments> {
    const query = listKnowledgeDocumentsQuerySchema.parse(rawQuery ?? {});
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    return this.tenantRunner.runWithTenant(orgId, async (tx) => {
      const where: Prisma.KnowledgeDocumentWhereInput = {
        organizationId: orgId,
        ...(query.search
          ? { title: { contains: query.search, mode: 'insensitive' } }
          : {}),
      };

      const [total, documents] = await Promise.all([
        tx.knowledgeDocument.count({ where }),
        tx.knowledgeDocument.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
          include: {
            _count: {
              select: { chunks: true },
            },
          },
        }),
      ]);

      const data: KnowledgeDocumentSummary[] = documents.map((doc) => ({
        id: doc.id,
        organizationId: doc.organizationId,
        title: doc.title,
        sourceType: doc.sourceType,
        content: doc.content,
        status: doc.status,
        metadata: doc.metadata,
        chunkCount: doc._count.chunks,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      }));

      return {
        data,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      };
    });
  }

  /**
   * Retrieves a single document with its chunk segments.
   */
  public async getDocument(orgId: string, docId: string) {
    return this.tenantRunner.runWithTenant(orgId, async (tx) => {
      const doc = await tx.knowledgeDocument.findFirst({
        where: { id: docId, organizationId: orgId },
        include: {
          chunks: {
            select: {
              id: true,
              chunkIndex: true,
              chunkText: true,
              tokenCount: true,
              createdAt: true,
            },
            orderBy: { chunkIndex: 'asc' },
          },
        },
      });

      if (!doc) {
        throw new NotFoundException(`Knowledge document with id ${docId} not found`);
      }

      return {
        id: doc.id,
        organizationId: doc.organizationId,
        title: doc.title,
        sourceType: doc.sourceType,
        content: doc.content,
        status: doc.status,
        metadata: doc.metadata,
        chunkCount: doc.chunks.length,
        chunks: doc.chunks,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    });
  }

  /**
   * Deletes a document, automatically cascading removal to all chunks.
   */
  public async deleteDocument(orgId: string, docId: string) {
    return this.tenantRunner.runWithTenant(orgId, async (tx) => {
      const doc = await tx.knowledgeDocument.findFirst({
        where: { id: docId, organizationId: orgId },
      });

      if (!doc) {
        throw new NotFoundException(`Knowledge document with id ${docId} not found`);
      }

      await tx.knowledgeDocument.delete({
        where: { id: docId },
      });

      this.logger.log(`Deleted knowledge document ${docId} for org ${orgId}`);

      return {
        success: true,
        message: 'Knowledge document deleted successfully',
      };
    });
  }
}
