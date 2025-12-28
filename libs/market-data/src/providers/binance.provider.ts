import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';
import { BaseWsProvider } from './base-ws.provider';
import { InstrumentMapping, Ticker, Candle } from '../models';
import { normalizeBinanceBookTicker } from '../normalizers';
import { MarketDataProvider } from '../interfaces';
import * as WebSocket from 'ws';

interface BinanceCombinedMessage {
  stream: string;
  data: any;
}

@Injectable()
export class BinanceMarketDataProvider extends BaseWsProvider implements MarketDataProvider {
  private tickerMappings = new Map<string, InstrumentMapping>();
  private candleMappings = new Map<string, InstrumentMapping>();
  private timeframes: string[] = [];
  private includeMiniTicker = false;
  private streams: string[] = [];

  constructor(private readonly configService: ConfigService) {
    const baseUrl = configService.get<string>('BINANCE_WS_URL', 'wss://stream.binance.com:9443/stream');
    super('binance', { url: baseUrl, heartbeatMs: 20000 });
  }

  async subscribeTickers(instruments: InstrumentMapping[]): Promise<void> {
    instruments.forEach((mapping) => {
      this.tickerMappings.set(mapping.providerSymbol.toLowerCase(), mapping);
    });
    this.includeMiniTicker = this.configService.get<boolean>('BINANCE_WS_MINI_TICKER', false);
    await this.refreshStreams();
  }

  async subscribeCandles(instruments: InstrumentMapping[], timeframes: string[]): Promise<void> {
    instruments.forEach((mapping) => {
      this.candleMappings.set(mapping.providerSymbol.toLowerCase(), mapping);
    });
    this.timeframes = timeframes;
    await this.refreshStreams();
  }

  protected buildUrl(): string {
    const baseUrl = this.options.url;
    if (!this.streams.length) {
      return baseUrl;
    }
    const joiner = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${joiner}streams=${this.streams.join('/')}`;
  }

  protected onOpen(): void {
    this.logger.log(
      JSON.stringify({ event: 'provider_connected', provider: this.provider, streams: this.streams.length }),
    );
  }

  protected onMessage(data: WebSocket.RawData): void {
    const raw = typeof data === 'string' ? data : data.toString();
    let message: BinanceCombinedMessage | null = null;
    try {
      message = JSON.parse(raw) as BinanceCombinedMessage;
    } catch (error) {
      this.failures += 1;
      return;
    }
    if (!message?.data) {
      return;
    }
    if (message.stream?.includes('bookTicker')) {
      const payload = message.data as { s: string; b: string; a: string; E?: number };
      const mapping = this.tickerMappings.get(payload.s?.toLowerCase());
      if (!mapping) {
        return;
      }
      const ticker = normalizeBinanceBookTicker(payload, mapping);
      if (ticker) {
        this.emit('ticker', ticker as Ticker);
      }
      return;
    }

    if (message.stream?.includes('@kline_')) {
      const kline = message.data?.k;
      const symbol = message.data?.s ?? kline?.s;
      const mapping = symbol ? this.candleMappings.get(String(symbol).toLowerCase()) : undefined;
      if (!mapping || !kline) {
        return;
      }
      const candle: Candle = {
        provider: this.provider,
        canonicalSymbol: mapping.canonicalSymbol,
        timeframe: kline.i,
        openTime: Number(kline.t),
        open: Number(kline.o),
        high: Number(kline.h),
        low: Number(kline.l),
        close: Number(kline.c),
        volume: Number(kline.v),
        isFinal: Boolean(kline.x),
      };
      if ([candle.open, candle.high, candle.low, candle.close, candle.volume, candle.openTime].every(Number.isFinite)) {
        this.emit('candle', candle);
      }
    }
  }

  protected onClose(): void {
    this.logger.warn(
      JSON.stringify({ event: 'provider_disconnected', provider: this.provider }),
    );
  }

  private async refreshStreams(): Promise<void> {
    const streams: string[] = ['!bookTicker'];
    if (this.includeMiniTicker) {
      streams.push('!miniTicker@arr');
    }
    if (this.timeframes.length && this.candleMappings.size) {
      for (const [symbol] of this.candleMappings) {
        for (const timeframe of this.timeframes) {
          streams.push(`${symbol}@kline_${timeframe}`);
        }
      }
    }
    this.streams = streams;
    if (this.ws) {
      await this.disconnect();
      await this.connect();
    }
  }
}
