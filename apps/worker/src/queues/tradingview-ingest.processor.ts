import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { PrismaService, SIGNALS_QUEUE_CONCURRENCY, SIGNALS_QUEUE_NAME } from '@libs/core';
import {
  FeedRegistry,
  Signal,
  SignalDedupeService,
  SignalsService,
  mapTradingViewPayloadToSignal,
  parseTradingViewPayload,
} from '@libs/signals';
import { NotificationOrchestratorService } from '../notifications/notification-orchestrator.service';

interface TradingViewIngestJob {
  receivedAt: string;
  ip?: string;
  headersSubset?: Record<string, string | string[] | undefined>;
  payloadRaw: unknown;
}

@Injectable()
@Processor(SIGNALS_QUEUE_NAME, { concurrency: SIGNALS_QUEUE_CONCURRENCY })
export class TradingViewIngestProcessor extends WorkerHost {
  private readonly logger = new Logger(TradingViewIngestProcessor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly signalsService: SignalsService,
    private readonly signalDedupeService: SignalDedupeService,
    private readonly feedRegistry: FeedRegistry,
    private readonly prismaService: PrismaService,
    private readonly notificationOrchestrator: NotificationOrchestratorService,
  ) {
    super();
  }

  async process(job: Job<TradingViewIngestJob>): Promise<void> {
    if (job.name !== 'ingestTradingViewAlert') {
      return;
    }

    const startedAt = Date.now();

    // Parse once and reuse (also in catch)
    const { payloadRaw } = job.data;
    const { payload, parseError } = parseTradingViewPayload(payloadRaw);

    // Pre-calc for logging (also in catch)
    const instrument = (payload.instrument ?? payload.symbol ?? 'unknown') as string;
    const interval = (payload.interval ?? payload.timeframe ?? 'unknown') as string;
    const strategy = (payload.strategy ?? 'unknown') as string;

    try {
      const defaults = this.getDefaults();

      const signal = mapTradingViewPayloadToSignal(payloadRaw, defaults, undefined);

      if (signal.price === null) {
        const priceFallbackTimeoutMs = this.getNumber('TRADINGVIEW_PRICE_FALLBACK_TIMEOUT_MS', 800);
        const priceFallback = await this.withTimeout(
          this.resolvePriceFallback(payload, defaults),
          priceFallbackTimeoutMs,
          undefined,
        );
        if (priceFallback !== undefined) {
          signal.price = priceFallback;
          this.logger.log(`Resolved fallback price: ${priceFallback} for ${signal.instrument}`);
        }
      }

      const storedSignal = await this.signalsService.storeSignal(signal);
      await this.notificationOrchestrator.handleSignalCreated(storedSignal.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `TradingView ingest failed for job ${job.id ?? 'unknown'} (${instrument} ${interval} ${strategy}): ${message}`,
      );
      throw error;
    }
  }

  private getDefaults(): {
    assetType: Signal['assetType'];
    instrument: string;
    interval: string;
    strategy: string;
  } {
    const defaultInterval = this.configService.get<string>(
      'TRADINGVIEW_DEFAULT_INTERVAL',
      this.configService.get<string>('BINANCE_INTERVAL', '15m'),
    );

    return {
      assetType: this.configService.get<Signal['assetType']>(
        'TRADINGVIEW_DEFAULT_ASSET_TYPE',
        'GOLD',
      ),
      instrument: this.configService.get<string>(
        'TRADINGVIEW_DEFAULT_INSTRUMENT',
        'XAUTUSDT',
      ),
      interval: defaultInterval,
      strategy: this.configService.get<string>(
        'TRADINGVIEW_DEFAULT_STRATEGY',
        'tradingview',
      ),
    };
  }

  private async resolvePriceFallback(
    payload: Record<string, unknown>,
    defaults: { assetType: Signal['assetType']; instrument: string; interval: string },
  ): Promise<number | undefined> {
    const priceValue = payload.price;
    if (priceValue !== undefined && priceValue !== null && `${priceValue}`.trim() !== '') {
      return undefined;
    }

    const assetType = (payload.assetType ?? defaults.assetType) as Signal['assetType'];
    const instrument = (payload.instrument ?? payload.symbol ?? defaults.instrument) as string;
    const interval = (payload.interval ?? payload.timeframe ?? defaults.interval) as string;

    try {
      const feed = this.feedRegistry.getFeed(assetType);
      const candles = await feed.getCandles({ instrument, interval, limit: 1 });
      if (candles.length > 0) {
        return candles[candles.length - 1].close;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Failed to resolve TradingView price fallback: ${message}`);
    }

    return undefined;
  }

  private getNumber(key: string, fallback: number): number {
    const raw = this.configService.get<string | number | undefined>(key);
    if (raw === undefined || raw === null || raw === '') return fallback;
    const n = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(n) ? n : fallback;
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    fallback: T,
  ): Promise<T> {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;

    return Promise.race([
      promise,
      new Promise<T>((resolve) => {
        const t = setTimeout(() => {
          clearTimeout(t);
          resolve(fallback);
        }, timeoutMs);
      }),
    ]);
  }
}
