import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as WebSocket from 'ws';
import { BaseWsProvider } from './base-ws.provider';
import { MarketDataProvider } from '../interfaces';
import { Candle, InstrumentMapping, Ticker } from '../models';
import { normalizeTickerFromBestBidAsk } from '../normalizers';
import { createHttpClient } from '../utils/http.util';
import { retry } from '../utils/retry.util';
import { toInterval } from './interval-mapper';
import { getProviderEndpoints } from './providers.config';

interface TwelveDataWsMessage {
  event?: string;
  symbol?: string;
  price?: string;
  timestamp?: number | string;
  type?: string;
  data?: {
    symbol?: string;
    price?: string;
    timestamp?: number | string;
  };
}

@Injectable()
export class TwelveDataMarketDataProvider extends BaseWsProvider implements MarketDataProvider {
  supportsWebsocket = true;
  private readonly restClient;
  private readonly apiKey: string;
  private readonly maxSymbolsPerRequest: number;
  private readonly retryAttempts: number;
  private readonly retryBaseDelayMs: number;
  private readonly tickerMappings = new Map<string, InstrumentMapping>();

  constructor(private readonly configService: ConfigService) {
    const endpoints = getProviderEndpoints(configService, 'twelvedata');
    super('twelvedata', {
      url: endpoints.ws ?? 'wss://ws.twelvedata.com/v1/quotes/price',
      heartbeatMs: 20000,
      reconnectBaseMs: configService.get<number>('MARKET_DATA_WS_RECONNECT_BASE_DELAY_MS', 1000),
      reconnectMaxMs: configService.get<number>('MARKET_DATA_WS_RECONNECT_MAX_DELAY_MS', 30000),
    });
    this.apiKey = configService.get<string>('TWELVEDATA_API_KEY', '');
    this.maxSymbolsPerRequest = configService.get<number>('TWELVEDATA_MAX_SYMBOLS_PER_REQUEST', 20);
    this.retryAttempts = configService.get<number>('TWELVEDATA_RETRY_ATTEMPTS', 3);
    this.retryBaseDelayMs = configService.get<number>('TWELVEDATA_RETRY_BASE_DELAY_MS', 500);
    const timeoutMs = configService.get<number>('TWELVEDATA_TIMEOUT_MS', 15000);
    this.restClient = createHttpClient(endpoints.rest, timeoutMs);
  }

  async subscribeTickers(instruments: InstrumentMapping[]): Promise<void> {
    instruments.forEach((mapping) => {
      this.tickerMappings.set(mapping.providerSymbol.toUpperCase(), mapping);
    });
    this.sendSubscribe();
  }

  async subscribeCandles(_instruments: InstrumentMapping[], _timeframes: string[]): Promise<void> {
    return;
  }

  async fetchTickers(instruments: InstrumentMapping[]): Promise<Ticker[]> {
    if (!instruments.length) {
      return [];
    }
    const mappingBySymbol = new Map(
      instruments.map((mapping) => [mapping.providerSymbol.toUpperCase(), mapping]),
    );

    const batches: InstrumentMapping[][] = [];
    for (let i = 0; i < instruments.length; i += this.maxSymbolsPerRequest) {
      batches.push(instruments.slice(i, i + this.maxSymbolsPerRequest));
    }

    const results: Ticker[] = [];

    // Prefer TwelveData /price for latest tick (fast, lightweight) instead of /time_series.
    // Response shape varies (single vs multi), so parsing must be defensive.
    for (const batch of batches) {
      const symbols = batch.map((mapping) => mapping.providerSymbol);

      try {
        const response = await retry(
          () =>
            this.restClient.get('/price', {
              params: {
                symbol: symbols.join(','),
                apikey: this.apiKey,
              },
            }),
          {
            attempts: this.retryAttempts,
            baseDelayMs: this.retryBaseDelayMs,
            shouldRetry: this.isRetryableError,
          },
        );

        const items = this.parsePriceResponse(response.data);
        for (const item of items) {
          const mapping = mappingBySymbol.get(item.symbol.toUpperCase());
          if (!mapping) continue;

          // TwelveData /price has one price value; map it as bestBid/bestAsk equivalently.
          const ticker = normalizeTickerFromBestBidAsk(
            this.provider,
            mapping,
            item.price,
            item.price,
            item.price,
            item.ts,
          );
          if (ticker) results.push(ticker);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(
          JSON.stringify({
            event: 'twelvedata_fetch_tickers_failed',
            provider: this.provider,
            symbols: symbols.join(','),
            message,
          }),
        );
      }
    }

    return results;
  }

  private parsePriceResponse(data: unknown): Array<{ symbol: string; price: number; ts: number }> {
    const ts = Date.now();

    // Common single-symbol response: { symbol: "EUR/USD", price: "1.0912" }
    if (data && typeof data === 'object') {
      const obj = data as any;
      if (typeof obj.symbol === 'string' && (typeof obj.price === 'string' || typeof obj.price === 'number')) {
        const price = Number(obj.price);
        return Number.isFinite(price) ? [{ symbol: obj.symbol, price, ts }] : [];
      }

      // Multi-symbol response often looks like:
      // { "EUR/USD": { "price": "1.09" }, "AAPL": { "price": "192.1" }, ... }
      const out: Array<{ symbol: string; price: number; ts: number }> = [];
      for (const [symbol, v] of Object.entries(obj)) {
        if (!symbol || symbol === 'status' || symbol === 'message' || symbol === 'code') continue;
        const priceVal = (v as any)?.price ?? (v as any)?.last ?? v;
        const price = Number(priceVal);
        if (Number.isFinite(price)) {
          out.push({ symbol, price, ts });
        }
      }
      return out;
    }

    // Unexpected shapes -> empty.
    return [];
  }

  async fetchCandles(
    instrument: InstrumentMapping,
    timeframe: string,
    limit: number,
  ): Promise<Candle[]> {
    const interval = toInterval('twelvedata', timeframe);
    const response = await retry(
      () =>
        this.restClient.get('/time_series', {
          params: {
            symbol: instrument.providerSymbol,
            interval,
            outputsize: limit,
            apikey: this.apiKey,
          },
        }),
      {
        attempts: this.retryAttempts,
        baseDelayMs: this.retryBaseDelayMs,
        shouldRetry: this.isRetryableError,
      },
    );
    const entries = this.parseTimeSeriesResponse(response.data, false);
    return entries.map((entry) => ({
      provider: this.provider,
      canonicalSymbol: instrument.canonicalSymbol,
      timeframe,
      openTime: entry.ts,
      open: entry.open,
      high: entry.high,
      low: entry.low,
      close: entry.close,
      volume: entry.volume ?? 0,
      isFinal: true,
    }));
  }

  protected buildUrl(): string {
    const baseUrl = this.options.url;
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}apikey=${encodeURIComponent(this.apiKey)}`;
  }

  protected onOpen(): void {
    this.logger.log(JSON.stringify({ event: 'provider_connected', provider: this.provider }));
    this.sendSubscribe();
  }

  protected onMessage(data: WebSocket.RawData): void {
    const raw = typeof data === 'string' ? data : data.toString();
    let message: TwelveDataWsMessage | null = null;
    try {
      message = JSON.parse(raw) as TwelveDataWsMessage;
    } catch {
      this.failures += 1;
      return;
    }

    const event = message.event ?? message.type;
    if (event === 'heartbeat' || event === 'hearbeat') {
      return;
    }

    if (event !== 'price') {
      return;
    }

    const symbol = (message.symbol ?? message.data?.symbol ?? '').toUpperCase();
    const mapping = this.tickerMappings.get(symbol);
    if (!mapping) {
      return;
    }
    const priceRaw = message.price ?? message.data?.price;
    const price = Number(priceRaw);
    if (!Number.isFinite(price)) {
      return;
    }
    const ts = this.normalizeTimestamp(message.timestamp ?? message.data?.timestamp ?? Date.now());
    const ticker = normalizeTickerFromBestBidAsk(
      this.provider,
      mapping,
      price,
      price,
      price,
      ts,
    );
    if (ticker) {
      this.emit('ticker', ticker as Ticker);
    }
  }

  protected onClose(): void {
    this.logger.warn(JSON.stringify({ event: 'provider_disconnected', provider: this.provider }));
    // TwelveData WS does not require an application-level heartbeat message.
    // The underlying WebSocket ping/pong handled by BaseWsProvider is enough.
  }

  private sendSubscribe(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    if (!this.tickerMappings.size) {
      return;
    }
    const symbols = Array.from(
      new Set(Array.from(this.tickerMappings.values()).map((mapping) => mapping.providerSymbol)),
    );
    this.send({
      action: 'subscribe',
      params: { symbols: symbols.join(',') },
    });
  }

  private parseTimeSeriesResponse(
    payload: unknown,
    latestOnly: boolean,
  ): Array<{
    symbol: string;
    ts: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  }> {
    if (!payload || typeof payload !== 'object') {
      return [];
    }
    if ('values' in payload || 'meta' in payload) {
      return this.parseTimeSeriesEntries(payload as Record<string, unknown>, latestOnly);
    }
    const entries: Array<{
      symbol: string;
      ts: number;
      open: number;
      high: number;
      low: number;
      close: number;
      volume?: number;
    }> = [];
    Object.entries(payload as Record<string, unknown>).forEach(([symbol, value]) => {
      if (!value || typeof value !== 'object') {
        return;
      }
      entries.push(
        ...this.parseTimeSeriesEntries(value as Record<string, unknown>, latestOnly, symbol),
      );
    });
    return entries;
  }

  private parseTimeSeriesEntries(
    payload: Record<string, unknown>,
    latestOnly: boolean,
    fallbackSymbol?: string,
  ): Array<{
    symbol: string;
    ts: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  }> {
    const values = payload.values;
    if (!Array.isArray(values) || values.length === 0) {
      return [];
    }
    const meta = payload.meta as { symbol?: string } | undefined;
    const symbol = meta?.symbol ?? fallbackSymbol;
    if (!symbol) {
      return [];
    }
    const slice = latestOnly ? values.slice(0, 1) : values;
    return slice
      .map((item) => this.parseTimeSeriesValue(symbol, item as Record<string, unknown>))
      .filter(
        (
          entry,
        ): entry is {
          symbol: string;
          ts: number;
          open: number;
          high: number;
          low: number;
          close: number;
          volume?: number;
        } => Boolean(entry),
      );
  }

  private parseTimeSeriesValue(
    symbol: string,
    item: Record<string, unknown>,
  ):
    | {
        symbol: string;
        ts: number;
        open: number;
        high: number;
        low: number;
        close: number;
        volume?: number;
      }
    | null {
    const open = Number(item.open);
    const high = Number(item.high);
    const low = Number(item.low);
    const close = Number(item.close);
    if (![open, high, low, close].every(Number.isFinite)) {
      return null;
    }
    const volume = item.volume !== undefined ? Number(item.volume) : undefined;
    const ts = this.normalizeTimestamp(
      (item.timestamp as string | number | undefined) ??
        (item.datetime as string | number | undefined) ??
        Date.now(),
    );
    return {
      symbol,
      ts,
      open,
      high,
      low,
      close,
      volume: Number.isFinite(volume) ? volume : undefined,
    };
  }

  private normalizeTimestamp(value: string | number): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value < 1_000_000_000_000 ? value * 1000 : value;
    }
    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? parsed : Date.now();
  }

  private isRetryableError(error: unknown): boolean {
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (!status) {
      return true;
    }
    return status >= 500 || status === 429;
  }
}