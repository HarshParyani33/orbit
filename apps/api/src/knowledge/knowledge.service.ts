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
  OpenAiEmbeddingProvider,
  ChunkingEngine,
} from '@orbit/integrations';
import {
  CreateKnowledgeDocumentInput,
  ListKnowledgeDocumentsQuery,
  SearchKnowledgeInput,
  createKnowledgeDocumentSchema,
  listKnowledgeDocumentsQuerySchema,
  searchKnowledgeSchema,
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

export interface MatchedChunkResult {
  id: string;
  documentId: string;
  chunkIndex: number;
  chunkText: string;
  tokenCount: number;
  documentTitle: string;
  documentSourceType: string;
  similarity: number;
}

export interface KnowledgeSearchResult {
  query: string;
  totalMatched: number;
  results: MatchedChunkResult[];
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
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey && apiKey.trim().length > 0 && apiKey !== 'mock-key') {
      this.embeddingProvider = new OpenAiEmbeddingProvider(apiKey, 'text-embedding-3-small', 1536);
      this.logger.log('KnowledgeService initialized with production OpenAiEmbeddingProvider (text-embedding-3-small).');
    } else {
      this.embeddingProvider = new MockEmbeddingProvider(1536);
      this.logger.log('KnowledgeService initialized with MockEmbeddingProvider (non-production/test mode).');
    }
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

  /**
   * Performs semantic vector similarity search using pgvector cosine distance (<=>)
   * within tenant RLS boundary, filtering chunks below minSimilarity threshold.
   */
  public async searchSimilarChunks(
    orgId: string,
    rawInput: SearchKnowledgeInput,
  ): Promise<KnowledgeSearchResult> {
    const input = searchKnowledgeSchema.parse(rawInput);
    const limit = input.limit ?? 5;
    const minSimilarity = input.minSimilarity ?? 0.7;

    const queryEmbedding = await this.embeddingProvider.generateEmbedding(input.query);
    const vectorStr = `[${queryEmbedding.join(',')}]`;

    return this.tenantRunner.runWithTenant(orgId, async (tx) => {
      const rows = await tx.$queryRaw<Array<{
        id: string;
        documentId: string;
        chunkIndex: number;
        chunkText: string;
        tokenCount: number;
        documentTitle: string;
        documentSourceType: string;
        similarity: number;
      }>>`
        SELECT 
          c.id,
          c.document_id AS "documentId",
          c.chunk_index AS "chunkIndex",
          c.chunk_text AS "chunkText",
          c.token_count AS "tokenCount",
          d.title AS "documentTitle",
          d.source_type AS "documentSourceType",
          ROUND((1 - (c.embedding <=> ${vectorStr}::vector))::numeric, 4)::float AS similarity
        FROM "knowledge_chunks" c
        JOIN "knowledge_documents" d 
          ON c.document_id = d.id 
         AND c.organization_id = d.organization_id
        WHERE 1 - (c.embedding <=> ${vectorStr}::vector) >= ${minSimilarity}
        ORDER BY c.embedding <=> ${vectorStr}::vector ASC
        LIMIT ${limit};
      `;

      return {
        query: input.query,
        totalMatched: rows.length,
        results: rows,
      };
    });
  }
}
