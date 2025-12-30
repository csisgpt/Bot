import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';
import { BaseWsProvider } from './base-ws.provider';
import { InstrumentMapping, Ticker, Candle } from '../models';
import { MarketDataProvider } from '../interfaces';
import { normalizeTickerFromBestBidAsk } from '../normalizers';
import * as WebSocket from 'ws';
import { createHttpClient } from '../utils/http.util';
import { retry } from '../utils/retry.util';
import { toInterval } from './interval-mapper';
import { getProviderEndpoints } from './providers.config';

interface CoinbaseWsMessage {
  type?: string;
  product_id?: string;
  price?: string;
  best_bid?: string;
  best_ask?: string;
  time?: string;
  candles?: Array<[string, string, string, string, string]>;
  granularity?: string;
}

@Injectable()
export class CoinbaseMarketDataProvider extends BaseWsProvider implements MarketDataProvider {
  supportsWebsocket = true;
  private tickerMappings = new Map<string, InstrumentMapping>();
  private candleMappings = new Map<string, InstrumentMapping>();
  private timeframes: string[] = [];
  private readonly restClient;

  constructor(private readonly configService: ConfigService) {
    const endpoints = getProviderEndpoints(configService, 'coinbase');
    super('coinbase', {
      url: endpoints.ws ?? 'wss://ws-feed.exchange.coinbase.com',
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

  async fetchTickers(instruments: InstrumentMapping[]): Promise<Ticker[]> {
    if (!instruments.length) {
      return [];
    }
    const results = await Promise.all(
      instruments.map(async (mapping) => {
        const response = await retry(() =>
          this.restClient.get(`/products/${mapping.providerSymbol}/ticker`),
        );
        const data = response.data as {
          price: string;
          bid: string;
          ask: string;
          time: string;
        };
        const bid = Number(data.bid);
        const ask = Number(data.ask);
        const last = Number(data.price);
        const ts = data.time ? Date.parse(data.time) : Date.now();
        return normalizeTickerFromBestBidAsk(
          this.provider,
          mapping,
          bid,
          ask,
          Number.isFinite(last) ? last : (bid + ask) / 2,
          ts,
        );
      }),
    );
    return results.filter((ticker): ticker is Ticker => Boolean(ticker));
  }

  async fetchCandles(
    instrument: InstrumentMapping,
    timeframe: string,
    limit: number,
  ): Promise<Candle[]> {
    const granularity = toInterval('coinbase', timeframe);
    const response = await retry(() =>
      this.restClient.get(`/products/${instrument.providerSymbol}/candles`, {
        params: { granularity, limit },
      }),
    );
    const candles = response.data as Array<[number, number, number, number, number, number]>;
    return candles.map((item) => ({
      provider: this.provider,
      canonicalSymbol: instrument.canonicalSymbol,
      timeframe,
      openTime: item[0] * 1000,
      low: Number(item[1]),
      high: Number(item[2]),
      open: Number(item[3]),
      close: Number(item[4]),
      volume: Number(item[5]),
      isFinal: true,
    }));
  }

  protected buildUrl(): string {
    return this.options.url;
  }

  protected onOpen(): void {
    this.logger.log(JSON.stringify({ event: 'provider_connected', provider: this.provider }));
    this.sendSubscribe();
  }

  protected onMessage(data: WebSocket.RawData): void {
    const raw = typeof data === 'string' ? data : data.toString();
    let message: CoinbaseWsMessage | null = null;
    try {
      message = JSON.parse(raw) as CoinbaseWsMessage;
    } catch (error) {
      this.failures += 1;
      return;
    }

    if (message.type === 'ticker' && message.product_id) {
      const mapping = this.tickerMappings.get(message.product_id);
      if (!mapping) {
        return;
      }
      const bid = Number(message.best_bid);
      const ask = Number(message.best_ask);
      const last = Number(message.price);
      const ts = message.time ? Date.parse(message.time) : Date.now();
      const ticker = normalizeTickerFromBestBidAsk(
        this.provider,
        mapping,
        bid,
        ask,
        Number.isFinite(last) ? last : (bid + ask) / 2,
        ts,
      );
      if (ticker) {
        this.emit('ticker', ticker as Ticker);
      }
      return;
    }

    if (message.type === 'candles' && message.product_id && message.candles?.length) {
      const mapping = this.candleMappings.get(message.product_id);
      if (!mapping) {
        return;
      }
      const interval = message.granularity ? `${Number(message.granularity) / 60}m` : '1m';
      for (const candle of message.candles) {
        const [start, open, high, low, close] = candle;
        const candlePayload: Candle = {
          provider: this.provider,
          canonicalSymbol: mapping.canonicalSymbol,
          timeframe: interval,
          openTime: Number(start) * 1000,
          open: Number(open),
          high: Number(high),
          low: Number(low),
          close: Number(close),
          volume: 0,
          isFinal: true,
        };
        if ([candlePayload.open, candlePayload.high, candlePayload.low, candlePayload.close, candlePayload.openTime].every(Number.isFinite)) {
          this.emit('candle', candlePayload as Candle);
        }
      }
    }
  }

  protected onClose(): void {
    this.logger.warn(JSON.stringify({ event: 'provider_disconnected', provider: this.provider }));
  }

  private sendSubscribe(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    const productIds = new Set<string>();
    for (const symbol of this.tickerMappings.keys()) {
      productIds.add(symbol);
    }
    for (const symbol of this.candleMappings.keys()) {
      productIds.add(symbol);
    }
    if (!productIds.size) {
      return;
    }
    const channels = ['ticker'];
    if (this.candleMappings.size && this.timeframes.length) {
      channels.push('candles');
    }
    this.send({
      type: 'subscribe',
      product_ids: Array.from(productIds),
      channels,
    });
  }
}
