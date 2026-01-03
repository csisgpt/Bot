import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

import { Candle, InstrumentMapping, Ticker } from '../models';
import { retry } from '../utils/retry.util';
import { BaseRestProvider } from './base-rest.provider';

@Injectable()
export class TwelveDataMarketDataProvider extends BaseRestProvider {
  private readonly restClient: AxiosInstance;

  private readonly apiKey: string;
  private readonly restUrl: string;
  private readonly maxSymbolsPerRequest: number;
  private readonly timeoutMs: number;
  private readonly retryAttempts: number;
  private readonly retryBaseDelayMs: number;

  constructor(config: ConfigService) {
    super('twelvedata');

    this.apiKey = config.get<string>('TWELVEDATA_API_KEY', '');
    this.restUrl = config.get<string>('TWELVEDATA_REST_URL', 'https://api.twelvedata.com');
    this.maxSymbolsPerRequest = Number(config.get<string>('TWELVEDATA_MAX_SYMBOLS_PER_REQUEST', '20'));
    this.timeoutMs = Number(config.get<string>('TWELVEDATA_REQUEST_TIMEOUT_MS', '10000'));
    this.retryAttempts = Number(config.get<string>('TWELVEDATA_RETRY_ATTEMPTS', '2'));
    this.retryBaseDelayMs = Number(config.get<string>('TWELVEDATA_RETRY_BASE_DELAY_MS', '300'));

    this.restClient = axios.create({
      baseURL: this.restUrl,
      timeout: this.timeoutMs,
      headers: { Accept: 'application/json' },
    });
  }

  isEnabled(): boolean {
    return Boolean(this.apiKey);
  }

  async fetchTickers(instruments: InstrumentMapping[]): Promise<Ticker[]> {
    if (!this.isEnabled()) return [];
    if (!Array.isArray(instruments) || instruments.length === 0) return [];

    const tickers: Ticker[] = [];

    // TwelveData supports multi-symbol via comma-separated list
    const symbolChunks = this.chunk(instruments, this.maxSymbolsPerRequest);

    for (const chunk of symbolChunks) {
      const symbols = chunk.map((i) => i.providerSymbol).filter(Boolean);
      if (symbols.length === 0) continue;

      const response = await retry(
        () =>
          this.restClient.get('/quote', {
            params: {
              symbol: symbols.join(','),
              apikey: this.apiKey,
            },
          }),
        {
          attempts: this.retryAttempts,
          baseDelayMs: this.retryBaseDelayMs,
        },
      );

      const parsed = this.parseQuoteResponse(response.data);

      // Map provider symbol -> canonical symbol
      for (const p of parsed) {
        const inst = chunk.find((x) => x.providerSymbol === p.symbol);
        if (!inst) continue;

        tickers.push({
          provider: this.provider,
          canonicalSymbol: inst.canonicalSymbol,
          price: p.price,
          timestamp: Date.now(),
        });
      }
    }

    return tickers;
  }

  async fetchCandles(instrument: InstrumentMapping, timeframe: string, limit = 200): Promise<Candle[]> {
    if (!this.isEnabled()) return [];
    if (!instrument?.providerSymbol) return [];

    const interval = this.mapInterval(timeframe);

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
      },
    );

    return this.parseTimeSeriesResponse(response.data, instrument, timeframe);
  }

  private parseQuoteResponse(
    payload: unknown,
  ): Array<{
    symbol: string;
    price: number;
  }> {
    if (!payload || typeof payload !== 'object') return [];

    const anyPayload = payload as Record<string, unknown>;

    // Error payload from TwelveData: { status: "error", code: "...", message: "..." }
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

    const parsePrice = (obj: Record<string, unknown>): number | null => {
      return this.parseNumber(
        obj?.['price'] ?? obj?.['close'] ?? obj?.['last'] ?? obj?.['bid'] ?? obj?.['ask'],
      );
    };

    const parseOne = (symbolFallback: string | null, obj: Record<string, unknown>) => {
      const symbol = String(obj?.['symbol'] ?? obj?.['ticker'] ?? symbolFallback ?? '');
      if (!symbol) return null;

      const price = parsePrice(obj);
      if (price === null) return null;

      return { symbol, price };
    };

    // Some responses wrap the map in "data"
    if (anyPayload['data'] && typeof anyPayload['data'] === 'object') {
      return this.parseQuoteResponse(anyPayload['data']);
    }

    // Some responses return an array in "values"
    if (Array.isArray(anyPayload['values'])) {
      const out: Array<{ symbol: string; price: number }> = [];
      for (const v of anyPayload['values'] as Array<unknown>) {
        if (!v || typeof v !== 'object') continue;
        const one = parseOne(null, v as Record<string, unknown>);
        if (one) out.push(one);
      }
      return out;
    }

    // Single symbol response: { symbol: "AAPL", price: "123.45", ... }
    if (typeof anyPayload?.['symbol'] === 'string') {
      const one = parseOne(null, anyPayload);
      return one ? [one] : [];
    }

    // Multi-symbol response is often a map keyed by symbol (especially FX/metals),
    // where the nested object may NOT contain "symbol".
    // Example: { "EUR/USD": { price: "1.09" }, "status": "ok" }
    const out: Array<{ symbol: string; price: number }> = [];
    for (const [key, value] of Object.entries(anyPayload)) {
      if (!value || typeof value !== 'object') continue;

      // skip meta keys
      if (key === 'status' || key === 'message' || key === 'code') continue;

      const one = parseOne(key, value as Record<string, unknown>);
      if (one) out.push(one);
    }

    return out;
  }

  private parseTimeSeriesResponse(data: any, instrument: InstrumentMapping, timeframe: string): Candle[] {
    if (!data || typeof data !== 'object') return [];

    if (data.status === 'error') {
      this.logger.warn(
        JSON.stringify({
          event: 'twelvedata_time_series_error',
          provider: this.provider,
          code: data.code,
          message: data.message,
          symbol: instrument?.providerSymbol,
          timeframe,
        }),
      );
      return [];
    }

    const values = Array.isArray(data.values) ? data.values : [];
    if (values.length === 0) return [];

    const candles: Candle[] = [];

    for (const row of values) {
      if (!row || typeof row !== 'object') continue;

      const ts =
        this.parseTimestamp(row.datetime ?? row.timestamp ?? row.time) ??
        this.parseTimestamp(row.datetime);

      const open = this.parseNumber(row.open);
      const high = this.parseNumber(row.high);
      const low = this.parseNumber(row.low);
      const close = this.parseNumber(row.close);

      if (ts === null || open === null || high === null || low === null || close === null) continue;

      const volume = this.parseNumber(row.volume) ?? undefined;

      candles.push({
        provider: this.provider,
        canonicalSymbol: instrument.canonicalSymbol,
        timeframe,
        openTime: ts,
        open,
        high,
        low,
        close,
        volume,
        isFinal: true,
      });
    }

    // TwelveData returns newest first; normalize to ascending
    candles.sort((a, b) => a.openTime - b.openTime);

    return candles;
  }

  private mapInterval(interval: string): string {
    // TwelveData intervals are e.g. "1min","5min","15min","1h","4h","1day"
    switch (interval) {
      case '1m':
        return '1min';
      case '5m':
        return '5min';
      case '15m':
        return '15min';
      case '1h':
        return '1h';
      case '4h':
        return '4h';
      case '1d':
        return '1day';
      default:
        // fallback: allow pass-through if already a valid TwelveData interval
        return interval;
    }
  }

  private parseNumber(v: unknown): number | null {
    if (v === null || v === undefined) return null;
    const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }

  private parseTimestamp(raw: unknown): number | null {
    if (raw === null || raw === undefined) return null;

    // epoch seconds or ms
    if (typeof raw === 'number') {
      if (!Number.isFinite(raw)) return null;
      // heuristic: seconds vs ms
      return raw < 2_000_000_000 ? raw * 1000 : raw;
    }

    // numeric string
    const asNum = Number(String(raw));
    if (Number.isFinite(asNum)) {
      return asNum < 2_000_000_000 ? asNum * 1000 : asNum;
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