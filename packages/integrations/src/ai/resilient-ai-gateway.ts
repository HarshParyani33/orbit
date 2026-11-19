import { IAiProvider, AiCompletionOptions, AiCompletionResult } from './types';

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface ProviderCircuitState {
  state: CircuitBreakerState;
  consecutiveFailures: number;
  lastFailureTime: number;
  lastSuccessTime: number;
}

export interface ResilientGatewayConfig {
  failureThreshold?: number; // Failures before tripping (default: 3)
  resetTimeoutMs?: number;   // Time before probing half-open (default: 60000ms)
  timeoutMs?: number;        // Max latency per attempt (default: 8000ms)
}

export class ResilientAiGateway implements IAiProvider {
  readonly provider = 'RESILIENT_GATEWAY';
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly timeoutMs: number;

  private readonly circuits = new Map<string, ProviderCircuitState>();

  constructor(
    private readonly providers: IAiProvider[],
    config?: ResilientGatewayConfig
  ) {
    if (!providers || providers.length === 0) {
      throw new Error('[ResilientAiGateway] Must configure at least one provider');
    }
    this.failureThreshold = config?.failureThreshold ?? 3;
    this.resetTimeoutMs = config?.resetTimeoutMs ?? 60000;
    this.timeoutMs = config?.timeoutMs ?? 8000;

    for (const p of providers) {
      this.circuits.set(p.provider, {
        state: 'CLOSED',
        consecutiveFailures: 0,
        lastFailureTime: 0,
        lastSuccessTime: 0,
      });
    }
  }

  public getCircuitStatus(providerName: string): ProviderCircuitState | undefined {
    return this.circuits.get(providerName);
  }

  public getAllCircuits(): Map<string, ProviderCircuitState> {
    return new Map(this.circuits);
  }

  public resetCircuit(providerName: string): void {
    const circuit = this.circuits.get(providerName);
    if (circuit) {
      circuit.state = 'CLOSED';
      circuit.consecutiveFailures = 0;
    }
  }

  public tripCircuit(providerName: string): void {
    const circuit = this.circuits.get(providerName);
    if (circuit) {
      circuit.state = 'OPEN';
      circuit.consecutiveFailures = this.failureThreshold;
      circuit.lastFailureTime = Date.now();
    }
  }

  async generateResponse(options: AiCompletionOptions): Promise<AiCompletionResult> {
    const errors: Array<{ provider: string; error: string }> = [];

    for (const provider of this.providers) {
      const circuit = this.circuits.get(provider.provider)!;
      const now = Date.now();

      // Check if breaker should transition from OPEN to HALF_OPEN
      if (circuit.state === 'OPEN' && now - circuit.lastFailureTime > this.resetTimeoutMs) {
        circuit.state = 'HALF_OPEN';
      }

      // If circuit is OPEN, skip this provider and attempt next fallback
      if (circuit.state === 'OPEN') {
        errors.push({
          provider: provider.provider,
          error: `Circuit breaker is OPEN (tripped at ${new Date(circuit.lastFailureTime).toISOString()})`,
        });
        continue;
      }

      try {
        const result = await this.executeWithTimeout(
          provider.generateResponse(options),
          this.timeoutMs
        );

        // Success: Reset circuit state
        circuit.state = 'CLOSED';
        circuit.consecutiveFailures = 0;
        circuit.lastSuccessTime = Date.now();

        return result;
      } catch (err: any) {
        circuit.consecutiveFailures += 1;
        circuit.lastFailureTime = Date.now();

        if (circuit.consecutiveFailures >= this.failureThreshold || circuit.state === 'HALF_OPEN') {
          circuit.state = 'OPEN';
        }

        errors.push({
          provider: provider.provider,
          error: err.message || String(err),
        });
      }
    }

    // All configured providers failed
    const errorDetails = errors.map((e) => `[${e.provider}: ${e.error}]`).join(', ');
    throw new Error(`All AI Gateway providers exhausted: ${errorDetails}`);
  }

  private executeWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Provider call timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      promise
        .then((res) => {
          clearTimeout(timer);
          resolve(res);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }
}
