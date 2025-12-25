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

    try {
      const { payloadRaw } = job.data;
      const { payload, parseError } = parseTradingViewPayload(payloadRaw);
      if (parseError) {
        this.logger.warn(
          `TradingView payload parse error for job ${job.id ?? 'unknown'}: ${parseError}`,
        );
      }

      const defaults = this.getDefaults();
      const priceFallback = await this.resolvePriceFallback(payload, defaults);
      const signal = mapTradingViewPayloadToSignal(payloadRaw, defaults, priceFallback);

      if (signal.price === null) {
        this.logger.warn(
          `TradingView price unavailable for job ${job.id ?? 'unknown'} (${signal.instrument} ${signal.interval})`,
        );
      }

      const shouldProcess = await this.signalDedupeService.isAllowed(signal);
      if (!shouldProcess) {
        return;
      }

      await this.signalsService.storeSignal(signal);
      await this.signalsQueue.add('sendTelegramSignal', signal, {
        removeOnComplete: true,
        removeOnFail: { count: 50 },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const { payloadRaw } = job.data;
      const { payload } = parseTradingViewPayload(payloadRaw);
      const instrument = (payload.instrument ?? payload.symbol ?? 'unknown') as string;
      const interval = (payload.interval ?? payload.timeframe ?? 'unknown') as string;
      const strategy = (payload.strategy ?? 'unknown') as string;
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
      assetType: this.configService.get<Signal['assetType']>('TRADINGVIEW_DEFAULT_ASSET_TYPE', 'GOLD'),
      instrument: this.configService.get<string>('TRADINGVIEW_DEFAULT_INSTRUMENT', 'XAUTUSDT'),
      interval: defaultInterval,
      strategy: this.configService.get<string>('TRADINGVIEW_DEFAULT_STRATEGY', 'tradingview'),
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
}
