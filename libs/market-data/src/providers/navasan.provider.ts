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

@Injectable()
export class NavasanMarketDataProvider extends BaseRestProvider {
  private readonly restClient;
  private readonly apiKey: string;
  private readonly retryAttempts: number;
  private readonly retryBaseDelayMs: number;

  constructor(private readonly configService: ConfigService) {
    super('navasan');
    const endpoints = getProviderEndpoints(configService, 'navasan');
    const timeoutMs = configService.get<number>('NAVASAN_TIMEOUT_MS', 15000);
    this.restClient = createHttpClient(endpoints.rest, timeoutMs);
    this.apiKey = configService.get<string>('NAVASAN_API_KEY', '');
    this.retryAttempts = configService.get<number>('NAVASAN_RETRY_ATTEMPTS', 3);
    this.retryBaseDelayMs = configService.get<number>('NAVASAN_RETRY_BASE_DELAY_MS', 500);
  }

  async fetchTickers(instruments: InstrumentMapping[]): Promise<Ticker[]> {
    if (!instruments.length) {
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
          if (!entry) {
            return null;
          }
          const value = Number(entry.value);
          if (!Number.isFinite(value)) {
            return null;
          }
          const tsRaw = entry.timestamp;
          const ts = Number.isFinite(tsRaw) ? (tsRaw as number) * 1000 : Date.now();
          return normalizeTickerFromBestBidAsk(
            this.provider,
            mapping,
            value,
            value,
            value,
            ts,
          );
        })
        .filter((ticker): ticker is Ticker => Boolean(ticker));
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

  async fetchCandles(
    instrument: InstrumentMapping,
    timeframe: string,
    limit: number,
  ): Promise<Candle[]> {
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
      const entries = Array.isArray(response.data)
        ? (response.data as NavasanOhlcEntry[])
        : [];
      if (!entries.length) {
        return [];
      }
      return entries
        .map((entry) => {
          const open = Number(entry.open);
          const high = Number(entry.high);
          const low = Number(entry.low);
          const close = Number(entry.close);
          const tsRaw = entry.timestamp;
          const openTime = Number.isFinite(tsRaw) ? (tsRaw as number) * 1000 : NaN;
          if (![open, high, low, close, openTime].every(Number.isFinite)) {
            return null;
          }
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
        .filter((candle): candle is Candle => Boolean(candle));
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

  private isRetryableError(error: unknown): boolean {
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (!status) {
      return true;
    }
    return status >= 500 || status === 429;
  }
}
