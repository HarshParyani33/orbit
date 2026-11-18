/**
 * Project Orbit — Deterministic Citation & Extractive Fact Verification
 * Conforms strictly to docs/ARCHITECTURE.md Section 9
 */

export interface GroundingSourceChunk {
  id: string;
  chunkText: string;
  documentTitle?: string;
}

export type GroundingViolationReason =
  | 'NONE'
  | 'INVALID_CITATION_ID'
  | 'UNGROUNDED_ENTITY'
  | 'CONTRADICTORY_EVIDENCE';

export interface CitationValidationResult {
  isValid: boolean;
  citedChunkIds: string[];
  violationReason: GroundingViolationReason;
  errorDetails?: string;
}

export class CitationValidator {
  private static readonly CITATION_REGEX = /\[Source:\s*([a-zA-Z0-9_-]+)\]/gi;

  /**
   * Extracts all cited source IDs from the candidate answer.
   */
  public static extractCitations(text: string): string[] {
    const citations: string[] = [];
    let match: RegExpExecArray | null;
    const regex = new RegExp(this.CITATION_REGEX.source, 'gi');

    while ((match = regex.exec(text)) !== null) {
      if (match[1] && !citations.includes(match[1])) {
        citations.push(match[1]);
      }
    }

    return citations;
  }

  /**
   * Deterministically validates:
   * 1. Source existence: every cited ID must exist in the retrieved chunk map.
   * 2. Extractive fact verification: numbers, prices, and durations must exist in cited source text.
   */
  public static validate(
    candidateText: string,
    retrievedChunkMap: Map<string, GroundingSourceChunk>,
  ): CitationValidationResult {
    const citedIds = this.extractCitations(candidateText);

    // Rule 1: Every cited ID must exist in retrieved chunks
    for (const citedId of citedIds) {
      if (!retrievedChunkMap.has(citedId)) {
        return {
          isValid: false,
          citedChunkIds: citedIds,
          violationReason: 'INVALID_CITATION_ID',
          errorDetails: `Candidate answer cited nonexistent or fabricated chunk ID: ${citedId}`,
        };
      }
    }

    // If citations are present, assemble cited corpus for extractive fact check
    if (citedIds.length > 0) {
      const citedCorpus = citedIds
        .map((id) => retrievedChunkMap.get(id)?.chunkText || '')
        .join(' ')
        .toLowerCase();

      // Extract facts: prices, numeric durations, percentages
      const factPatterns = [
        /\$\d+(?:\.\d+)?(?:\/(?:mo|month|year))?/gi, // e.g. $29, $99, $29/mo
        /\b\d+\s*(?:minutes?|hours?|days?|weeks?|months?|years?)\b/gi, // e.g. 15 minutes, 30 days
        /\b\d+%\b/gi, // e.g. 100%, 10%
      ];

      for (const pattern of factPatterns) {
        let match: RegExpExecArray | null;
        const regex = new RegExp(pattern.source, 'gi');

        while ((match = regex.exec(candidateText)) !== null) {
          const entity = match[0].trim().toLowerCase();
          // Verify that this extracted fact entity exists in the cited source corpus
          if (!citedCorpus.includes(entity)) {
            return {
              isValid: false,
              citedChunkIds: citedIds,
              violationReason: 'UNGROUNDED_ENTITY',
              errorDetails: `Candidate answer hallucinated factual entity "${match[0]}" not found in cited sources`,
            };
          }
        }
      }
    }

    return {
      isValid: true,
      citedChunkIds: citedIds,
      violationReason: 'NONE',
    };
  }
}
