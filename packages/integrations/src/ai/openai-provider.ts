import { IAiProvider, AiCompletionOptions, AiCompletionResult } from './types';

export class OpenAiProvider implements IAiProvider {
  readonly provider = 'OPENAI';

  constructor(
    private readonly apiKey?: string,
    private readonly baseUrl: string = 'https://api.openai.com/v1'
  ) {}

  async generateResponse(options: AiCompletionOptions): Promise<AiCompletionResult> {
    const key = this.apiKey || process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const model = options.model || 'gpt-4o-mini';

    const promptMessages: Array<{ role: string; content: string }> = [];

    // Prepend system instructions & policy rules
    if (options.systemInstructions) {
      let systemContent = options.systemInstructions;
      if (options.policyRules && options.policyRules.length > 0) {
        systemContent += '\n\nPOLICY & SAFETY RULES (HIGHEST PRECEDENCE):\n' +
          options.policyRules.map((r, i) => `${i + 1}. ${r}`).join('\n');
      }
      promptMessages.push({ role: 'system', content: systemContent });
    }

    // Append conversation messages
    for (const msg of options.messages) {
      promptMessages.push({
        role: msg.role,
        content: msg.content,
      });
    }

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages: promptMessages,
        temperature: options.temperature ?? 0.3,
        max_tokens: options.maxTokens ?? 1000,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI API error [${res.status}]: ${errText}`);
    }

    const data: any = await res.json();
    const choice = data.choices?.[0];
    const usage = data.usage;

    return {
      content: choice?.message?.content || '',
      model: data.model || model,
      provider: this.provider,
      promptTokens: usage?.prompt_tokens || 0,
      completionTokens: usage?.completion_tokens || 0,
      totalTokens: usage?.total_tokens || 0,
    };
  }
}
