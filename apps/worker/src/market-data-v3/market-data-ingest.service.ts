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
} from '@libs/market-data';
import { Queue } from 'bullmq';
import { MARKET_DATA_QUEUE_NAME } from '@libs/core';
import { InjectQueue } from '@nestjs/bullmq';
import { ActiveSymbolsService } from './active-symbols.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class MarketDataIngestService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MarketDataIngestService.name);
  private readonly enabled: boolean;
  private readonly ttlSeconds: number;
  private readonly timeframes: string[];
  private readonly legacyCandleCompatEnabled: boolean;
  private readonly providerListeners = new Map<string, () => void>();
  private readonly restPollIntervalMs: number;
  private readonly restPollTimers = new Map<string, NodeJS.Timeout>();
  private readonly restPollLogged = new Set<string>();

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
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
    for (const cleanup of this.providerListeners.values()) {
      cleanup();
    }
    for (const timer of this.restPollTimers.values()) {
      clearInterval(timer);
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

    const poll = async () => {
      const snapshot = provider.getSnapshot();
      if (provider.supportsWebsocket && wsEnabled && snapshot.connected) {
        return;
      }

      if (!this.restPollLogged.has(provider.provider)) {
        this.restPollLogged.add(provider.provider);
        this.logger.warn(
          JSON.stringify({ event: 'rest_poll_started', provider: provider.provider }),
        );
      }

      try {
        const tickers = await provider.fetchTickers(mappings);
        for (const ticker of tickers) {
          await this.handleTicker(ticker);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(
          JSON.stringify({ event: 'rest_poll_error', provider: provider.provider, message }),
        );
      }

      for (const mapping of mappings) {
        for (const timeframe of timeframes) {
          try {
            const candles = await provider.fetchCandles(mapping, timeframe, 2);
            for (const candle of candles) {
              await this.handleCandle(candle);
            }
          } catch (error) {
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
        }
      }
    };

    const timer = setInterval(() => {
      void poll();
    }, this.restPollIntervalMs);
    this.restPollTimers.set(provider.provider, timer);
    void poll();
  }

  private inferAssetType(symbol: string): string {
    const normalized = symbol.trim().toUpperCase();
    if (normalized === 'XAUTUSDT' || normalized === 'PAXGUSDT') {
      return 'GOLD';
    }
    return 'CRYPTO';
  }
}
