import { ChunkOptions, ChunkResult } from './types';

export class ChunkingEngine {
  private static readonly DEFAULT_MAX_CHUNK_SIZE = 1500;
  private static readonly DEFAULT_CHUNK_OVERLAP = 200;

  /**
   * Chunks arbitrary text into coherent semantically bounded segments.
   */
  public static chunkText(text: string, options?: ChunkOptions): ChunkResult[] {
    const trimmed = text.trim();
    if (!trimmed) {
      return [];
    }

    const maxSize = options?.maxChunkSize ?? this.DEFAULT_MAX_CHUNK_SIZE;
    const overlap = options?.chunkOverlap ?? this.DEFAULT_CHUNK_OVERLAP;

    if (trimmed.length <= maxSize) {
      return [
        {
          chunkIndex: 0,
          chunkText: trimmed,
          tokenCount: Math.max(1, Math.ceil(trimmed.length / 4)),
        },
      ];
    }

    // Split text into paragraphs first
    const paragraphs = trimmed.split(/\n\s*\n/);
    const chunks: string[] = [];
    let currentChunk = '';

    for (const para of paragraphs) {
      const cleanPara = para.trim();
      if (!cleanPara) continue;

      if (!currentChunk) {
        if (cleanPara.length <= maxSize) {
          currentChunk = cleanPara;
        } else {
          // Paragraph itself is larger than maxSize, split by sentences
          const sentenceChunks = this.splitBySentences(cleanPara, maxSize, overlap);
          chunks.push(...sentenceChunks);
        }
      } else if (currentChunk.length + cleanPara.length + 2 <= maxSize) {
        currentChunk += '\n\n' + cleanPara;
      } else {
        chunks.push(currentChunk);
        // Start next chunk with overlap if possible
        const tail = currentChunk.slice(Math.max(0, currentChunk.length - overlap));
        currentChunk = tail ? tail + '\n\n' + cleanPara : cleanPara;
        if (currentChunk.length > maxSize) {
          const sentenceChunks = this.splitBySentences(currentChunk, maxSize, overlap);
          if (sentenceChunks.length > 0) {
            currentChunk = sentenceChunks.pop()!;
            chunks.push(...sentenceChunks);
          }
        }
      }
    }

    if (currentChunk && currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks.map((chunkText, index) => ({
      chunkIndex: index,
      chunkText,
      tokenCount: Math.max(1, Math.ceil(chunkText.length / 4)),
    }));
  }

  private static splitBySentences(text: string, maxSize: number, overlap: number): string[] {
    const sentences = text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [text];
    const results: string[] = [];
    let current = '';

    for (const sent of sentences) {
      const cleanSent = sent.trim();
      if (!cleanSent) continue;

      if (!current) {
        if (cleanSent.length <= maxSize) {
          current = cleanSent;
        } else {
          // Fallback: split long sentences by character slices
          let start = 0;
          while (start < cleanSent.length) {
            const end = Math.min(start + maxSize, cleanSent.length);
            results.push(cleanSent.slice(start, end));
            if (end === cleanSent.length) break;
            start += maxSize - overlap;
          }
        }
      } else if (current.length + cleanSent.length + 1 <= maxSize) {
        current += ' ' + cleanSent;
      } else {
        results.push(current);
        const tail = current.slice(Math.max(0, current.length - overlap));
        current = tail ? tail + ' ' + cleanSent : cleanSent;
      }
    }

    if (current && current.trim()) {
      results.push(current.trim());
    }

    return results;
  }
}
