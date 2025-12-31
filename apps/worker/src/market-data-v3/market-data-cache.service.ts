import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService, RedisService } from '@libs/core';
import { InstrumentMapping, ProviderRegistryService, Ticker } from '@libs/market-data';

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
  private readonly logger = new Logger(MarketDataCacheService.name);
  private readonly ttlSeconds: number;

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly providerRegistry: ProviderRegistryService,
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

  async getTickersCached(params: {
    provider: string;
    symbols: string[];
  }): Promise<CachedTicker[]> {
    const { provider, symbols } = params;
    const entries = await this.getTickers(provider, symbols);
    return Array.from(entries.values());
  }

  async warmCache(params: { provider: string; instruments: InstrumentMapping[] }): Promise<void> {
    const { provider, instruments } = params;
    if (!instruments.length) return;
    const instance = this.providerRegistry.getProviderByName(provider);
    if (!instance) {
      this.logger.warn(
        JSON.stringify({ event: 'cache_warm_provider_missing', provider }),
      );
      return;
    }
    try {
      const tickers = await instance.fetchTickers(instruments);
      await Promise.all(
        tickers.map((ticker) =>
          this.setTicker(ticker.provider, ticker.canonicalSymbol, this.toCachedTicker(ticker)),
        ),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(
        JSON.stringify({ event: 'cache_warm_failed', provider, message }),
      );
    }
  }

  aggregateBestPrices(params: {
    symbols: string[];
    providerTickers: Map<string, CachedTicker[]>;
  }): Array<{ symbol: string; entries: Array<{ provider: string; price: number }>; spreadPct?: number | null }> {
    const { symbols, providerTickers } = params;
    return symbols.map((symbol) => {
      const normalized = this.normalizeSymbol(symbol);
      const entries: Array<{ provider: string; price: number }> = [];
      for (const [provider, tickers] of providerTickers.entries()) {
        const match = tickers.find(
          (ticker) => this.normalizeSymbol(ticker.symbol) === normalized,
        );
        if (!match) continue;
        const price = this.resolvePrice(match);
        if (price === null) continue;
        entries.push({ provider, price });
      }
      let spreadPct: number | null = null;
      if (entries.length > 1) {
        const prices = entries.map((entry) => entry.price);
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        spreadPct = min > 0 ? ((max - min) / min) * 100 : null;
      }
      return { symbol: normalized, entries, spreadPct };
    });
  }

  async fetchNews(params: { providers: string[]; maxItems?: number }): Promise<Array<{ title: string; url: string; provider: string; tags?: string[] }>> {
    const { providers, maxItems = 10 } = params;
    if (!providers.length) return [];
    const items = await this.prismaService.news.findMany({
      where: { provider: { in: providers } },
      orderBy: { ts: 'desc' },
      take: maxItems,
    });
    return items.map((item) => ({
      title: item.title,
      url: item.url,
      provider: item.provider,
      tags: item.tags ?? [],
    }));
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

  private resolvePrice(ticker: CachedTicker): number | null {
    if (Number.isFinite(ticker.last ?? NaN)) {
      return ticker.last as number;
    }
    const bid = ticker.bid ?? null;
    const ask = ticker.ask ?? null;
    if (Number.isFinite(bid ?? NaN) && Number.isFinite(ask ?? NaN)) {
      return ((bid as number) + (ask as number)) / 2;
    }
    if (Number.isFinite(bid ?? NaN)) return bid as number;
    if (Number.isFinite(ask ?? NaN)) return ask as number;
    return null;
  }

  private toCachedTicker(ticker: Ticker): CachedTicker {
    return {
      provider: ticker.provider,
      symbol: ticker.canonicalSymbol,
      bid: ticker.bid ?? null,
      ask: ticker.ask ?? null,
      last: ticker.last ?? null,
      ts: ticker.ts,
    };
  }
}
