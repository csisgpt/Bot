import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import WebSocket from 'ws';

import { Candle } from '../models';
import { InstrumentMapping, MarketDataProvider } from '../provider.types';
import { retry } from '../utils/retry';
import { BaseWsProvider } from './base-ws.provider';

export type Ticker = {
  symbol: string; // canonical
  price: number;
  timestamp: number;
  provider: string;
};

@Injectable()
export class TwelveDataProvider extends BaseWsProvider implements MarketDataProvider {
  readonly provider = 'twelvedata' as const;

  private readonly logger = new Logger(TwelveDataProvider.name);
  private readonly restClient: AxiosInstance;

  private readonly apiKey: string;
  private readonly restUrl: string;
  private readonly wsUrl: string;

  private readonly maxSymbolsPerRequest: number;
  private readonly timeoutMs: number;
  private readonly retryAttempts: number;
  private readonly retryBaseDelayMs: number;

  private tickerMappings = new Map<string, InstrumentMapping>();

  private appHeartbeatTimer?: NodeJS.Timeout;

  constructor(private readonly config: ConfigService) {
    super({
      provider: 'twelvedata',
      url:
        (config.get<string>('TWELVEDATA_WS_URL') ?? config.get<string>('TWELVEDATA_WS_URL')) ||
        'wss://ws.twelvedata.com/v1/quotes/price',
      // NOTE: TwelveData may close the connection when it sees unknown actions.
      // We rely on the WS library / underlying ping-pong.
      heartbeatMs: 0,
    });

    this.apiKey =
      this.config.get<string>('TWELVEDATA_API_KEY') ??
      this.config.get<string>('TWELVE_DATA_API_KEY') ??
      this.config.get<string>('TWELVEDATA_KEY') ??
      '';

    this.restUrl = this.config.get<string>('TWELVEDATA_REST_URL') ?? 'https://api.twelvedata.com';
    this.wsUrl = this.config.get<string>('TWELVEDATA_WS_URL') ?? 'wss://ws.twelvedata.com/v1/quotes/price';

    this.maxSymbolsPerRequest = Number(this.config.get<string>('TWELVEDATA_MAX_SYMBOLS_PER_REQUEST') ?? 20);
    this.timeoutMs = Number(this.config.get<string>('TWELVEDATA_TIMEOUT_MS') ?? 15000);
    this.retryAttempts = Number(this.config.get<string>('TWELVEDATA_RETRY_ATTEMPTS') ?? 3);
    this.retryBaseDelayMs = Number(this.config.get<string>('TWELVEDATA_RETRY_BASE_DELAY_MS') ?? 500);

    this.restClient = axios.create({
      baseURL: this.restUrl,
      timeout: this.timeoutMs,
    });
  }

  setTickersUniverse(instruments: InstrumentMapping[]): void {
    this.tickerMappings = new Map(instruments.map((m) => [m.providerSymbol.toUpperCase(), m]));
  }

  /**
   * Fetch spot prices (tickers).
   *
   * IMPORTANT: TwelveData `/time_series` is not suitable for batching many symbols reliably.
   * We use `/quote` which supports multi-symbol responses.
   */
  async fetchTickers(instruments: InstrumentMapping[]): Promise<Ticker[]> {
    if (!instruments.length) {
      return [];
    }

    const mappingBySymbol = new Map(
      instruments.map((mapping) => [mapping.providerSymbol.toUpperCase(), mapping]),
    );

    const uniqueProviderSymbols = Array.from(
      new Set(instruments.map((i) => i.providerSymbol).filter(Boolean)),
    );

    const batches = this.chunk(uniqueProviderSymbols, this.maxSymbolsPerRequest);

    const results: Ticker[] = [];

    for (const batch of batches) {
      const response = await retry(
        () =>
          this.restClient.get('/quote', {
            params: {
              symbol: batch.join(','),
              apikey: this.apiKey,
            },
          }),
        {
          attempts: this.retryAttempts,
          baseDelayMs: this.retryBaseDelayMs,
          onRetry: (err, attempt) => {
            this.logger.warn(
              JSON.stringify({
                event: 'twelvedata_fetch_tickers_retry',
                provider: this.provider,
                attempt,
                message: err?.message,
              }),
            );
          },
        },
      );

      const parsed = this.parseQuoteResponse(response?.data);

      for (const row of parsed) {
        const key = row.symbol.toUpperCase();
        const mapping = mappingBySymbol.get(key);
        if (!mapping) continue;

        results.push({
          symbol: mapping.canonicalSymbol,
          price: row.price,
          timestamp: row.ts,
          provider: this.provider,
        });
      }
    }

    return results;
  }

  /**
   * Fetch candles (still uses /time_series — single-symbol per request).
   */
  async fetchCandles(params: {
    instrument: InstrumentMapping;
    interval: string;
    limit: number;
  }): Promise<Candle[]> {
    const { instrument, interval, limit } = params;

    const response = await retry(
      () =>
        this.restClient.get('/time_series', {
          params: {
            symbol: instrument.providerSymbol,
            interval: this.mapInterval(interval),
            outputsize: limit,
            apikey: this.apiKey,
          },
        }),
      {
        attempts: this.retryAttempts,
        baseDelayMs: this.retryBaseDelayMs,
        onRetry: (err, attempt) => {
          this.logger.warn(
            JSON.stringify({
              event: 'twelvedata_fetch_candles_retry',
              provider: this.provider,
              attempt,
              message: err?.message,
            }),
          );
        },
      },
    );

    return this.parseTimeSeriesResponse(response.data, instrument.canonicalSymbol);
  }

  // ---- WS ----

  connect(): void {
    // BaseWsProvider will call `createWsUrl()` for url. We already include apikey in the URL.
    super.connect();
  }

  protected createWsUrl(): string {
    // TwelveData expects api key either in query or via header.
    // We keep it in query for simplicity.
    const sep = this.wsUrl.includes('?') ? '&' : '?';
    return `${this.wsUrl}${sep}apikey=${encodeURIComponent(this.apiKey)}`;
  }

  protected onOpen(): void {
    this.logger.log(JSON.stringify({ event: 'provider_connected', provider: this.provider }));
    this.sendSubscribe();
    // NOTE: DO NOT send custom heartbeat actions; TwelveData may close unknown action frames.
  }

  protected onClose(): void {
    this.logger.warn(JSON.stringify({ event: 'provider_disconnected', provider: this.provider }));
    this.stopAppHeartbeat();
  }

  protected onMessage(raw: WebSocket.RawData): void {
    let msg: any;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    // Some messages may include { event: \"subscribe-status\" } or errors.
    if (msg?.status === 'error') {
      this.logger.warn(
        JSON.stringify({
          event: 'twelvedata_ws_error_message',
          provider: this.provider,
          message: msg?.message,
          code: msg?.code,
        }),
      );
      return;
    }

    const symbol = (msg?.symbol ?? msg?.data?.symbol ?? '').toString().toUpperCase();
    if (!symbol) return;

    const mapping = this.tickerMappings.get(symbol);
    if (!mapping) return;

    const priceRaw = msg?.price ?? msg?.data?.price ?? msg?.close ?? msg?.data?.close;
    const price = this.parseNumber(priceRaw);
    if (price === null) return;

    const ts = this.normalizeTimestamp(msg?.timestamp ?? msg?.data?.timestamp ?? msg?.time ?? msg?.data?.time);

    this.emitTicker({
      symbol: mapping.canonicalSymbol,
      price,
      timestamp: ts,
      provider: this.provider,
    });
  }

  private sendSubscribe(): void {
    const symbols = Array.from(this.tickerMappings.keys());
    if (!symbols.length) return;

    // TwelveData expects: { action: \"subscribe\", params: { symbols: \"AAPL,MSFT\" } }
    const payload = {
      action: 'subscribe',
      params: { symbols: symbols.join(',') },
    };

    this.sendJson(payload);
  }

  /**
   * Kept for compatibility; NOT used by default.
   * Some providers accept app-level heartbeat actions; TwelveData often doesn't.
   */
  private startAppHeartbeat(): void {
    this.stopAppHeartbeat();
    this.appHeartbeatTimer = setInterval(() => {
      this.sendJson({ action: 'heartbeat' });
    }, 20_000);
  }

  private stopAppHeartbeat(): void {
    if (this.appHeartbeatTimer) {
      clearInterval(this.appHeartbeatTimer);
      this.appHeartbeatTimer = undefined;
    }
  }

  private parseQuoteResponse(
    payload: unknown,
  ): Array<{
    symbol: string;
    ts: number;
    price: number;
  }> {
    if (!payload || typeof payload !== 'object') return [];

    const anyPayload: any = payload;

    // Errors are usually like: { status: \"error\", code: ..., message: ... }
    if (anyPayload?.status === 'error') {
      this.logger.warn(
        JSON.stringify({
          event: 'twelvedata_quote_error',
          provider: this.provider,
          code: anyPayload?.code,
          message: anyPayload?.message,
        }),
      );
      return [];
    }

    const now = Date.now();

    const parseOne = (obj: any): { symbol: string; ts: number; price: number } | null => {
      if (!obj || typeof obj !== 'object') return null;
      const symbol = (obj?.symbol ?? obj?.ticker ?? '').toString();
      if (!symbol) return null;

      const price = this.parseNumber(obj?.price ?? obj?.close ?? obj?.last ?? obj?.bid ?? obj?.ask);
      if (price === null) return null;

      const ts = this.normalizeTimestamp(obj?.timestamp ?? obj?.time ?? obj?.datetime) ?? now;

      return { symbol, ts, price };
    };

    // Single symbol response: { symbol: \"AAPL\", price: \"...\", ... }
    if (typeof anyPayload?.symbol === 'string') {
      const one = parseOne(anyPayload);
      return one ? [one] : [];
    }

    // Multi response often returns a map keyed by symbol.
    // Example: { \"AAPL\": { ... }, \"MSFT\": { ... } }
    const out: Array<{ symbol: string; ts: number; price: number }> = [];
    for (const value of Object.values(anyPayload)) {
      const one = parseOne(value);
      if (one) out.push(one);
    }

    return out;
  }

  private parseTimeSeriesResponse(data: any, canonicalSymbol: string): Candle[] {
    if (!data || typeof data !== 'object') return [];

    if (data.status === 'error') {
      this.logger.warn(
        JSON.stringify({
          event: 'twelvedata_time_series_error',
          provider: this.provider,
          code: data.code,
          message: data.message,
          symbol: canonicalSymbol,
        }),
      );
      return [];
    }

    const values = Array.isArray(data.values) ? data.values : [];
    return values
      .map((v: any) => this.parseTimeSeriesValue(v, canonicalSymbol))
      .filter((x): x is Candle => !!x)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  private parseTimeSeriesValue(v: any, canonicalSymbol: string): Candle | null {
    const ts = this.normalizeTimestamp(v?.datetime);
    if (!ts) return null;

    const open = this.parseNumber(v?.open);
    const high = this.parseNumber(v?.high);
    const low = this.parseNumber(v?.low);
    const close = this.parseNumber(v?.close);

    if ([open, high, low, close].some((x) => x === null)) return null;

    const volume = this.parseNumber(v?.volume) ?? 0;

    return {
      symbol: canonicalSymbol,
      interval: '1m',
      timestamp: ts,
      open: open!,
      high: high!,
      low: low!,
      close: close!,
      volume,
    };
  }

  private mapInterval(interval: string): string {
    // Basic mapping; keep existing behavior.
    if (interval === '1m') return '1min';
    if (interval === '5m') return '5min';
    if (interval === '15m') return '15min';
    if (interval === '1h') return '1h';
    if (interval === '4h') return '4h';
    if (interval === '1d') return '1day';
    return '1min';
  }

  private parseNumber(v: any): number | null {
    if (v === undefined || v === null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  private normalizeTimestamp(raw: any): number | null {
    if (raw === undefined || raw === null) return null;

    // numeric epoch (sec or ms)
    const n = Number(raw);
    if (Number.isFinite(n)) {
      // heuristics: seconds if too small
      return n < 10_000_000_000 ? n * 1000 : n;
    }

    // datetime string
    const s = String(raw);
    const d = new Date(s);
    const ms = d.getTime();
    return Number.isFinite(ms) ? ms : null;
  }

  private chunk<T>(arr: T[], size: number): T[][] {
    if (size <= 0) return [arr];
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }
}