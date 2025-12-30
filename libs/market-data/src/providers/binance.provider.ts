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
  private refreshTimer?: NodeJS.Timeout;
  private restartAfterConnect = false;

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
    if (!instruments.length) return [];
  
    const mapBySymbol = new Map<string, InstrumentMapping>();
    for (const m of instruments) {
      mapBySymbol.set(m.providerSymbol.toLowerCase(), m);
    }
  
    const symbols = instruments.map((m) => m.providerSymbol.toUpperCase());
  
    const response = await retry(() =>
      this.restClient.get('/api/v3/ticker/bookTicker', {
        params: symbols.length === 1
          ? { symbol: symbols[0] }
          : { symbols: JSON.stringify(symbols) },
      }),
    );
  
    const now = Date.now();
  
    const raw = response.data as any;
    const rows: Array<{ symbol: string; bidPrice: string; askPrice: string }> =
      Array.isArray(raw) ? raw : raw ? [raw] : [];
  
    return rows
      .map((item) => {
        const mapping =
          mapBySymbol.get(String(item.symbol).toLowerCase()) ??
          this.tickerMappings.get(String(item.symbol).toLowerCase());
  
        if (!mapping) return null;
  
        return normalizeBinanceBookTicker(
          { s: item.symbol, b: item.bidPrice, a: item.askPrice, E: now },
          mapping,
        );
      })
      .filter((t): t is Ticker => Boolean(t));
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

    if (this.restartAfterConnect) {
      this.restartAfterConnect = false;
      setTimeout(() => {
        void this.stop().then(() => this.start());
      }, 0);
    }
  }


  protected onMessage(data: WebSocket.RawData): void {
    const raw = typeof data === 'string' ? data : data.toString();
    let message: BinanceCombinedMessage | null = null;
  
    try {
      message = JSON.parse(raw) as BinanceCombinedMessage;
    } catch {
      this.failures += 1;
      return;
    }
  
    if (!message?.data) return;
  
    // ✅ bookTicker: can be ARRAY for !bookTicker streams
    if (message.stream?.includes('bookTicker')) {
      const now = Date.now();
      const payloadAny = message.data as any;
  
      const items: Array<{ s: string; b: string; a: string; E?: number }> =
        Array.isArray(payloadAny) ? payloadAny : [payloadAny];
  
      for (const payload of items) {
        const s = payload?.s;
        if (!s) continue;
  
        const mapping = this.tickerMappings.get(String(s).toLowerCase());
        if (!mapping) continue;
  
        const ticker = normalizeBinanceBookTicker(
          { s, b: payload.b, a: payload.a, E: payload.E ?? now },
          mapping,
        );
  
        if (ticker) this.emit('ticker', ticker as Ticker);
      }
      return;
    }
  
    // ✅ miniTicker array (optional, if you want later)
    if (message.stream?.includes('miniTicker')) {
      // if you ever normalize miniTicker, handle array here similarly
      return;
    }
  
    // candles
    if (message.stream?.includes('@kline_')) {
      const kline = message.data?.k;
      const symbol = message.data?.s ?? kline?.s;
      const mapping = symbol ? this.candleMappings.get(String(symbol).toLowerCase()) : undefined;
      if (!mapping || !kline) return;
  
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
    // debounce to avoid multiple stop/start in same tick
    if (this.refreshTimer) return;
  
    this.refreshTimer = setTimeout(async () => {
      this.refreshTimer = undefined;
  
      const nextStreams: string[] = ['!bookTicker'];
  
      if (this.includeMiniTicker) {
        nextStreams.push('!miniTicker@arr');
      }
  
      if (this.timeframes.length && this.candleMappings.size) {
        for (const [symbol] of this.candleMappings) {
          for (const timeframe of this.timeframes) {
            nextStreams.push(`${symbol}@kline_${timeframe}`);
          }
        }
      }
  
      // If no change, do nothing
      const same =
        nextStreams.length === this.streams.length &&
        nextStreams.every((v, i) => v === this.streams[i]);
      if (same) return;
  
      this.streams = nextStreams;
  
      // If ws doesn't exist yet, start() will use correct streams
      if (!this.ws) return;
  
      // If we are still connecting, do NOT stop/terminate now.
      // Let it connect, then restart once onOpen fires.
      if (this.ws.readyState === WebSocket.CONNECTING) {
        this.restartAfterConnect = true;
        return;
      }
  
      await this.stop();
      await this.start();
    }, 0) as unknown as NodeJS.Timeout;
  }
  
}
