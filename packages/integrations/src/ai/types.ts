/**
 * Project Orbit — AI Provider Abstraction Contracts
 * Conforms to docs/ARCHITECTURE.md Section 8
 */

export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiCompletionOptions {
  messages: AiMessage[];
  systemInstructions?: string;
  policyRules?: string[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AiCompletionResult {
  content: string;
  model: string;
  provider: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface IAiProvider {
  readonly provider: string;
  generateResponse(options: AiCompletionOptions): Promise<AiCompletionResult>;
}
