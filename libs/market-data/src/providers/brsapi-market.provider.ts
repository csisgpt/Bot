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

  // Cache snapshot to reduce requests
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

    // Prefer alias-aware env reads
    this.apiKey =
      (getEnvFirst('BRSAPI_MARKET_API_KEY', 'BRSAPI_API_KEY') ??
        configService.get<string>('BRSAPI_MARKET_API_KEY', '')).trim();

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
    if (!instruments.length) return [];

    const snapshot = await this.getMarketSnapshot();
    if (!snapshot.size) return [];

    return instruments
      .map((mapping) => {
        // providerInstId expected like: USD, EUR, IR_GOLD_18K, IR_COIN_EMAMI, ...
        const key = String(mapping.providerInstId ?? '').trim().toUpperCase();
        if (!key) return null;

        const item = snapshot.get(key);
        if (!item) return null;

        const priceToman = this.normalizeBrsApiPriceToToman(item);
        if (priceToman === null) return null;

        const ts =
          Number.isFinite(item.time_unix) && (item.time_unix as number) > 0
            ? (item.time_unix as number) * 1000
            : Date.now();

        return normalizeTickerFromBestBidAsk(
          this.provider,
          mapping,
          priceToman,
          priceToman,
          priceToman,
          ts,
        );
      })
      .filter((t): t is Ticker => Boolean(t));
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

  /**
   * Fetches a snapshot (gold/currency/crypto) and caches it.
   * IMPORTANT: do NOT name this getSnapshot() because BaseRestProvider already has getSnapshot(): ProviderSnapshot
   */
  private async getMarketSnapshot(): Promise<Map<string, BrsApiItem>> {
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

    const now = Date.now();
    if (now - this.cacheTs < this.cacheTtlMs && this.cacheMap.size) {
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

      const items: BrsApiItem[] = [
        ...(Array.isArray(payload?.gold) ? payload.gold! : []),
        ...(Array.isArray(payload?.currency) ? payload.currency! : []),
        ...(Array.isArray(payload?.cryptocurrency) ? payload.cryptocurrency! : []),
      ];

      const map = new Map<string, BrsApiItem>();
      for (const item of items) {
        const sym = String(item?.symbol ?? '').trim();
        if (!sym) continue;
        map.set(sym.toUpperCase(), item);
      }

      // update provider health fields
      this.lastMessageTs = now;
      this.lastError = null;

      this.cacheMap = map;
      this.cacheTs = now;
      return map;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.failures += 1;
      this.lastError = message;

      this.logger.warn(
        JSON.stringify({
          event: 'brsapi_snapshot_failed',
          provider: this.provider,
          message,
        }),
      );

      // return stale cache if we have it
      return this.cacheMap;
    }
  }

  /**
   * Converts BrsApi item price to TOMAN (number) based on unit.
   * Handles:
   * - "ریال" => /10
   * - "هزار ریال" => *100
   * - "هزار تومان" => *1000
   * Also parses comma-separated and Persian digits safely.
   */
  private normalizeBrsApiPriceToToman(item: BrsApiItem): number | null {
    const raw = this.parseNumber(item.price);
    if (!Number.isFinite(raw) || raw <= 0) return null;

    const unit = String(item.unit ?? '').trim();
    let price = raw;

    // ریال => تومان
    if (unit.includes('ریال') && !unit.includes('هزار')) {
      price = raw / 10;
    }

    // هزار ریال => تومان (1000 ریال = 100 تومان)
    if (unit.includes('هزار') && unit.includes('ریال')) {
      price = raw * 100;
    }

    // هزار تومان => تومان
    if (unit.includes('هزار') && unit.includes('تومان')) {
      price = raw * 1000;
    }

    // if unit missing, keep a VERY conservative heuristic:
    // extremely large numbers are often rial
    if (!unit && raw >= 1_000_000_000) {
      price = raw / 10;
    }

    if (!Number.isFinite(price) || price <= 0) return null;
    return price;
  }

  private parseNumber(v: unknown): number {
    if (typeof v === 'number') return v;
    if (typeof v !== 'string') return NaN;

    // normalize Persian/Arabic digits -> English, remove separators
    const normalized = v
      .trim()
      .replace(/[٬,]/g, '') // Persian comma + comma
      .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
      .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))); // Arabic-Indic

    return Number(normalized);
  }

  private isRetryableError(error: unknown): boolean {
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (!status) return true;
    return status >= 500 || status === 429;
  }
}
