import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue } from 'bullmq';
import { SIGNALS_QUEUE_CONCURRENCY, SIGNALS_QUEUE_NAME } from '@libs/core';
import {
  FeedRegistry,
  Signal,
  SignalDedupeService,
  SignalsService,
  mapTradingViewPayloadToSignal,
  parseTradingViewPayload,
} from '@libs/signals';

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
    @InjectQueue(SIGNALS_QUEUE_NAME) private readonly signalsQueue: Queue,
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

      // ✅ 1) خیلی سریع سیگنال رو بساز (بدون اینکه منتظر fallback بمونی)
      const signal = mapTradingViewPayloadToSignal(payloadRaw, defaults, undefined);

      // ✅ 2) همون لحظه enqueue کن
      const attempts = this.getNumber('SIGNALS_TELEGRAM_JOB_ATTEMPTS', 5);
      const backoffDelayMs = this.getNumber('SIGNALS_TELEGRAM_JOB_BACKOFF_DELAY_MS', 2000);
      const priority = this.getNumber('SIGNALS_TELEGRAM_JOB_PRIORITY', 1);

      await this.signalsQueue.add('sendTelegramSignal', signal, {
        priority,
        attempts,
        backoff: { type: 'exponential', delay: backoffDelayMs },
        removeOnComplete: true,
        removeOnFail: { count: 200 },
      });

      // ✅ 3) بعدش اگر price خالی بود، تلاش کن fallback بگیری (اما ارسال تلگرام انجام شده)
      if (signal.price === null) {
        const priceFallbackTimeoutMs = this.getNumber('TRADINGVIEW_PRICE_FALLBACK_TIMEOUT_MS', 800);

        void this.withTimeout(this.resolvePriceFallback(payload, defaults), priceFallbackTimeoutMs, undefined)
          .then((priceFallback) => {
            // اگر خواستی: اینجا می‌تونی یک "update" سیگنال ذخیره کنی یا log بزنی
            if (priceFallback !== undefined) {
              this.logger.log(`Resolved fallback price: ${priceFallback} for ${signal.instrument}`);
            }
          })
          .catch((e) => this.logger.warn(`Fallback price resolve failed: ${e?.message ?? e}`));
      }

      // ✅ 4) ذخیره در DB هم non-blocking (تا ingest کند نشود)
      void this.signalsService.storeSignal(signal).catch((e) =>
        this.logger.warn(`storeSignal failed: ${e?.message ?? e}`),
      );
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
