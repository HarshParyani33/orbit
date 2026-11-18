import { IAiProvider, AiCompletionOptions, AiCompletionResult } from './types';

export class MockAiProvider implements IAiProvider {
  readonly provider = 'MOCK';

  constructor(
    private readonly defaultModel: string = 'gpt-4o-mini',
    private readonly fixedResponse?: string
  ) {}

  async generateResponse(options: AiCompletionOptions): Promise<AiCompletionResult> {
    const model = options.model || this.defaultModel;

    // Simulate token calculation
    const inputChars = options.messages.reduce((acc, m) => acc + m.content.length, 0);
    const promptTokens = Math.max(1, Math.ceil(inputChars / 4));

    let content: string;
    if (this.fixedResponse) {
      content = this.fixedResponse;
    } else {
      const lastUserMsg = [...options.messages].reverse().find((m) => m.role === 'user');
      const query = lastUserMsg?.content || 'Hello';

      if (query.toLowerCase().includes('hours') || query.toLowerCase().includes('open')) {
        content = 'Our business hours are Monday through Friday, 9:00 AM to 6:00 PM EST.';
      } else if (query.toLowerCase().includes('refund') || query.toLowerCase().includes('return')) {
        content = 'We offer a full 30-day money-back guarantee. You can initiate a return directly from your dashboard.';
      } else if (query.toLowerCase().includes('discount') || query.toLowerCase().includes('promo')) {
        content = 'Thank you for your interest! We currently have a 10% welcome discount for new subscribers.';
      } else {
        content = `Thank you for reaching out! In response to your inquiry regarding "${query.slice(0, 30)}", our team is ready to assist you. How else may I help today?`;
      }
    }

    const completionTokens = Math.max(1, Math.ceil(content.length / 4));

    return {
      content,
      model,
      provider: this.provider,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    };
  }
}
