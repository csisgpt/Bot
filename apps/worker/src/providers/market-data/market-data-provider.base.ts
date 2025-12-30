import { MarketDataProviderHealth } from './market-data-provider.interface';

export abstract class MarketDataProviderBase {
  protected readonly health: MarketDataProviderHealth;

  protected constructor(provider: string) {
    this.health = {
      provider,
      lastSuccessAt: null,
      lastError: null,
      lastLatencyMs: null,
    };
  }

  protected recordSuccess(latencyMs: number): void {
    this.health.lastSuccessAt = Date.now();
    this.health.lastLatencyMs = latencyMs;
    this.health.lastError = null;
  }

  protected recordError(error: unknown): void {
    const message = error instanceof Error ? error.message : 'Unknown error';
    this.health.lastError = message;
  }

  getHealth(): MarketDataProviderHealth {
    return { ...this.health };
  }
}
