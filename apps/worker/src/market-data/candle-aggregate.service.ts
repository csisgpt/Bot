import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@libs/core';
import { BinanceMarketDataProvider } from '@libs/binance';
import { MonitoringPlanService } from './monitoring-plan.service';

interface AggregateWindow {
  timeframe: string;
  intervalMs: number;
  handle: NodeJS.Timeout;
}

@Injectable()
export class CandleAggregateService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CandleAggregateService.name);
  private readonly windows = new Map<string, AggregateWindow>();
  private readonly enabled: boolean;
  private readonly concurrency: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly marketDataProvider: BinanceMarketDataProvider,
    private readonly monitoringPlanService: MonitoringPlanService,
  ) {
    this.enabled = this.configService.get<boolean>('CANDLE_AGGREGATE_ENABLED', true);
    this.concurrency = this.configService.get<number>('CANDLE_AGGREGATE_CONCURRENCY', 5);
  }

  onModuleInit(): void {
    if (this.configService.get<boolean>('MARKET_DATA_INGEST_ENABLED', false)) {
      this.logger.warn('تجمیع کندل قدیمی غیرفعال شد چون بازار چندمنبعی فعال است');
      return;
    }
    if (!this.enabled) {
      this.logger.log('تجمیع کندل‌ها غیرفعال است');
      return;
    }

    const timeframes = this.parseList(
      this.configService.get<string>('AGG_TIMEFRAMES', '5m,15m'),
    );
    for (const timeframe of timeframes) {
      const intervalMs = this.timeframeToMs(timeframe);
      if (!intervalMs) {
        this.logger.warn(`تایم‌فریم نامعتبر برای تجمیع: ${timeframe}`);
        continue;
      }
      if (this.windows.has(timeframe)) {
        continue;
      }
      const handle = setInterval(() => {
        void this.aggregate(timeframe, intervalMs);
      }, intervalMs);
      this.windows.set(timeframe, { timeframe, intervalMs, handle });
      void this.aggregate(timeframe, intervalMs);
    }
  }

  onModuleDestroy(): void {
    for (const window of this.windows.values()) {
      clearInterval(window.handle);
    }
  }

  private async aggregate(timeframe: string, intervalMs: number): Promise<void> {
    try {
      const plan = await this.monitoringPlanService.buildPlan();
      if (plan.activeSymbols.length === 0) {
        return;
      }

      const bucketStartMs = Math.floor((Date.now() - intervalMs) / intervalMs) * intervalMs;
      const bucketStart = new Date(bucketStartMs);
      const bucketEnd = new Date(bucketStartMs + intervalMs);

      let upserted = 0;
      await this.runWithConcurrency(
        plan.activeSymbols,
        this.concurrency,
        async (symbol) => {
          const didUpsert = await this.aggregateSymbol(
            symbol,
            timeframe,
            bucketStart,
            bucketEnd,
          );
          if (didUpsert) {
            upserted += 1;
          }
        },
      );

      if (upserted > 0) {
        this.logger.log(`تجمیع ${timeframe} انجام شد: ${upserted} کندل`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`تجمیع ${timeframe} ناموفق بود: ${message}`);
    }
  }

  private timeframeToMs(timeframe: string): number | null {
    const match = /^([0-9]+)([mh])$/i.exec(timeframe.trim());
    if (!match) {
      return null;
    }
    const value = Number(match[1]);
    if (!Number.isFinite(value) || value <= 0) {
      return null;
    }
    const unit = match[2].toLowerCase();
    if (unit === 'm') {
      return value * 60 * 1000;
    }
    if (unit === 'h') {
      return value * 60 * 60 * 1000;
    }
    return null;
  }

  private parseList(value?: unknown): string[] {
    if (Array.isArray(value)) {
      return value.map(String).map((x) => x.trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
      return value.split(',').map((x) => x.trim()).filter(Boolean);
    }
    return [];
  }

  private normalizeSymbol(symbol: string): string {
    return symbol
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
  }

  private async aggregateSymbol(
    symbol: string,
    timeframe: string,
    bucketStart: Date,
    bucketEnd: Date,
  ): Promise<boolean> {
    const instrument = this.normalizeSymbol(symbol);
    const baseCandles = await this.prismaService.candle.findMany({
      where: {
        source: this.marketDataProvider.source,
        instrument,
        timeframe: '1m',
        time: {
          gte: bucketStart,
          lt: bucketEnd,
        },
      },
      orderBy: { time: 'asc' },
    });

    if (!baseCandles.length) {
      return false;
    }

    const open = baseCandles[0].open;
    const close = baseCandles[baseCandles.length - 1].close;
    const high = Math.max(...baseCandles.map((candle) => candle.high));
    const low = Math.min(...baseCandles.map((candle) => candle.low));
    const volume = baseCandles.reduce((sum, candle) => sum + (candle.volume ?? 0), 0);
    const assetType = this.monitoringPlanService.getAssetType(symbol);

    await this.prismaService.candle.upsert({
      where: {
        source_instrument_timeframe_time: {
          source: this.marketDataProvider.source,
          instrument,
          timeframe,
          time: bucketStart,
        },
      },
      update: {
        open,
        high,
        low,
        close,
        volume,
        rawPayload: {
          baseTimeframe: '1m',
          startTime: bucketStart.toISOString(),
          endTime: bucketEnd.toISOString(),
          count: baseCandles.length,
        },
      },
      create: {
        source: this.marketDataProvider.source,
        assetType,
        instrument,
        timeframe,
        time: bucketStart,
        open,
        high,
        low,
        close,
        volume,
        rawPayload: {
          baseTimeframe: '1m',
          startTime: bucketStart.toISOString(),
          endTime: bucketEnd.toISOString(),
          count: baseCandles.length,
        },
      },
    });

    return true;
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
}
