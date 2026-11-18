import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  listKnowledgeDocuments,
  getKnowledgeDocument,
  createKnowledgeDocument,
  deleteKnowledgeDocument,
  searchKnowledge,
} from '../../apps/web/src/api/knowledge';

describe('Milestone 4 Slice 4.5 — Knowledge Base Frontend API Client Unit Tests', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('1. listKnowledgeDocuments builds proper query string and parses paginated document list', async () => {
    let capturedUrl = '';
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      capturedUrl = url;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            data: [
              {
                id: '11111111-1111-4111-8111-111111111111',
                organizationId: 'org-test',
                title: 'Return Policy',
                sourceType: 'POLICY',
                content: '30 day returns allowed.',
                status: 'INDEXED',
                metadata: { category: 'returns' },
                chunkCount: 1,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
            total: 1,
            page: 2,
            limit: 10,
            totalPages: 1,
          },
        }),
      };
    });

    const result = await listKnowledgeDocuments({ page: 2, limit: 10, search: 'returns' });

    expect(capturedUrl).toBe('/api/knowledge/documents?page=2&limit=10&search=returns');
    expect(result.data).toHaveLength(1);
    expect(result.data[0].title).toBe('Return Policy');
    expect(result.total).toBe(1);
    expect(result.page).toBe(2);
  });

  it('2. getKnowledgeDocument retrieves document detail and chunk breakdown', async () => {
    const docId = '22222222-2222-4222-8222-222222222222';
    let capturedUrl = '';
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      capturedUrl = url;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            id: docId,
            organizationId: 'org-test',
            title: 'SLA Guarantee',
            sourceType: 'POLICY',
            content: 'Guaranteed 99.9% uptime. Support SLA is 2 hours for critical tickets.',
            status: 'INDEXED',
            metadata: null,
            chunkCount: 2,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            chunks: [
              {
                id: 'chunk-1',
                chunkIndex: 0,
                chunkText: 'Guaranteed 99.9% uptime.',
                tokenCount: 6,
                createdAt: new Date().toISOString(),
              },
              {
                id: 'chunk-2',
                chunkIndex: 1,
                chunkText: 'Support SLA is 2 hours for critical tickets.',
                tokenCount: 9,
                createdAt: new Date().toISOString(),
              },
            ],
          },
        }),
      };
    });

    const doc = await getKnowledgeDocument(docId);

    expect(capturedUrl).toBe(`/api/knowledge/documents/${docId}`);
    expect(doc.id).toBe(docId);
    expect(doc.chunks).toHaveLength(2);
    expect(doc.chunks[0].chunkText).toContain('99.9% uptime');
  });

  it('3. createKnowledgeDocument dispatches POST request with serialized body', async () => {
    let capturedMethod = '';
    let capturedBody = '';
    let capturedUrl = '';
    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedMethod = init?.method || 'GET';
      capturedBody = init?.body as string;
      return {
        ok: true,
        status: 201,
        json: async () => ({
          success: true,
          data: {
            id: '33333333-3333-4333-8333-333333333333',
            organizationId: 'org-test',
            title: 'Shipping Guidelines',
            sourceType: 'FAQ',
            content: 'Standard delivery takes 3 to 5 business days.',
            status: 'INDEXED',
            metadata: { department: 'logistics' },
            chunkCount: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        }),
      };
    });

    const created = await createKnowledgeDocument({
      title: 'Shipping Guidelines',
      sourceType: 'FAQ',
      content: 'Standard delivery takes 3 to 5 business days.',
      metadata: { department: 'logistics' },
    });

    expect(capturedUrl).toBe('/api/knowledge/documents');
    expect(capturedMethod).toBe('POST');
    const parsedBody = JSON.parse(capturedBody);
    expect(parsedBody.title).toBe('Shipping Guidelines');
    expect(parsedBody.sourceType).toBe('FAQ');
    expect(created.id).toBe('33333333-3333-4333-8333-333333333333');
  });

  it('4. deleteKnowledgeDocument dispatches DELETE request', async () => {
    const docId = '44444444-4444-4444-8444-444444444444';
    let capturedMethod = '';
    let capturedUrl = '';
    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedMethod = init?.method || 'GET';
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: { success: true, message: 'Document and associated vector chunks deleted successfully' },
        }),
      };
    });

    const res = await deleteKnowledgeDocument(docId);

    expect(capturedUrl).toBe(`/api/knowledge/documents/${docId}`);
    expect(capturedMethod).toBe('DELETE');
    expect(res.success).toBe(true);
  });

  it('5. searchKnowledge dispatches semantic vector query with limit and minSimilarity', async () => {
    let capturedUrl = '';
    let capturedMethod = '';
    let capturedBody = '';
    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedMethod = init?.method || 'GET';
      capturedBody = init?.body as string;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            query: 'how long does shipping take?',
            totalMatched: 1,
            results: [
              {
                id: 'chunk-101',
                documentId: '33333333-3333-4333-8333-333333333333',
                chunkIndex: 0,
                chunkText: 'Standard delivery takes 3 to 5 business days.',
                tokenCount: 9,
                documentTitle: 'Shipping Guidelines',
                documentSourceType: 'FAQ',
                similarity: 0.94,
              },
            ],
          },
        }),
      };
    });

    const searchRes = await searchKnowledge('how long does shipping take?', 3, 0.85);

    expect(capturedUrl).toBe('/api/knowledge/search');
    expect(capturedMethod).toBe('POST');
    const parsedBody = JSON.parse(capturedBody);
    expect(parsedBody.query).toBe('how long does shipping take?');
    expect(parsedBody.limit).toBe(3);
    expect(parsedBody.minSimilarity).toBe(0.85);
    expect(searchRes.totalMatched).toBe(1);
    expect(searchRes.results[0].similarity).toBe(0.94);
  });

  it('6. throws helpful Error when server returns failure payload', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      return {
        ok: false,
        status: 400,
        json: async () => ({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Query must not be empty',
          },
        }),
      };
    });

    await expect(searchKnowledge('')).rejects.toThrow('Query must not be empty');
  });
});
