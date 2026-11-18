import { apiRequest } from './client';

export interface KnowledgeDocumentSummary {
  id: string;
  organizationId: string;
  title: string;
  sourceType: string;
  content: string;
  status: string;
  metadata: unknown;
  chunkCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeChunk {
  id: string;
  chunkIndex: number;
  chunkText: string;
  tokenCount: number;
  createdAt: string;
}

export interface KnowledgeDocumentDetail extends KnowledgeDocumentSummary {
  chunks: KnowledgeChunk[];
}

export interface PaginatedKnowledgeDocuments {
  data: KnowledgeDocumentSummary[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
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

export interface CreateKnowledgeDocumentDto {
  title: string;
  sourceType: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export async function listKnowledgeDocuments(query?: {
  page?: number;
  limit?: number;
  search?: string;
}): Promise<PaginatedKnowledgeDocuments> {
  const params = new URLSearchParams();
  if (query?.page) params.append('page', String(query.page));
  if (query?.limit) params.append('limit', String(query.limit));
  if (query?.search) params.append('search', query.search);

  const qs = params.toString();
  return apiRequest<PaginatedKnowledgeDocuments>(`/api/knowledge/documents${qs ? `?${qs}` : ''}`);
}

export async function getKnowledgeDocument(id: string): Promise<KnowledgeDocumentDetail> {
  return apiRequest<KnowledgeDocumentDetail>(`/api/knowledge/documents/${id}`);
}

export async function createKnowledgeDocument(
  data: CreateKnowledgeDocumentDto,
): Promise<KnowledgeDocumentSummary> {
  return apiRequest<KnowledgeDocumentSummary>('/api/knowledge/documents', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteKnowledgeDocument(
  id: string,
): Promise<{ success: boolean; message: string }> {
  return apiRequest<{ success: boolean; message: string }>(`/api/knowledge/documents/${id}`, {
    method: 'DELETE',
  });
}

export async function searchKnowledge(
  query: string,
  limit = 5,
  minSimilarity = 0.7,
): Promise<KnowledgeSearchResult> {
  return apiRequest<KnowledgeSearchResult>('/api/knowledge/search', {
    method: 'POST',
    body: JSON.stringify({ query, limit, minSimilarity }),
  });
}
