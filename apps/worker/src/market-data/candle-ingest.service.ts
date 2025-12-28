import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@libs/core';
import { BinanceMarketDataProvider, MarketDataKline } from '@libs/binance';
import { MonitoringPlanService } from './monitoring-plan.service';

export const isClosedCandle = (kline: MarketDataKline, nowMs = Date.now()): boolean =>
  Number.isFinite(kline.closeTime) && kline.closeTime <= nowMs - 1000;

@Injectable()
export class CandleIngestService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CandleIngestService.name);
  private intervalHandle?: NodeJS.Timeout;
  private running = false;
  private readonly intervalMs: number;
  private readonly concurrency: number;
  private readonly enabled: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly marketDataProvider: BinanceMarketDataProvider,
    private readonly monitoringPlanService: MonitoringPlanService,
  ) {
    this.intervalMs =
      this.configService.get<number>('CANDLE_INGEST_INTERVAL_SECONDS', 60) * 1000;
    this.concurrency = this.configService.get<number>('CANDLE_INGEST_CONCURRENCY', 5);
    this.enabled = this.configService.get<boolean>('CANDLE_INGEST_ENABLED', true);
  }

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log('اینجست کندل غیرفعال است');
      return;
    }
    this.intervalHandle = setInterval(() => {
      void this.runOnce();
    }, this.intervalMs);
    void this.runOnce();
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
    }
  }

  private async runOnce(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    const startedAt = Date.now();

    try {
      const plan = await this.monitoringPlanService.buildPlan();
      if (plan.activeSymbols.length === 0) {
        this.logger.warn('هیچ نمادی برای اینجست وجود ندارد');
        return;
      }

      let upserted = 0;
      await this.runWithConcurrency(plan.activeSymbols, this.concurrency, async (symbol) => {
        const endTime = Date.now() - 1000;
        const klines = await this.retry(
          () => this.marketDataProvider.getKlines(symbol, '1m', 2, endTime),
          3,
          500,
        );
        if (!klines.length) {
          return;
        }

        const closedKlines = klines.filter((kline) => isClosedCandle(kline, endTime));
        if (closedKlines.length === 0) {
          return;
        }

        const latestClosedCloseTime = Math.max(
          ...closedKlines.map((kline) => kline.closeTime),
        );
        if (Date.now() - latestClosedCloseTime > this.intervalMs * 3) {
          this.logger.warn(`کندل ${symbol} قدیمی است`);
        }

        const assetType = this.monitoringPlanService.getAssetType(symbol);
        const instrument = this.normalizeSymbol(symbol);

        for (const kline of closedKlines) {
          const payload = this.toRawPayload(kline);
          await this.prismaService.candle.upsert({
            where: {
              source_instrument_timeframe_time: {
                source: this.marketDataProvider.source,
                instrument,
                timeframe: '1m',
                time: new Date(kline.openTime),
              },
            },
            update: {
              open: kline.open,
              high: kline.high,
              low: kline.low,
              close: kline.close,
              volume: kline.volume,
              rawPayload: payload,
            },
            create: {
              source: this.marketDataProvider.source,
              assetType,
              instrument,
              timeframe: '1m',
              time: new Date(kline.openTime),
              open: kline.open,
              high: kline.high,
              low: kline.low,
              close: kline.close,
              volume: kline.volume,
              rawPayload: payload,
            },
          });
          upserted += 1;
        }
      });

      const durationMs = Date.now() - startedAt;
      this.logger.log(`اینجست کندل تمام شد: ${upserted} رکورد در ${durationMs}ms`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`اینجست کندل ناموفق بود: ${message}`);
    } finally {
      this.running = false;
    }
  }

  private async runWithConcurrency<T>(
    items: T[],
    concurrency: number,
    worker: (item: T) => Promise<void>,
  ): Promise<void> {
    let index = 0;
    const runners = new Array(Math.min(concurrency, items.length)).fill(null).map(async () => {
      while (index < items.length) {
        const current = items[index++];
        await worker(current);
      }
    });
    await Promise.all(runners);
  }

  private async retry<T>(
    fn: () => Promise<T>,
    attempts: number,
    baseDelayMs: number,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (attempt < attempts) {
          const delay = baseDelayMs * 2 ** (attempt - 1);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    throw lastError;
  }

  private normalizeSymbol(symbol: string): string {
    return symbol
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
  }

  private toRawPayload(kline: MarketDataKline): Record<string, number | undefined> {
    return {
      openTime: kline.openTime,
      open: kline.open,
      high: kline.high,
      low: kline.low,
      close: kline.close,
      volume: kline.volume,
      closeTime: kline.closeTime,
    };
  }

}
