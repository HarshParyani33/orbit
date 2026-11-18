/**
 * Project Orbit — Embedding Provider & Chunking Contracts
 * Conforms to docs/ARCHITECTURE.md Section 9 and Milestone 4 Decisions
 */

export interface ChunkOptions {
  maxChunkSize?: number; // Approximate character length (default: 1500 chars ~ 375 tokens)
  chunkOverlap?: number;  // Character overlap between chunks (default: 200 chars ~ 50 tokens)
}

export interface ChunkResult {
  chunkIndex: number;
  chunkText: string;
  tokenCount: number;
}

export interface IEmbeddingProvider {
  readonly providerName: string;
  readonly dimension: number;

  generateEmbedding(text: string): Promise<number[]>;
  generateEmbeddings(texts: string[]): Promise<number[][]>;
}
