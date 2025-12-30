import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';
import { BaseWsProvider } from './base-ws.provider';
import { InstrumentMapping, Ticker, Candle } from '../models';
import { MarketDataProvider } from '../interfaces';
import { normalizeTickerFromBestBidAsk } from '../normalizers';
import * as WebSocket from 'ws';

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
  private tickerMappings = new Map<string, InstrumentMapping>();
  private candleMappings = new Map<string, InstrumentMapping>();
  private timeframes: string[] = [];

  constructor(private readonly configService: ConfigService) {
    const wsUrl = configService.get<string>(
      'COINBASE_WS_URL',
      'wss://advanced-trade-ws.coinbase.com',
    );
    super('coinbase', { url: wsUrl, heartbeatMs: 20000 });
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
