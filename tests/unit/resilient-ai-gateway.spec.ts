import { describe, it, expect } from 'vitest';
import {
  ResilientAiGateway,
  IAiProvider,
  AiCompletionOptions,
  AiCompletionResult,
} from '../../packages/integrations/src';

class MockFailingProvider implements IAiProvider {
  constructor(
    readonly provider: string,
    public failureCount: number = Infinity
  ) {}

  private attempts = 0;

  async generateResponse(_options: AiCompletionOptions): Promise<AiCompletionResult> {
    this.attempts += 1;
    if (this.attempts <= this.failureCount) {
      throw new Error(`${this.provider} API is down (503 Service Unavailable)`);
    }
    return {
      content: `Success from ${this.provider}`,
      model: 'test-model',
      provider: this.provider,
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
    };
  }
}

class MockHealthyProvider implements IAiProvider {
  constructor(readonly provider: string) {}

  async generateResponse(_options: AiCompletionOptions): Promise<AiCompletionResult> {
    return {
      content: `Response from ${this.provider}`,
      model: 'test-model',
      provider: this.provider,
      promptTokens: 15,
      completionTokens: 25,
      totalTokens: 40,
    };
  }
}

describe('ResilientAiGateway — Multi-Provider Failover & Circuit Breakers', () => {
  it('routes to primary provider when healthy', () => {
    const primary = new MockHealthyProvider('OPENAI');
    const secondary = new MockHealthyProvider('GROQ');
    const gateway = new ResilientAiGateway([primary, secondary]);

    return gateway.generateResponse({ messages: [] }).then((res) => {
      expect(res.provider).toBe('OPENAI');
      expect(res.content).toBe('Response from OPENAI');
    });
  });

  it('automatically falls back to secondary provider when primary fails', async () => {
    const failingPrimary = new MockFailingProvider('OPENAI', 5);
    const healthySecondary = new MockHealthyProvider('GROQ');
    const gateway = new ResilientAiGateway([failingPrimary, healthySecondary]);

    const res = await gateway.generateResponse({ messages: [] });
    expect(res.provider).toBe('GROQ');
    expect(res.content).toBe('Response from GROQ');
  });

  it('trips circuit breaker to OPEN after exceeding failure threshold', async () => {
    const failingPrimary = new MockFailingProvider('OPENAI', 10);
    const healthySecondary = new MockHealthyProvider('GROQ');
    const gateway = new ResilientAiGateway([failingPrimary, healthySecondary], {
      failureThreshold: 2,
    });

    // Attempt 1: Primary fails (failure count 1), fallback succeeds
    await gateway.generateResponse({ messages: [] });
    let circuit = gateway.getCircuitStatus('OPENAI');
    expect(circuit?.state).toBe('CLOSED');
    expect(circuit?.consecutiveFailures).toBe(1);

    // Attempt 2: Primary fails (failure count 2 >= threshold), circuit trips to OPEN
    await gateway.generateResponse({ messages: [] });
    circuit = gateway.getCircuitStatus('OPENAI');
    expect(circuit?.state).toBe('OPEN');

    // Attempt 3: Gateway skips Primary immediately and calls Secondary directly
    const res = await gateway.generateResponse({ messages: [] });
    expect(res.provider).toBe('GROQ');
  });

  it('falls back across a 3-provider cascade (OpenAI -> Groq -> OpenRouter)', async () => {
    const failOpenAi = new MockFailingProvider('OPENAI', 10);
    const failGroq = new MockFailingProvider('GROQ', 10);
    const healthyOpenRouter = new MockHealthyProvider('OPENROUTER');

    const gateway = new ResilientAiGateway([failOpenAi, failGroq, healthyOpenRouter]);
    const res = await gateway.generateResponse({ messages: [] });

    expect(res.provider).toBe('OPENROUTER');
    expect(res.content).toBe('Response from OPENROUTER');
  });
});
