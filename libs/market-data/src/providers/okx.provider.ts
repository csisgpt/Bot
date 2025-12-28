import { EventEmitter } from 'events';
import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';
import { MarketDataProvider } from '../interfaces';
import { InstrumentMapping, ProviderSnapshot, Ticker, Candle } from '../models';
import { createHttpClient } from '../utils/http.util';
import { retry } from '../utils/retry.util';
import { normalizeOkxRestCandle, normalizeTickerFromBestBidAsk } from '../normalizers';
import { Logger } from '@nestjs/common';

@Injectable()
export class OkxMarketDataProvider extends EventEmitter implements MarketDataProvider {
  readonly provider = 'okx';
  private readonly logger = new Logger('okx-provider');
  private readonly restClient;
  private connected = false;
  private lastMessageTs: number | null = null;
  private reconnects = 0;
  private failures = 0;
  private lastError: string | null = null;
  private tickerMappings: InstrumentMapping[] = [];
  private candleMappings: InstrumentMapping[] = [];
  private timeframes: string[] = [];
  private tickerTimer?: NodeJS.Timeout;
  private candleTimer?: NodeJS.Timeout;
  private readonly pollIntervalMs: number;
  private readonly restConcurrency: number;

  constructor(private readonly configService: ConfigService) {
    super();
    const restUrl = configService.get<string>('OKX_REST_URL', 'https://www.okx.com');
    const timeoutMs = configService.get<number>('OKX_REST_TIMEOUT_MS', 10000);
    this.restClient = createHttpClient(restUrl, timeoutMs);
    this.pollIntervalMs = configService.get<number>('OKX_POLL_INTERVAL_MS', 10000);
    this.restConcurrency = configService.get<number>('OKX_REST_CONCURRENCY', 4);

    const wsEnabled = configService.get<boolean>('OKX_WS_ENABLED', false);
    if (wsEnabled) {
      // TODO: Implement OKX public WS subscriptions per https://www.okx.com/docs-v5/en/
      this.logger.warn(
        JSON.stringify({
          event: 'provider_ws_todo',
          provider: this.provider,
          message: 'WS فعال نشده است؛ در حال حاضر از REST استفاده می‌شود.',
        }),
      );
    }
  }

  async connect(): Promise<void> {
    this.connected = true;
    this.startPolling();
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.stopPolling();
  }

  async subscribeTickers(instruments: InstrumentMapping[]): Promise<void> {
    this.tickerMappings = instruments;
    this.startPolling();
  }

  async subscribeCandles(instruments: InstrumentMapping[], timeframes: string[]): Promise<void> {
    this.candleMappings = instruments;
    this.timeframes = timeframes;
    this.startPolling();
  }

  getSnapshot(): ProviderSnapshot {
    return {
      provider: this.provider,
      connected: this.connected,
      lastMessageTs: this.lastMessageTs,
      reconnects: this.reconnects,
      failures: this.failures,
      lastError: this.lastError,
    };
  }

  private startPolling(): void {
    if (!this.connected) {
      return;
    }
    if (!this.tickerTimer && this.tickerMappings.length) {
      this.tickerTimer = setInterval(() => {
        void this.pollTickers();
      }, this.pollIntervalMs);
      void this.pollTickers();
    }
    if (!this.candleTimer && this.candleMappings.length && this.timeframes.length) {
      this.candleTimer = setInterval(() => {
        void this.pollCandles();
      }, this.pollIntervalMs);
      void this.pollCandles();
    }
  }

  private stopPolling(): void {
    if (this.tickerTimer) {
      clearInterval(this.tickerTimer);
      this.tickerTimer = undefined;
    }
    if (this.candleTimer) {
      clearInterval(this.candleTimer);
      this.candleTimer = undefined;
    }
  }

  private async pollTickers(): Promise<void> {
    await this.runWithConcurrency(this.tickerMappings, async (mapping) => {
      try {
        const response = await retry(
          () =>
            this.restClient.get('/api/v5/market/ticker', {
              params: { instId: mapping.providerInstId },
            }),
          { attempts: 3, baseDelayMs: 500, shouldRetry: this.isRetryable },
        );
        const data = response.data?.data?.[0];
        if (!data) {
          return;
        }
        const bid = Number(data.bidPx);
        const ask = Number(data.askPx);
        const last = Number(data.last);
        const ts = Number(data.ts) || Date.now();
        const ticker = normalizeTickerFromBestBidAsk(
          this.provider,
          mapping,
          bid,
          ask,
          Number.isFinite(last) ? last : (bid + ask) / 2,
          ts,
          Number(data.vol24h),
        );
        if (ticker) {
          this.lastMessageTs = ts;
          this.emit('ticker', ticker as Ticker);
        }
      } catch (error) {
        this.failures += 1;
        const message = error instanceof Error ? error.message : 'Unknown error';
        this.lastError = message;
        this.logger.warn(
          JSON.stringify({
            event: 'provider_rest_error',
            provider: this.provider,
            symbol: mapping.providerInstId,
            message,
          }),
        );
      }
    });
  }

  private async pollCandles(): Promise<void> {
    const tasks = this.candleMappings.flatMap((mapping) =>
      this.timeframes.map((timeframe) => ({ mapping, timeframe })),
    );
    await this.runWithConcurrency(tasks, async ({ mapping, timeframe }) => {
      try {
        const response = await retry(
          () =>
            this.restClient.get('/api/v5/market/candles', {
              params: { instId: mapping.providerInstId, bar: timeframe, limit: 1 },
            }),
          { attempts: 3, baseDelayMs: 500, shouldRetry: this.isRetryable },
        );
        const data = response.data?.data?.[0];
        if (!data) {
          return;
        }
        const candle = normalizeOkxRestCandle(data, mapping, timeframe);
        if (candle) {
          this.lastMessageTs = Date.now();
          this.emit('candle', candle as Candle);
        }
      } catch (error) {
        this.failures += 1;
        const message = error instanceof Error ? error.message : 'Unknown error';
        this.lastError = message;
        this.logger.warn(
          JSON.stringify({
            event: 'provider_rest_error',
            provider: this.provider,
            symbol: mapping.providerInstId,
            message,
          }),
        );
      }
    });
  }

  private runWithConcurrency<T>(
    items: T[],
    worker: (item: T) => Promise<void>,
  ): Promise<void> {
    const concurrency = Math.max(1, this.restConcurrency);
    let index = 0;
    const runners = new Array(Math.min(concurrency, items.length)).fill(null).map(async () => {
      while (index < items.length) {
        const current = items[index++];
        await worker(current);
      }
    });
    return Promise.all(runners).then(() => undefined);
  }

  private isRetryable(error: unknown): boolean {
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (status) {
      return status === 429 || status >= 500;
    }
    return true;
  }
}
