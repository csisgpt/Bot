import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService, RedisService } from '@libs/core';
import {
  InstrumentRegistryService,
  ProviderRegistryService,
  MarketDataProvider,
  Candle,
  Ticker,
  InstrumentMapping,
  normalizeCanonicalSymbol,
  splitCanonicalSymbol,
} from '@libs/market-data';
import { Queue } from 'bullmq';
import { MARKET_DATA_QUEUE_NAME } from '@libs/core';
import { InjectQueue } from '@nestjs/bullmq';
import { ActiveSymbolsService } from './active-symbols.service';
import { Prisma } from '@prisma/client';
import { MarketDataCacheService } from './market-data-cache.service';

@Injectable()
export class MarketDataIngestService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MarketDataIngestService.name);
  private readonly enabled: boolean;
  private readonly ttlSeconds: number;
  private readonly timeframes: string[];
  private readonly legacyCandleCompatEnabled: boolean;
  private readonly providerListeners = new Map<string, () => void>();
  private readonly restPollIntervalMs: number;
  private readonly restPollMaxBackoffMs: number;
  private readonly restPollConcurrency: number;
  private readonly restTickerBatchSize: number;
  private readonly restTickerBatchConcurrency: number;
  private readonly restPollTimers = new Map<string, NodeJS.Timeout>();
  private readonly restPollLogged = new Set<string>();
  private readonly restPollFailures = new Map<string, number>();
  private readonly restPollInFlight = new Set<string>();
  private restPollStopped = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
    private readonly marketDataCache: MarketDataCacheService,
    private readonly instrumentRegistry: InstrumentRegistryService,
    private readonly providerRegistry: ProviderRegistryService,
    private readonly activeSymbolsService: ActiveSymbolsService,
    @InjectQueue(MARKET_DATA_QUEUE_NAME)
    private readonly marketDataQueue: Queue,
  ) {
    this.enabled = this.configService.get<boolean>('MARKET_DATA_INGEST_ENABLED', true);
    this.ttlSeconds = this.configService.get<number>('MARKET_DATA_TICKER_TTL_SECONDS', 120);
    this.timeframes = this.configService.get<string[]>('MARKET_DATA_TIMEFRAMES', ['1m']);
    this.legacyCandleCompatEnabled = this.configService.get<boolean>(
      'LEGACY_CANDLE_COMPAT_ENABLED',
      true,
    );
    this.restPollIntervalMs =
      this.configService.get<number>('MARKET_DATA_REST_POLL_INTERVAL_SECONDS', 30) * 1000;
    this.restPollMaxBackoffMs = Math.max(this.restPollIntervalMs * 4, 120_000);
    this.restPollConcurrency = this.configService.get<number>(
      'MARKET_DATA_REST_POLL_CONCURRENCY',
      2,
    );
    this.restTickerBatchSize = this.configService.get<number>(
      'MARKET_DATA_REST_TICKER_BATCH_SIZE',
      10,
    );
    this.restTickerBatchConcurrency = this.configService.get<number>(
      'MARKET_DATA_REST_TICKER_BATCH_CONCURRENCY',
      2,
    );
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      this.logger.log('اینجست بازار چندمنبعی غیرفعال است');
      return;
    }

    const symbols = await this.activeSymbolsService.resolveActiveSymbols();
    this.instrumentRegistry.setActiveSymbols(symbols);
    const providers = this.providerRegistry.getEnabledProviders();
    const wsEnabled = new Set(
      this.providerRegistry.getWsEnabledProviders().map((provider) => provider.provider),
    );
    const instruments = this.instrumentRegistry.getInstruments();

    await this.providerRegistry.startAll();

    for (const provider of providers) {
      const mappings = this.instrumentRegistry.getMappingsForProvider(provider.provider);
      if (!mappings.length) {
        continue;
      }
      this.logger.log(
        JSON.stringify({
          event: 'provider_subscribe',
          provider: provider.provider,
          symbols: mappings.length,
          timeframes: this.timeframes.length,
        }),
      );
      provider.on('ticker', (ticker: Ticker) => void this.handleTicker(ticker));
      provider.on('candle', (candle: Candle) => void this.handleCandle(candle));
      this.providerListeners.set(provider.provider, () => {
        provider.removeAllListeners('ticker');
        provider.removeAllListeners('candle');
      });

      await provider.subscribeTickers(mappings);
      await provider.subscribeCandles(mappings, this.timeframes);

      this.scheduleRestPolling(provider, mappings, this.timeframes, wsEnabled.has(provider.provider));
    }

    if (!providers.length || !instruments.length) {
      this.logger.warn('هیچ ارائه‌دهنده یا نمادی برای بازار چندمنبعی فعال نیست');
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.restPollStopped = true;
    for (const cleanup of this.providerListeners.values()) {
      cleanup();
    }
    for (const timer of this.restPollTimers.values()) {
      clearTimeout(timer);
    }
    await this.providerRegistry.stopAll();
  }

  private async handleTicker(ticker: Ticker): Promise<void> {
    const tickerKey = `latest:ticker:${ticker.canonicalSymbol}:${ticker.provider}`;
    const bookKey = `latest:book:${ticker.canonicalSymbol}:${ticker.provider}`;
    const payload = JSON.stringify({
      provider: ticker.provider,
      canonicalSymbol: ticker.canonicalSymbol,
      ts: ticker.ts,
      last: ticker.last,
      bid: ticker.bid,
      ask: ticker.ask,
      volume24h: ticker.volume24h,
    });

    await this.redisService.set(tickerKey, payload, 'EX', this.ttlSeconds);
    await this.redisService.set(bookKey, payload, 'EX', this.ttlSeconds);
    await this.marketDataCache.setTicker(ticker.provider, ticker.canonicalSymbol, {
      provider: ticker.provider,
      symbol: ticker.canonicalSymbol,
      bid: ticker.bid ?? null,
      ask: ticker.ask ?? null,
      last: ticker.last ?? null,
      ts: ticker.ts,
    });
  }

  private async handleCandle(candle: Candle): Promise<void> {
    if (!candle.isFinal) {
      return;
    }
    const assetType = this.inferAssetType(candle.canonicalSymbol);
    await this.prismaService.marketCandle.upsert({
      where: {
        provider_canonicalSymbol_timeframe_openTime: {
          provider: candle.provider,
          canonicalSymbol: candle.canonicalSymbol,
          timeframe: candle.timeframe,
          openTime: new Date(candle.openTime),
        },
      },
      update: {
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
        isFinal: candle.isFinal,
        rawPayload: candle as unknown as Prisma.InputJsonValue,
      },
      create: {
        provider: candle.provider,
        canonicalSymbol: candle.canonicalSymbol,
        timeframe: candle.timeframe,
        openTime: new Date(candle.openTime),
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
        isFinal: candle.isFinal,
        rawPayload: candle as unknown as Prisma.InputJsonValue,
      },
    });

    if (this.legacyCandleCompatEnabled && candle.provider === 'binance') {
      await this.prismaService.candle.upsert({
        where: {
          source_instrument_timeframe_time: {
            source: 'BINANCE',
            instrument: candle.canonicalSymbol,
            timeframe: candle.timeframe,
            time: new Date(candle.openTime),
          },
        },
        update: {
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume,
          rawPayload: candle as unknown as Prisma.InputJsonValue,
        },
        create: {
          source: 'BINANCE',
          assetType,
          instrument: candle.canonicalSymbol,
          timeframe: candle.timeframe,
          time: new Date(candle.openTime),
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume,
          rawPayload: candle as unknown as Prisma.InputJsonValue,
        },
      });
    }

    await this.marketDataQueue.add('candle.close', candle, {
      removeOnComplete: true,
      attempts: 3,
      backoff: { type: 'exponential', delay: 500 },
    });
  }

  private scheduleRestPolling(
    provider: MarketDataProvider,
    mappings: InstrumentMapping[],
    timeframes: string[],
    wsEnabled: boolean,
  ): void {
    if (this.restPollTimers.has(provider.provider)) {
      return;
    }

    const scheduleNext = (delayMs: number) => {
      if (this.restPollStopped) {
        return;
      }
      const existing = this.restPollTimers.get(provider.provider);
      if (existing) {
        clearTimeout(existing);
      }
      const timer = setTimeout(() => {
        void poll();
      }, delayMs);
      this.restPollTimers.set(provider.provider, timer);
    };

    const poll = async () => {
      if (this.restPollStopped) {
        return;
      }
      this.restPollTimers.delete(provider.provider);
      if (this.restPollInFlight.has(provider.provider)) {
        return;
      }
      this.restPollInFlight.add(provider.provider);
      let hadError = false;
      const snapshot = provider.getSnapshot();
      if (provider.supportsWebsocket && wsEnabled && snapshot.connected) {
        this.restPollInFlight.delete(provider.provider);
        scheduleNext(this.restPollIntervalMs);
        return;
      }

      if (!this.restPollLogged.has(provider.provider)) {
        this.restPollLogged.add(provider.provider);
        this.logger.warn(
          JSON.stringify({ event: 'rest_poll_started', provider: provider.provider }),
        );
      }

      try {
        const tickers = await this.fetchTickersInBatches(provider, mappings);
        for (const ticker of tickers) {
          await this.handleTicker(ticker);
        }
      } catch (error) {
        hadError = true;
        const message = error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(
          JSON.stringify({ event: 'rest_poll_error', provider: provider.provider, message }),
        );
      }

      const tasks: Array<() => Promise<void>> = [];
      for (const mapping of mappings) {
        for (const timeframe of timeframes) {
          tasks.push(async () => {
            try {
              const candles = await provider.fetchCandles(mapping, timeframe, 2);
              for (const candle of candles) {
                await this.handleCandle(candle);
              }
            } catch (error) {
              hadError = true;
              const message = error instanceof Error ? error.message : 'Unknown error';
              this.logger.warn(
                JSON.stringify({
                  event: 'rest_poll_error',
                  provider: provider.provider,
                  symbol: mapping.canonicalSymbol,
                  timeframe,
                  message,
                }),
              );
            }
          });
        }
      }

      await this.runWithConcurrency(tasks, this.restPollConcurrency);

      if (hadError) {
        const failures = (this.restPollFailures.get(provider.provider) ?? 0) + 1;
        this.restPollFailures.set(provider.provider, failures);
        const delayMs = Math.min(
          this.restPollIntervalMs * 2 ** failures,
          this.restPollMaxBackoffMs,
        );
        this.restPollInFlight.delete(provider.provider);
        scheduleNext(delayMs);
        return;
      }

      this.restPollFailures.set(provider.provider, 0);
      this.restPollInFlight.delete(provider.provider);
      scheduleNext(this.restPollIntervalMs);
    };

    void poll();
  }

  private async runWithConcurrency(
    tasks: Array<() => Promise<void>>,
    limit: number,
  ): Promise<void> {
    const queue = [...tasks];
    const workers = Array.from({ length: Math.max(1, limit) }, async () => {
      while (queue.length) {
        const task = queue.shift();
        if (!task) {
          return;
        }
        await task();
      }
    });
    await Promise.all(workers);
  }

  private async fetchTickersInBatches(
    provider: MarketDataProvider,
    mappings: InstrumentMapping[],
  ): Promise<Ticker[]> {
    if (!mappings.length) {
      return [];
    }
    const batchSize = Math.max(1, this.restTickerBatchSize);
    const batches: InstrumentMapping[][] = [];
    for (let i = 0; i < mappings.length; i += batchSize) {
      batches.push(mappings.slice(i, i + batchSize));
    }

    const results: Ticker[] = [];
    const tasks = batches.map(
      (batch) => async () => {
        const tickers = await provider.fetchTickers(batch);
        results.push(...tickers);
      },
    );
    await this.runWithConcurrency(tasks, Math.max(1, this.restTickerBatchConcurrency));
    return results;
  }

  private inferAssetType(symbol: string): string {
    const normalized = normalizeCanonicalSymbol(symbol);
    if (normalized === 'XAUTUSDT' || normalized === 'PAXGUSDT') {
      return 'GOLD';
    }
    const parts = splitCanonicalSymbol(normalized);
    if (!parts) {
      return 'CRYPTO';
    }
    const fiatAssets = new Set([
      'USD',
      'EUR',
      'GBP',
      'JPY',
      'CHF',
      'AUD',
      'CAD',
      'TRY',
      'AED',
      'IRR',
      'IRT',
    ]);
    const commodityBases = new Set(['XAU', 'XAG', 'XPT', 'XPD']);
    if (parts.quote === 'IRT' || parts.quote === 'IRR') {
      return 'IRAN';
    }
    if (commodityBases.has(parts.base)) {
      return 'COMMODITY';
    }
    if (fiatAssets.has(parts.base) && fiatAssets.has(parts.quote)) {
      return 'FOREX';
    }
    if (fiatAssets.has(parts.quote) && !fiatAssets.has(parts.base)) {
      return 'EQUITY';
    }
    return 'CRYPTO';
  }
}
