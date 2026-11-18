import { IEmbeddingProvider } from './types';

export class MockEmbeddingProvider implements IEmbeddingProvider {
  readonly providerName = 'MOCK_EMBEDDING';
  readonly dimension: number;

  constructor(dimension = 1536) {
    this.dimension = dimension;
  }

  public async generateEmbedding(text: string): Promise<number[]> {
    return this.computeVector(text);
  }

  public async generateEmbeddings(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.computeVector(t));
  }

  private computeVector(text: string): number[] {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = (hash << 5) - hash + text.charCodeAt(i);
      hash |= 0;
    }

    const vector: number[] = [];
    let sumSq = 0;
    const seed = Math.abs(hash) + 1;

    for (let i = 0; i < this.dimension; i++) {
      const val = Math.sin(i * seed + 1);
      vector.push(val);
      sumSq += val * val;
    }

    const norm = Math.sqrt(sumSq) || 1;
    // Normalize to unit vector
    return vector.map((v) => Number((v / norm).toFixed(6)));
  }
}
