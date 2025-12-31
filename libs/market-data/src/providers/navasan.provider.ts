import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseRestProvider } from './base-rest.provider';
import { Candle, InstrumentMapping, Ticker } from '../models';
import { normalizeTickerFromBestBidAsk } from '../normalizers';
import { createHttpClient } from '../utils/http.util';
import { retry } from '../utils/retry.util';
import { toInterval } from './interval-mapper';
import { getProviderEndpoints } from './providers.config';

interface NavasanLatestEntry {
  value?: string;
  change?: number;
  timestamp?: number;
  date?: string;
}

interface NavasanOhlcEntry {
  timestamp?: number;
  date?: string;
  open?: string;
  high?: string;
  low?: string;
  close?: string;
}

type MultiplierMap = Record<string, number>;

@Injectable()
export class NavasanMarketDataProvider extends BaseRestProvider {
  private readonly restClient;
  private readonly apiKey: string;
  private readonly retryAttempts: number;
  private readonly retryBaseDelayMs: number;

  // Optional: canonicalSymbol->multiplier OR providerInstId->multiplier
  // env: NAVASAN_PRICE_MULTIPLIERS="USDIRT:1,SEKKEHIRT:100,ABSHODEHIRT:100"
  private readonly multipliers: MultiplierMap;

  private warnedMissingKey = false;

  constructor(private readonly configService: ConfigService) {
    super('navasan');

    const endpoints = getProviderEndpoints(configService, 'navasan');
    const timeoutMs = configService.get<number>('NAVASAN_TIMEOUT_MS', 15000);

    this.restClient = createHttpClient(endpoints.rest, timeoutMs);
    this.apiKey = configService.get<string>('NAVASAN_API_KEY', '').trim();
    this.retryAttempts = configService.get<number>('NAVASAN_RETRY_ATTEMPTS', 3);
    this.retryBaseDelayMs = configService.get<number>('NAVASAN_RETRY_BASE_DELAY_MS', 500);

    this.multipliers = this.parseMultipliers(
      configService.get<string>('NAVASAN_PRICE_MULTIPLIERS', ''),
    );
  }

  async fetchTickers(instruments: InstrumentMapping[]): Promise<Ticker[]> {
    if (!instruments.length) return [];

    if (!this.apiKey) {
      if (!this.warnedMissingKey) {
        this.warnedMissingKey = true;
        this.logger.warn(
          JSON.stringify({
            event: 'navasan_missing_api_key',
            provider: this.provider,
          }),
        );
      }
      return [];
    }

    try {
      const response = await retry(
        () =>
          this.restClient.get('/latest/', {
            params: { api_key: this.apiKey },
          }),
        {
          attempts: this.retryAttempts,
          baseDelayMs: this.retryBaseDelayMs,
          shouldRetry: this.isRetryableError,
        },
      );

      const payload = response.data as Record<string, NavasanLatestEntry>;

      return instruments
        .map((mapping) => {
          const entry = payload?.[mapping.providerInstId];
          if (!entry) return null;

          const raw = Number(entry.value);
          if (!Number.isFinite(raw) || raw <= 0) return null;

          const value = this.normalizeIranValue(mapping, raw);

          const tsRaw = entry.timestamp;
          const ts = Number.isFinite(tsRaw) ? (tsRaw as number) * 1000 : Date.now();

          return normalizeTickerFromBestBidAsk(this.provider, mapping, value, value, value, ts);
        })
        .filter((t): t is Ticker => Boolean(t));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(
        JSON.stringify({
          event: 'navasan_fetch_tickers_failed',
          provider: this.provider,
          message,
        }),
      );
      return [];
    }
  }

  async fetchCandles(instrument: InstrumentMapping, timeframe: string, limit: number): Promise<Candle[]> {
    if (!this.apiKey) return [];

    const interval = toInterval('navasan', timeframe);
    if (!interval) {
      this.logger.warn(
        JSON.stringify({
          event: 'navasan_candle_interval_unsupported',
          provider: this.provider,
          symbol: instrument.canonicalSymbol,
          timeframe,
        }),
      );
      return [];
    }

    const endMs = Date.now();
    const startMs = endMs - limit * 24 * 60 * 60 * 1000;

    try {
      const response = await retry(
        () =>
          this.restClient.get('/ohlcSearch/', {
            params: {
              api_key: this.apiKey,
              item: instrument.providerInstId,
              start: Math.floor(startMs / 1000),
              end: Math.floor(endMs / 1000),
            },
          }),
        {
          attempts: this.retryAttempts,
          baseDelayMs: this.retryBaseDelayMs,
          shouldRetry: this.isRetryableError,
        },
      );

      const entries = Array.isArray(response.data) ? (response.data as NavasanOhlcEntry[]) : [];
      if (!entries.length) return [];

      return entries
        .map((e) => {
          const openRaw = Number(e.open);
          const highRaw = Number(e.high);
          const lowRaw = Number(e.low);
          const closeRaw = Number(e.close);

          const tsRaw = e.timestamp;
          const openTime = Number.isFinite(tsRaw) ? (tsRaw as number) * 1000 : NaN;

          if (![openRaw, highRaw, lowRaw, closeRaw, openTime].every((x) => Number.isFinite(x) && x > 0)) {
            return null;
          }

          const open = this.normalizeIranValue(instrument, openRaw);
          const high = this.normalizeIranValue(instrument, highRaw);
          const low = this.normalizeIranValue(instrument, lowRaw);
          const close = this.normalizeIranValue(instrument, closeRaw);

          return {
            provider: this.provider,
            canonicalSymbol: instrument.canonicalSymbol,
            timeframe,
            openTime,
            open,
            high,
            low,
            close,
            volume: 0,
            isFinal: true,
          } as Candle;
        })
        .filter((c): c is Candle => Boolean(c));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(
        JSON.stringify({
          event: 'navasan_fetch_candles_failed',
          provider: this.provider,
          symbol: instrument.canonicalSymbol,
          message,
        }),
      );
      return [];
    }
  }

  /**
   * Normalize Iran market values into TOMAN to match formatter logic.
   * Strategy:
   * 1) If NAVASAN_PRICE_MULTIPLIERS has entry for canonicalSymbol or providerInstId => apply it.
   * 2) Otherwise apply conservative heuristics for known Iran symbols where Navasan often returns "thousand-rial" like values.
   */
  private normalizeIranValue(mapping: InstrumentMapping | { canonicalSymbol: string; providerInstId?: string }, raw: number): number {
    const canonical = mapping.canonicalSymbol;
    const providerKey = (mapping as any).providerInstId;

    // explicit multiplier (highest priority)
    const m1 = this.multipliers[canonical];
    if (Number.isFinite(m1) && m1 > 0) return raw * m1;

    if (providerKey) {
      const m2 = this.multipliers[providerKey];
      if (Number.isFinite(m2) && m2 > 0) return raw * m2;
    }

    // only care about Iran quoted symbols
    const isIran = canonical.endsWith('IRT') || canonical.endsWith('IRR');
    if (!isIran) return raw;

    // Heuristics:
    // - Some items come as "thousand rial": e.g. 148,900 (=> 148,900,000 rial => 14,890,000 toman) => multiply 100
    // - If it's extremely large, it might be rial already => divide 10
    if (raw >= 1_000_000_000) {
      return raw / 10; // rial -> toman
    }

    // Known items that frequently arrive in small scale
    const needsThousandRialFix =
      canonical === 'SEKKEHIRT' || canonical === 'ABSHODEHIRT';

    if (needsThousandRialFix && raw < 2_000_000) {
      return raw * 100;
    }

    return raw; // assume already toman
  }

  private parseMultipliers(raw?: string): MultiplierMap {
    const map: MultiplierMap = {};
    if (!raw) return map;

    for (const part of raw.split(',')) {
      const s = part.trim();
      if (!s) continue;
      const [k, v] = s.split(':').map((x) => x.trim());
      if (!k || !v) continue;
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) map[k] = n;
    }
    return map;
  }

  private isRetryableError(error: unknown): boolean {
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (!status) return true;
    return status >= 500 || status === 429;
  }
}
