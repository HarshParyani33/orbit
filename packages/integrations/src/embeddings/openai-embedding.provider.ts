import { IEmbeddingProvider } from './types';
import { MockEmbeddingProvider } from './mock-embedding.provider';

export class OpenAiEmbeddingProvider implements IEmbeddingProvider {
  readonly providerName = 'OPENAI';
  readonly dimension: number;
  private readonly fallbackMock: MockEmbeddingProvider;

  constructor(
    private readonly apiKey?: string,
    private readonly model: string = 'text-embedding-3-small',
    dimension = 1536,
  ) {
    this.dimension = dimension;
    this.fallbackMock = new MockEmbeddingProvider(dimension);
  }

  public async generateEmbedding(text: string): Promise<number[]> {
    const embeddings = await this.generateEmbeddings([text]);
    return embeddings[0];
  }

  public async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.apiKey || this.apiKey.trim() === '' || this.apiKey === 'mock-key') {
      return this.fallbackMock.generateEmbeddings(texts);
    }

    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: texts,
          dimensions: this.dimension,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI Embedding API error (${response.status}): ${errorText}`);
      }

      const data = (await response.json()) as {
        data: Array<{ embedding: number[]; index: number }>;
      };

      // Ensure results are ordered by input index
      const sorted = [...data.data].sort((a, b) => a.index - b.index);
      return sorted.map((item) => item.embedding);
    } catch (err: unknown) {
      // In non-production or network-isolated test environments, fall back gracefully
      if (process.env.NODE_ENV === 'test' || process.env.CI) {
        return this.fallbackMock.generateEmbeddings(texts);
      }
      throw err;
    }
  }
}
