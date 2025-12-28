import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';
import { BaseWsProvider } from './base-ws.provider';
import { InstrumentMapping, Ticker, Candle } from '../models';
import { MarketDataProvider } from '../interfaces';
import { createHttpClient } from '../utils/http.util';
import { retry } from '../utils/retry.util';
import { normalizeBybitKline, normalizeTickerFromBestBidAsk } from '../normalizers';
import * as WebSocket from 'ws';

interface BybitWsMessage {
  topic?: string;
  data?: any;
  ts?: number;
}

@Injectable()
export class BybitMarketDataProvider extends BaseWsProvider implements MarketDataProvider {
  private tickerMappings = new Map<string, InstrumentMapping>();
  private candleMappings = new Map<string, InstrumentMapping>();
  private timeframes: string[] = [];
  private fallbackTimer?: NodeJS.Timeout;
  private readonly restClient;
  private readonly fallbackIntervalMs: number;

  constructor(private readonly configService: ConfigService) {
    const wsUrl = configService.get<string>('BYBIT_WS_URL', 'wss://stream.bybit.com/v5/public/spot');
    super('bybit', { url: wsUrl, heartbeatMs: 20000 });
    const restUrl = configService.get<string>('BYBIT_REST_URL', 'https://api.bybit.com');
    const timeoutMs = configService.get<number>('BYBIT_REST_TIMEOUT_MS', 10000);
    this.restClient = createHttpClient(restUrl, timeoutMs);
    this.fallbackIntervalMs =
      configService.get<number>('BYBIT_REST_FALLBACK_INTERVAL_SECONDS', 60) * 1000;
  }

  async subscribeTickers(instruments: InstrumentMapping[]): Promise<void> {
    instruments.forEach((mapping) => {
      this.tickerMappings.set(mapping.providerSymbol, mapping);
    });
    this.sendSubscribe();
  }

  async subscribeCandles(instruments: InstrumentMapping[], timeframes: string[]): Promise<void> {
    instruments.forEach((mapping) => {
      this.candleMappings.set(mapping.providerSymbol, mapping);
    });
    this.timeframes = timeframes;
    this.sendSubscribe();
    this.ensureFallbackPolling();
  }

  protected buildUrl(): string {
    return this.options.url;
  }

  protected onOpen(): void {
    this.logger.log(
      JSON.stringify({ event: 'provider_connected', provider: this.provider }),
    );
    this.sendSubscribe();
    this.stopFallbackPolling();
  }

  protected onMessage(data: WebSocket.RawData): void {
    const raw = typeof data === 'string' ? data : data.toString();
    let message: BybitWsMessage | null = null;
    try {
      message = JSON.parse(raw) as BybitWsMessage;
    } catch (error) {
      this.failures += 1;
      return;
    }
    if (!message?.topic || !message.data) {
      return;
    }

    if (message.topic.startsWith('tickers.')) {
      const symbol = message.topic.replace('tickers.', '');
      const mapping = this.tickerMappings.get(symbol);
      if (!mapping) {
        return;
      }
      const payload = Array.isArray(message.data) ? message.data[0] : message.data;
      const bid = Number(payload?.bid1Price);
      const ask = Number(payload?.ask1Price);
      const last = Number(payload?.lastPrice);
      const ts = message.ts ?? Date.now();
      const ticker = normalizeTickerFromBestBidAsk(
        this.provider,
        mapping,
        bid,
        ask,
        Number.isFinite(last) ? last : (bid + ask) / 2,
        ts,
        Number(payload?.volume24h),
      );
      if (ticker) {
        this.emit('ticker', ticker as Ticker);
      }
      return;
    }

    if (message.topic.startsWith('kline.')) {
      const [, interval, symbol] = message.topic.split('.');
      const mapping = this.candleMappings.get(symbol);
      if (!mapping) {
        return;
      }
      const items = Array.isArray(message.data) ? message.data : [message.data];
      for (const item of items) {
        const candle = normalizeBybitKline({ data: item, ts: message.ts }, mapping, this.mapInterval(interval));
        if (candle) {
          this.emit('candle', candle as Candle);
        }
      }
    }
  }

  protected onClose(): void {
    this.logger.warn(
      JSON.stringify({ event: 'provider_disconnected', provider: this.provider }),
    );
    this.ensureFallbackPolling();
  }

  private sendSubscribe(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    const args: string[] = [];
    if (this.tickerMappings.size) {
      for (const [symbol] of this.tickerMappings) {
        args.push(`tickers.${symbol}`);
      }
    }
    if (this.candleMappings.size && this.timeframes.length) {
      for (const [symbol] of this.candleMappings) {
        for (const timeframe of this.timeframes) {
          args.push(`kline.${this.mapInterval(timeframe)}.${symbol}`);
        }
      }
    }
    if (!args.length) {
      return;
    }
    this.send({ op: 'subscribe', args });
  }

  private mapInterval(interval: string): string {
    if (/^\d+$/.test(interval)) {
      return interval;
    }
    if (interval.endsWith('m')) {
      return interval.replace('m', '');
    }
    if (interval.endsWith('h')) {
      const hours = Number(interval.replace('h', ''));
      return Number.isFinite(hours) ? String(hours * 60) : interval;
    }
    return interval;
  }

  private ensureFallbackPolling(): void {
    if (this.connected || this.fallbackTimer || !this.candleMappings.size) {
      return;
    }
    this.logger.warn(
      JSON.stringify({ event: 'provider_rest_fallback', provider: this.provider }),
    );
    this.fallbackTimer = setInterval(() => {
      void this.pollCandles();
    }, this.fallbackIntervalMs);
  }

  private stopFallbackPolling(): void {
    if (this.fallbackTimer) {
      clearInterval(this.fallbackTimer);
      this.fallbackTimer = undefined;
    }
  }

  private async pollCandles(): Promise<void> {
    for (const [symbol, mapping] of this.candleMappings) {
      for (const timeframe of this.timeframes) {
        try {
          const interval = this.mapInterval(timeframe);
          const response = await retry(
            () =>
              this.restClient.get('/v5/market/kline', {
                params: { category: 'spot', symbol, interval, limit: 2 },
              }),
            { attempts: 3, baseDelayMs: 500 },
          );
          const list = response.data?.result?.list ?? [];
          const latest = Array.isArray(list) ? list[0] : null;
          if (!latest) {
            continue;
          }
          const candle = normalizeBybitKline(
            {
              data: {
                start: Number(latest[0]),
                open: latest[1],
                high: latest[2],
                low: latest[3],
                close: latest[4],
                volume: latest[5],
                confirm: true,
              },
            },
            mapping,
            timeframe,
          );
          if (candle) {
            this.emit('candle', candle as Candle);
          }
        } catch (error) {
          this.failures += 1;
          const message = error instanceof Error ? error.message : 'Unknown error';
          this.logger.warn(
            JSON.stringify({ event: 'provider_rest_error', provider: this.provider, message, symbol }),
          );
        }
      }
    }
  }
}
