import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '@libs/core';

export interface CachedTicker {
  provider: string;
  symbol: string;
  bid: number | null;
  ask: number | null;
  last: number | null;
  ts: number;
}

@Injectable()
export class MarketDataCacheService {
  private readonly ttlSeconds: number;

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    this.ttlSeconds = this.configService.get<number>('MARKET_DATA_TICKER_TTL_SECONDS', 120);
  }

  async setTicker(provider: string, symbol: string, ticker: CachedTicker): Promise<void> {
    const key = this.buildKey(provider, symbol);
    await this.redisService.set(key, JSON.stringify(ticker), 'EX', this.ttlSeconds);
  }

  async getTicker(provider: string, symbol: string): Promise<CachedTicker | null> {
    const key = this.buildKey(provider, symbol);
    const raw = await this.redisService.get(key);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as CachedTicker;
    } catch (error) {
      return null;
    }
  }

  async getTickers(provider: string, symbols: string[]): Promise<Map<string, CachedTicker>> {
    if (!symbols.length) {
      return new Map();
    }
    const keys = symbols.map((symbol) => this.buildKey(provider, symbol));
    const results = await this.redisService.mget(keys);
    const entries = new Map<string, CachedTicker>();
    results.forEach((raw, index) => {
      if (!raw) {
        return;
      }
      try {
        const parsed = JSON.parse(raw) as CachedTicker;
        entries.set(this.normalizeSymbol(symbols[index]), parsed);
      } catch (error) {
        return;
      }
    });
    return entries;
  }

  async getBestAcrossProviders(
    symbol: string,
    providers: string[],
  ): Promise<{ provider: string; ticker: CachedTicker } | null> {
    if (!providers.length) {
      return null;
    }
    const normalizedSymbol = this.normalizeSymbol(symbol);
    const results = await Promise.all(
      providers.map(async (provider) => ({
        provider,
        ticker: await this.getTicker(provider, normalizedSymbol),
      })),
    );
    const candidates = results.filter(
      (result): result is { provider: string; ticker: CachedTicker } => Boolean(result.ticker),
    );
    if (!candidates.length) {
      return null;
    }
    return candidates.reduce((best, current) =>
      (current.ticker.last ?? 0) > (best.ticker.last ?? 0) ? current : best,
    );
  }

  private buildKey(provider: string, symbol: string): string {
    return `md:ticker:${provider.toLowerCase()}:${this.normalizeSymbol(symbol)}`;
  }

  private normalizeSymbol(symbol: string): string {
    return symbol.trim().toUpperCase();
  }
}
