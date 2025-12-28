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
  private readonly tickerIntervalMs: number;
  private readonly candleIntervalMs: number;

  constructor(private readonly configService: ConfigService) {
    super();
    const restUrl = configService.get<string>('OKX_REST_URL', 'https://www.okx.com');
    const timeoutMs = configService.get<number>('OKX_REST_TIMEOUT_MS', 10000);
    this.restClient = createHttpClient(restUrl, timeoutMs);
    this.tickerIntervalMs =
      configService.get<number>('OKX_REST_TICKER_INTERVAL_SECONDS', 10) * 1000;
    this.candleIntervalMs =
      configService.get<number>('OKX_REST_CANDLE_INTERVAL_SECONDS', 60) * 1000;

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
      }, this.tickerIntervalMs);
      void this.pollTickers();
    }
    if (!this.candleTimer && this.candleMappings.length && this.timeframes.length) {
      this.candleTimer = setInterval(() => {
        void this.pollCandles();
      }, this.candleIntervalMs);
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
    for (const mapping of this.tickerMappings) {
      try {
        const response = await retry(
          () => this.restClient.get('/api/v5/market/ticker', { params: { instId: mapping.providerInstId } }),
          { attempts: 3, baseDelayMs: 500 },
        );
        const data = response.data?.data?.[0];
        if (!data) {
          continue;
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
          JSON.stringify({ event: 'provider_rest_error', provider: this.provider, message }),
        );
      }
    }
  }

  private async pollCandles(): Promise<void> {
    for (const mapping of this.candleMappings) {
      for (const timeframe of this.timeframes) {
        try {
          const response = await retry(
            () =>
              this.restClient.get('/api/v5/market/candles', {
                params: { instId: mapping.providerInstId, bar: timeframe, limit: 1 },
              }),
            { attempts: 3, baseDelayMs: 500 },
          );
          const data = response.data?.data?.[0];
          if (!data) {
            continue;
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
            JSON.stringify({ event: 'provider_rest_error', provider: this.provider, message }),
          );
        }
      }
    }
  }
}
