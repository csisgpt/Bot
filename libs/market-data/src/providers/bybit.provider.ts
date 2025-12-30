import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';
import { BaseWsProvider } from './base-ws.provider';
import { InstrumentMapping, Ticker, Candle } from '../models';
import { MarketDataProvider } from '../interfaces';
import { createHttpClient } from '../utils/http.util';
import { retry } from '../utils/retry.util';
import { normalizeBybitKline, normalizeTickerFromBestBidAsk } from '../normalizers';
import * as WebSocket from 'ws';
import { toInterval } from './interval-mapper';
import { getProviderEndpoints } from './providers.config';

interface BybitWsMessage {
  topic?: string;
  data?: any;
  ts?: number;
}

@Injectable()
export class BybitMarketDataProvider extends BaseWsProvider implements MarketDataProvider {
  supportsWebsocket = true;
  private tickerMappings = new Map<string, InstrumentMapping>();
  private candleMappings = new Map<string, InstrumentMapping>();
  private timeframes: string[] = [];
  private readonly restClient;

  constructor(private readonly configService: ConfigService) {
    const endpoints = getProviderEndpoints(configService, 'bybit');
    super('bybit', {
      url: endpoints.ws ?? 'wss://stream.bybit.com/v5/public/spot',
      heartbeatMs: 20000,
      reconnectBaseMs: configService.get<number>('MARKET_DATA_WS_RECONNECT_BASE_DELAY_MS', 1000),
      reconnectMaxMs: configService.get<number>('MARKET_DATA_WS_RECONNECT_MAX_DELAY_MS', 30000),
    });
    const timeoutMs = configService.get<number>('MARKET_DATA_REST_TIMEOUT_MS', 10000);
    this.restClient = createHttpClient(endpoints.rest, timeoutMs);
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
  }

  protected buildUrl(): string {
    return this.options.url;
  }

  protected onOpen(): void {
    this.logger.log(
      JSON.stringify({ event: 'provider_connected', provider: this.provider }),
    );
    this.sendSubscribe();
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

  async fetchTickers(instruments: InstrumentMapping[]): Promise<Ticker[]> {
    if (!instruments.length) {
      return [];
    }
    const response = await retry(
      () =>
        this.restClient.get('/v5/market/tickers', {
          params: { category: 'spot' },
        }),
      { attempts: 3, baseDelayMs: 500 },
    );
    const list = response.data?.result?.list ?? [];
    const mappingBySymbol = new Map(instruments.map((item) => [item.providerSymbol, item]));
    return (list as Array<Record<string, string>>)
      .map((item) => {
        const mapping = mappingBySymbol.get(String(item.symbol));
        if (!mapping) {
          return null;
        }
        const bid = Number(item.bid1Price);
        const ask = Number(item.ask1Price);
        const last = Number(item.lastPrice);
        const ts = Date.now();
        return normalizeTickerFromBestBidAsk(
          this.provider,
          mapping,
          bid,
          ask,
          Number.isFinite(last) ? last : (bid + ask) / 2,
          ts,
          Number(item.volume24h),
        );
      })
      .filter((ticker): ticker is Ticker => Boolean(ticker));
  }

  async fetchCandles(
    instrument: InstrumentMapping,
    timeframe: string,
    limit: number,
  ): Promise<Candle[]> {
    const interval = toInterval('bybit', timeframe);
    const response = await retry(
      () =>
        this.restClient.get('/v5/market/kline', {
          params: { category: 'spot', symbol: instrument.providerSymbol, interval, limit },
        }),
      { attempts: 3, baseDelayMs: 500 },
    );
    const list = response.data?.result?.list ?? [];
    return (list as Array<string[]>).map((item) =>
      normalizeBybitKline(
        {
          data: {
            start: Number(item[0]),
            open: item[1],
            high: item[2],
            low: item[3],
            close: item[4],
            volume: item[5],
            confirm: true,
          },
        },
        instrument,
        timeframe,
      ) as Candle,
    );
  }

  private mapInterval(interval: string): string {
    return String(toInterval('bybit', interval));
  }
}
