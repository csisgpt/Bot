import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseRestProvider } from './base-rest.provider';
import { Candle, InstrumentMapping, Ticker } from '../models';
import { normalizeTickerFromBestBidAsk } from '../normalizers';
import { createHttpClient } from '../utils/http.util';
import { retry } from '../utils/retry.util';
import { getEnvFirst, getEnvFirstInt } from '../utils/env-alias';
import { getProviderEndpoints } from './providers.config';

interface BrsApiItem {
  symbol?: string;
  price?: string | number;
  unit?: string;
  time_unix?: number;
}

interface BrsApiResponse {
  gold?: BrsApiItem[];
  currency?: BrsApiItem[];
  cryptocurrency?: BrsApiItem[];
}

@Injectable()
export class BrsApiMarketDataProvider extends BaseRestProvider {
  private readonly restClient;
  private readonly apiKey: string;
  private readonly retryAttempts: number;
  private readonly retryBaseDelayMs: number;
  private readonly cacheTtlMs = 15_000;
  private cacheTs = 0;
  private cacheMap: Map<string, BrsApiItem> = new Map();
  private missingKeyLogged = false;

  constructor(private readonly configService: ConfigService) {
    super('brsapi_market');
    const endpoints = getProviderEndpoints(configService, 'brsapi_market');
    const timeoutMs = getEnvFirstInt(
      configService.get<number>('BRSAPI_MARKET_TIMEOUT_MS', 15000),
      'BRSAPI_MARKET_TIMEOUT_MS',
      'BRSAPI_TIMEOUT_MS',
    );
    this.restClient = createHttpClient(endpoints.rest, timeoutMs);
    this.apiKey =
      getEnvFirst('BRSAPI_MARKET_API_KEY', 'BRSAPI_API_KEY') ??
      configService.get<string>('BRSAPI_MARKET_API_KEY', '');
    this.retryAttempts = getEnvFirstInt(
      configService.get<number>('BRSAPI_MARKET_RETRY_ATTEMPTS', 3),
      'BRSAPI_MARKET_RETRY_ATTEMPTS',
      'BRSAPI_RETRY_ATTEMPTS',
    );
    this.retryBaseDelayMs = getEnvFirstInt(
      configService.get<number>('BRSAPI_MARKET_RETRY_BASE_DELAY_MS', 500),
      'BRSAPI_MARKET_RETRY_BASE_DELAY_MS',
      'BRSAPI_RETRY_BASE_DELAY_MS',
    );
  }

  async fetchTickers(instruments: InstrumentMapping[]): Promise<Ticker[]> {
    if (!instruments.length) {
      return [];
    }
    const map = await this.getSnapshot();
    if (!map.size) {
      return [];
    }

    return instruments
      .map((mapping) => {
        const item = map.get(mapping.providerInstId);
        if (!item) {
          return null;
        }
        const price = Number(item.price);
        if (!Number.isFinite(price)) {
          return null;
        }
        const ts = Number.isFinite(item.time_unix) ? (item.time_unix as number) * 1000 : Date.now();
        return normalizeTickerFromBestBidAsk(
          this.provider,
          mapping,
          price,
          price,
          price,
          ts,
        );
      })
      .filter((ticker): ticker is Ticker => Boolean(ticker));
  }

  async fetchCandles(
    instrument: InstrumentMapping,
    timeframe: string,
    _limit: number,
  ): Promise<Candle[]> {
    this.logger.warn(
      JSON.stringify({
        event: 'brsapi_candles_unsupported',
        provider: this.provider,
        symbol: instrument.canonicalSymbol,
        timeframe,
      }),
    );
    return [];
  }

  private async getSnapshot(): Promise<Map<string, BrsApiItem>> {
    if (!this.apiKey) {
      if (!this.missingKeyLogged) {
        this.missingKeyLogged = true;
        this.logger.error(
          JSON.stringify({
            event: 'brsapi_missing_api_key',
            provider: this.provider,
          }),
        );
      }
      return new Map();
    }
    if (Date.now() - this.cacheTs < this.cacheTtlMs && this.cacheMap.size) {
      return this.cacheMap;
    }
    try {
      const response = await retry(
        () =>
          this.restClient.get('/Api/Market/Gold_Currency.php', {
            params: { key: this.apiKey },
          }),
        {
          attempts: this.retryAttempts,
          baseDelayMs: this.retryBaseDelayMs,
          shouldRetry: this.isRetryableError,
        },
      );
      const payload = response.data as BrsApiResponse;
      const items = [
        ...(payload.gold ?? []),
        ...(payload.currency ?? []),
        ...(payload.cryptocurrency ?? []),
      ];
      const map = new Map<string, BrsApiItem>();
      for (const item of items) {
        if (!item.symbol) {
          continue;
        }
        map.set(String(item.symbol).toUpperCase(), item);
      }
      this.cacheMap = map;
      this.cacheTs = Date.now();
      return map;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(
        JSON.stringify({
          event: 'brsapi_snapshot_failed',
          provider: this.provider,
          message,
        }),
      );
      return this.cacheMap;
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
