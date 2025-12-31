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

  constructor(private readonly config: ConfigService) {
    super('twelvedata');

    this.apiKey =
      this.config.get<string>('TWELVEDATA_API_KEY') ??
      '';

    this.restUrl = this.config.get<string>('TWELVEDATA_REST_URL') ?? 'https://api.twelvedata.com';

    this.maxSymbolsPerRequest = Number(this.config.get<string>('TWELVEDATA_MAX_SYMBOLS_PER_REQUEST') ?? 20);
    this.timeoutMs = Number(this.config.get<string>('TWELVEDATA_TIMEOUT_MS') ?? 15000);
    this.retryAttempts = Number(this.config.get<string>('TWELVEDATA_RETRY_ATTEMPTS') ?? 3);
    this.retryBaseDelayMs = Number(this.config.get<string>('TWELVEDATA_RETRY_BASE_DELAY_MS') ?? 500);

    this.restClient = axios.create({
      baseURL: this.restUrl,
      timeout: this.timeoutMs,
    });
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

    const uniqueProviderSymbols = Array.from(
      new Set(instruments.map((mapping) => mapping.providerSymbol).filter(Boolean)),
    );

    const batches = this.chunk(uniqueProviderSymbols, this.maxSymbolsPerRequest);

    const results: Ticker[] = [];
    const now = Date.now();

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
        },
      );

      const parsed = this.parseQuoteResponse(response?.data);

      for (const row of parsed) {
        const mapping = instruments.find(
          (item) => item.providerSymbol.toUpperCase() === row.symbol.toUpperCase(),
        );
        if (!mapping) {
          continue;
        }

        results.push({
          provider: this.provider,
          canonicalSymbol: mapping.canonicalSymbol,
          ts: now,
          last: row.price,
          bid: row.price,
          ask: row.price,
        });
      }
    }

    return results;
  }

  /**
   * Fetch candles (still uses /time_series — single-symbol per request).
   */
  async fetchCandles(instrument: InstrumentMapping, timeframe: string, limit: number): Promise<Candle[]> {
    const response = await retry(
      () =>
        this.restClient.get('/time_series', {
          params: {
            symbol: instrument.providerSymbol,
            interval: this.mapInterval(timeframe),
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

    const parseOne = (obj: Record<string, unknown>): { symbol: string; price: number } | null => {
      if (!obj || typeof obj !== 'object') return null;
      const symbol = String(obj?.['symbol'] ?? obj?.['ticker'] ?? '');
      if (!symbol) return null;

      const price = this.parseNumber(
        obj?.['price'] ?? obj?.['close'] ?? obj?.['last'] ?? obj?.['bid'] ?? obj?.['ask'],
      );
      if (price === null) return null;

      return { symbol, price };
    };

    // Single symbol response: { symbol: \"AAPL\", price: \"...\", ... }
    if (typeof anyPayload?.['symbol'] === 'string') {
      const one = parseOne(anyPayload);
      return one ? [one] : [];
    }

    // Multi response often returns a map keyed by symbol.
    // Example: { \"AAPL\": { ... }, \"MSFT\": { ... } }
    const out: Array<{ symbol: string; price: number }> = [];
    for (const value of Object.values(anyPayload)) {
      if (!value || typeof value !== 'object') continue;
      const one = parseOne(value as Record<string, unknown>);
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
          symbol: instrument.canonicalSymbol,
        }),
      );
      return [];
    }

    const values = Array.isArray(data.values) ? (data.values as Array<Record<string, unknown>>) : [];
    return values
      .map((v) => this.parseTimeSeriesValue(v, instrument, timeframe))
      .filter((x): x is Candle => x !== null)
      .sort((a: Candle, b: Candle) => a.openTime - b.openTime);
  }

  private parseTimeSeriesValue(
    v: Record<string, unknown>,
    instrument: InstrumentMapping,
    timeframe: string,
  ): Candle | null {
    const ts = this.normalizeTimestamp(v?.['datetime']);
    if (!ts) return null;

    const open = this.parseNumber(v?.['open']);
    const high = this.parseNumber(v?.['high']);
    const low = this.parseNumber(v?.['low']);
    const close = this.parseNumber(v?.['close']);

    if ([open, high, low, close].some((x) => x === null)) return null;

    const volume = this.parseNumber(v?.['volume']) ?? 0;

    return {
      provider: this.provider,
      canonicalSymbol: instrument.canonicalSymbol,
      timeframe,
      openTime: ts,
      open: open!,
      high: high!,
      low: low!,
      close: close!,
      volume,
      isFinal: true,
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
