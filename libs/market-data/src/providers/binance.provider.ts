import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';
import { BaseWsProvider } from './base-ws.provider';
import { InstrumentMapping, Ticker, Candle } from '../models';
import { normalizeBinanceBookTicker } from '../normalizers';
import { MarketDataProvider } from '../interfaces';
import * as WebSocket from 'ws';
import { createHttpClient } from '../utils/http.util';
import { retry } from '../utils/retry.util';
import { getProviderEndpoints } from './providers.config';

interface BinanceCombinedMessage {
  stream: string;
  data: any;
}

@Injectable()
export class BinanceMarketDataProvider extends BaseWsProvider implements MarketDataProvider {
  supportsWebsocket = true;
  private tickerMappings = new Map<string, InstrumentMapping>();
  private candleMappings = new Map<string, InstrumentMapping>();
  private timeframes: string[] = [];
  private includeMiniTicker = false;
  private streams: string[] = [];
  private readonly restClient;

  constructor(private readonly configService: ConfigService) {
    const endpoints = getProviderEndpoints(configService, 'binance');
    super('binance', {
      url: endpoints.ws ?? 'wss://stream.binance.com:9443/stream',
      heartbeatMs: 20000,
      reconnectBaseMs: configService.get<number>('MARKET_DATA_WS_RECONNECT_BASE_DELAY_MS', 1000),
      reconnectMaxMs: configService.get<number>('MARKET_DATA_WS_RECONNECT_MAX_DELAY_MS', 30000),
    });
    const timeoutMs = configService.get<number>('MARKET_DATA_REST_TIMEOUT_MS', 10000);
    this.restClient = createHttpClient(endpoints.rest, timeoutMs);
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

  async fetchTickers(instruments: InstrumentMapping[]): Promise<Ticker[]> {
    if (!instruments.length) {
      return [];
    }
    const symbols = instruments.map((mapping) => mapping.providerSymbol.toUpperCase());
    const response = await retry(() =>
      this.restClient.get('/api/v3/ticker/bookTicker', {
        params: { symbols: JSON.stringify(symbols) },
      }),
    );
    const now = Date.now();
    const data = response.data as Array<{ symbol: string; bidPrice: string; askPrice: string }>;
    return data
      .map((item) => {
        const mapping = this.tickerMappings.get(item.symbol.toLowerCase()) ??
          instruments.find((candidate) => candidate.providerSymbol.toUpperCase() === item.symbol);
        if (!mapping) {
          return null;
        }
        return normalizeBinanceBookTicker(
          { s: item.symbol, b: item.bidPrice, a: item.askPrice, E: now },
          mapping,
        );
      })
      .filter((ticker): ticker is Ticker => Boolean(ticker));
  }

  async fetchCandles(
    instrument: InstrumentMapping,
    timeframe: string,
    limit: number,
  ): Promise<Candle[]> {
    const response = await retry(() =>
      this.restClient.get('/api/v3/klines', {
        params: { symbol: instrument.providerSymbol, interval: timeframe, limit },
      }),
    );
    const candles = response.data as Array<[number, string, string, string, string, string]>;
    return candles.map((item) => ({
      provider: this.provider,
      canonicalSymbol: instrument.canonicalSymbol,
      timeframe,
      openTime: Number(item[0]),
      open: Number(item[1]),
      high: Number(item[2]),
      low: Number(item[3]),
      close: Number(item[4]),
      volume: Number(item[5]),
      isFinal: true,
    }));
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
      await this.stop();
      await this.start();
    }
  }
}
