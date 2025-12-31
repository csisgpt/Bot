import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseRestProvider } from './base-rest.provider';
import { Candle, InstrumentMapping, Ticker } from '../models';
import { normalizeTickerFromBestBidAsk } from '../normalizers';
import { createHttpClient } from '../utils/http.util';
import { retry } from '../utils/retry.util';
import { getProviderEndpoints } from './providers.config';

@Injectable()
export class BonbastMarketDataProvider extends BaseRestProvider {
  private readonly restClient;
  private readonly username: string;
  private readonly hash: string;
  private readonly retryAttempts: number;
  private readonly retryBaseDelayMs: number;
  private misconfiguredLogged = false;

  constructor(private readonly configService: ConfigService) {
    super('bonbast');
    const endpoints = getProviderEndpoints(configService, 'bonbast');
    const timeoutMs = configService.get<number>('BONBAST_TIMEOUT_MS', 15000);
    this.restClient = createHttpClient(endpoints.rest, timeoutMs);
    this.username = configService.get<string>('BONBAST_USERNAME', '');
    this.hash = configService.get<string>('BONBAST_HASH', '');
    this.retryAttempts = configService.get<number>('BONBAST_RETRY_ATTEMPTS', 3);
    this.retryBaseDelayMs = configService.get<number>('BONBAST_RETRY_BASE_DELAY_MS', 500);
  }

  async fetchTickers(instruments: InstrumentMapping[]): Promise<Ticker[]> {
    if (!instruments.length) {
      return [];
    }
    if (!this.username || !this.hash) {
      if (!this.misconfiguredLogged) {
        this.misconfiguredLogged = true;
        this.logger.error(
          JSON.stringify({
            event: 'bonbast_missing_config',
            provider: this.provider,
            message: 'BONBAST_USERNAME or BONBAST_HASH is missing',
          }),
        );
      }
      return [];
    }

    try {
      const response = await retry(
        () =>
          this.restClient.post(`/api/${this.username}`, new URLSearchParams({ hash: this.hash }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
          }),
        {
          attempts: this.retryAttempts,
          baseDelayMs: this.retryBaseDelayMs,
          shouldRetry: this.isRetryableError,
        },
      );
      const payload = response.data as Record<string, string | number>;
      return instruments
        .map((mapping) => {
          const field = mapping.providerInstId;
          const value = payload?.[field];
          const price = Number(value);
          if (!Number.isFinite(price)) {
            return null;
          }
          return normalizeTickerFromBestBidAsk(
            this.provider,
            mapping,
            price,
            price,
            price,
            Date.now(),
          );
        })
        .filter((ticker): ticker is Ticker => Boolean(ticker));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(
        JSON.stringify({
          event: 'bonbast_fetch_tickers_failed',
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
    _limit: number,
  ): Promise<Candle[]> {
    this.logger.warn(
      JSON.stringify({
        event: 'bonbast_candles_unsupported',
        provider: this.provider,
        symbol: instrument.canonicalSymbol,
        timeframe,
      }),
    );
    return [];
  }

  private isRetryableError(error: unknown): boolean {
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (!status) {
      return true;
    }
    return status >= 500 || status === 429;
  }
}
