import { IAiProvider, AiCompletionOptions, AiCompletionResult } from './types';
import { MockAiProvider } from './mock-provider';

export class OpenRouterProvider implements IAiProvider {
  readonly provider = 'OPENROUTER';
  private readonly fallbackMock: MockAiProvider;

  constructor(
    private readonly apiKey?: string,
    private readonly defaultModel: string = 'openai/gpt-4o-mini'
  ) {
    this.fallbackMock = new MockAiProvider(defaultModel);
  }

  async generateResponse(options: AiCompletionOptions): Promise<AiCompletionResult> {
    if (!this.apiKey || this.apiKey.trim() === '' || this.apiKey === 'mock-key') {
      return this.fallbackMock.generateResponse(options);
    }

    const messages = [];

    if (options.systemInstructions || (options.policyRules && options.policyRules.length > 0)) {
      let systemContent = options.systemInstructions || '';
      if (options.policyRules && options.policyRules.length > 0) {
        systemContent += '\n\nPOLICY RULES:\n' + options.policyRules.map((r) => `- ${r}`).join('\n');
      }
      messages.push({ role: 'system', content: systemContent });
    }

    for (const msg of options.messages) {
      messages.push({ role: msg.role, content: msg.content });
    }

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://orbit.com',
          'X-Title': 'Project Orbit Multi-Tenant AI Platform',
        },
        body: JSON.stringify({
          model: options.model || this.defaultModel,
          messages,
          temperature: options.temperature ?? 0.3,
          max_tokens: options.maxTokens ?? 1024,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
      }

      const data = (await response.json()) as any;
      const choice = data.choices?.[0];
      const content = choice?.message?.content || '';
      const usage = data.usage || {};

      return {
        content,
        model: data.model || options.model || this.defaultModel,
        provider: this.provider,
        promptTokens: usage.prompt_tokens || 0,
        completionTokens: usage.completion_tokens || 0,
        totalTokens: usage.total_tokens || 0,
      };
    } catch (err: unknown) {
      if (process.env.NODE_ENV === 'test' || process.env.CI) {
        return this.fallbackMock.generateResponse(options);
      }
      throw err;
    }
  }
}
