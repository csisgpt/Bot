import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseRestProvider } from './base-rest.provider';
import { Ticker, Candle, InstrumentMapping } from '../models';
import { normalizeTickerFromBestBidAsk } from '../normalizers';
import { retry } from '../utils/retry.util';
import { getProviderEndpoints } from './providers.config';
import { createHttpClient } from '../utils/http.util';
import { toInterval } from './interval-mapper';

@Injectable()
export class TwelveDataMarketDataProvider extends BaseRestProvider {
  private readonly restClient;
  private readonly apiKey: string;
  private readonly retryAttempts: number;
  private readonly retryBaseDelayMs: number;
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    super('twelvedata');

    const endpoints = getProviderEndpoints(configService, 'twelvedata');
    this.timeoutMs = configService.get<number>('TWELVEDATA_TIMEOUT_MS', 15000);

    this.restClient = createHttpClient(endpoints.rest, this.timeoutMs);

    this.apiKey =
      configService.get<string>('TWELVEDATA_API_KEY') ||
      configService.get<string>('TWELVE_DATA_API_KEY') ||
      '';

    this.retryAttempts = configService.get<number>('TWELVEDATA_RETRY_ATTEMPTS', 3);
    this.retryBaseDelayMs = configService.get<number>('TWELVEDATA_RETRY_BASE_DELAY_MS', 500);
  }

  async fetchTickers(instruments: InstrumentMapping[]): Promise<Ticker[]> {
    if (!instruments.length) return [];

    const symbols = instruments.map((i) => i.providerInstId).filter(Boolean);
    if (!symbols.length) return [];

    try {
      const response = await retry(
        () =>
          this.restClient.get('/price', {
            params: {
              apikey: this.apiKey,
              symbol: symbols.join(','),
              format: 'JSON',
            },
          }),
        {
          attempts: this.retryAttempts,
          baseDelayMs: this.retryBaseDelayMs,
          shouldRetry: this.isRetryableError,
        },
      );

      const data = response.data;
      const now = Date.now();

      const tickers: Ticker[] = [];

      // اگر فقط یک symbol خواستیم
      if (symbols.length === 1 && typeof data?.price === 'string') {
        const price = Number(data.price);
        if (Number.isFinite(price)) {
          const mapping = instruments[0];
          tickers.push(
            normalizeTickerFromBestBidAsk(this.provider, mapping, price, price, price, now),
          );
        }
        return tickers;
      }

      // multi-symbol shape (object)
      const byProviderSymbol = new Map(instruments.map((i) => [i.providerInstId, i]));
      for (const [sym, entry] of Object.entries<any>(data)) {
        const priceRaw = typeof entry === 'string' ? entry : entry?.price;
        const last = Number(priceRaw);
        if (!Number.isFinite(last)) continue;

        const mapping = byProviderSymbol.get(sym);
        if (!mapping) continue;

        tickers.push(
          normalizeTickerFromBestBidAsk(this.provider, mapping, last, last, last, now),
        );
      }

      return tickers;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(
        JSON.stringify({
          event: 'twelvedata_fetch_tickers_failed',
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
    const interval = toInterval('twelvedata', timeframe);
    if (!interval) {
      this.logger.warn(
        JSON.stringify({
          event: 'twelvedata_candle_interval_unsupported',
          provider: this.provider,
          symbol: instrument.canonicalSymbol,
          timeframe,
        }),
      );
      return [];
    }

    try {
      const response = await retry(
        () =>
          this.restClient.get('/time_series', {
            params: {
              symbol: instrument.providerInstId,
              apikey: this.apiKey,
              interval,
              outputsize: limit,
              format: 'JSON',
            },
          }),
        {
          attempts: this.retryAttempts,
          baseDelayMs: this.retryBaseDelayMs,
          shouldRetry: this.isRetryableError,
        },
      );

      const entries = Array.isArray(response.data?.values)
        ? (response.data.values as any[])
        : [];
      if (!entries.length) return [];

      return entries
        .map((entry) => {
          const open = Number(entry.open);
          const high = Number(entry.high);
          const low = Number(entry.low);
          const close = Number(entry.close);
          const ts = entry.datetime ? new Date(entry.datetime).getTime() : NaN;

          if (![open, high, low, close, ts].every(Number.isFinite)) return null;

          return {
            provider: this.provider,
            canonicalSymbol: instrument.canonicalSymbol,
            timeframe,
            openTime: ts,
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
          event: 'twelvedata_fetch_candles_failed',
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
    if (!status) return true;
    return status >= 500 || status === 429;
  }
}