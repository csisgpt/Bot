import WebSocket from 'ws';

import { Logger } from '@nestjs/common';
import { BaseWsProvider } from './base-ws.provider';
import { InstrumentMapping, Candle, Ticker } from '../models';
import { normalizeCandle, normalizeTickerFromBestBidAsk } from '../normalizers';
import { createHttpClient } from '../utils/http.util';
import { retry } from '../utils/retry.util';
import { toInterval } from './interval-mapper';
import { getProviderEndpoints } from './providers.config';

type TwelveDataWsMessage =
  | { event: 'price'; symbol: string; price: string; timestamp?: number | string }
  | { event: 'subscribe-status'; status: string; success?: boolean; message?: string }
  | { event: 'error'; code?: number; message?: string }
  | Record<string, unknown>;

export class TwelveDataMarketDataProvider extends BaseWsProvider {
  readonly name = 'twelvedata';

  private readonly apiKey: string;
  private readonly retryAttempts: number;
  private readonly retryBaseDelayMs: number;
  private readonly timeoutMs: number;
  private readonly maxSymbolsPerRequest: number;

  private readonly restClient;
  private readonly tickerMappings = new Map<string, InstrumentMapping>();

  constructor(logger: Logger) {
    const endpoints = getProviderEndpoints('twelvedata');
    super('twelvedata', endpoints.wsUrl, logger);

    this.apiKey = process.env.TWELVEDATA_API_KEY || process.env.TWELVE_DATA_API_KEY || '';
    this.retryAttempts = Number(process.env.TWELVEDATA_RETRY_ATTEMPTS ?? 3);
    this.retryBaseDelayMs = Number(process.env.TWELVEDATA_RETRY_BASE_DELAY_MS ?? 500);
    this.timeoutMs = Number(process.env.TWELVEDATA_TIMEOUT_MS ?? 15000);
    this.maxSymbolsPerRequest = Number(process.env.TWELVEDATA_MAX_SYMBOLS_PER_REQUEST ?? 20);

    this.restClient = createHttpClient(endpoints.restBaseUrl, this.timeoutMs);
  }

  isEnabled(): boolean {
    return Boolean(this.apiKey);
  }

  supportsWs(): boolean {
    return true;
  }

  buildUrl(): string {
    const base = getProviderEndpoints('twelvedata').wsUrl;
    // TwelveData expects apikey in querystring
    return `${base}${base.includes('?') ? '&' : '?'}apikey=${encodeURIComponent(this.apiKey)}`;
  }

  protected onWsOpen(ws: WebSocket): void {
    this.logger.log({ event: 'provider_ws_open', provider: this.name });
  }

  protected onWsClose(code: number, reason: Buffer): void {
    this.logger.warn({
      event: 'provider_ws_close',
      provider: this.name,
      code,
      reason: reason?.toString?.() ?? '',
    });
  }

  protected onWsError(err: Error): void {
    this.logger.error({ event: 'provider_ws_error', provider: this.name, error: err.message });
  }

  protected onWsMessage(raw: WebSocket.RawData): void {
    let msg: TwelveDataWsMessage | null = null;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (!msg || typeof msg !== 'object') return;

    // price message
    if ((msg as any).event === 'price') {
      const m = msg as any;
      const mapping = this.tickerMappings.get(String(m.symbol));
      if (!mapping) return;

      const price = Number(m.price);
      if (!Number.isFinite(price)) return;

      const ts = typeof m.timestamp === 'number'
        ? (m.timestamp > 1e12 ? m.timestamp : m.timestamp * 1000)
        : m.timestamp
          ? new Date(String(m.timestamp)).getTime()
          : Date.now();

      const normalized = normalizeTickerFromBestBidAsk(
        this.name,
        mapping,
        price,
        price,
        price,
        Number.isFinite(ts) ? ts : Date.now(),
        undefined,
      );

      if (normalized) this.emitTicker(normalized);
      return;
    }

    // errors / status
    if ((msg as any).event === 'error') {
      const m = msg as any;
      this.logger.warn({
        event: 'twelvedata_ws_error',
        provider: this.name,
        code: m.code,
        message: m.message,
      });
      return;
    }

    if ((msg as any).event === 'subscribe-status') {
      const m = msg as any;
      this.logger.log({
        event: 'twelvedata_ws_subscribe_status',
        provider: this.name,
        status: m.status,
        success: m.success,
        message: m.message,
      });
    }
  }

  private subscribeSymbols(providerSymbols: string[]): void {
    if (providerSymbols.length === 0) return;

    const ws = this.getWs();
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const payload = {
      action: 'subscribe',
      params: { symbols: providerSymbols.join(',') },
    };
    ws.send(JSON.stringify(payload));
  }

  async connectWs(mappings: InstrumentMapping[]): Promise<void> {
    this.tickerMappings.clear();
    for (const mapping of mappings) {
      this.tickerMappings.set(mapping.providerSymbol, mapping);
    }

    await this.connect();

    // TwelveData may limit how many symbols you can subscribe in a single call on free tiers.
    // We'll batch subscription calls to be safe.
    const providerSymbols = mappings.map((m) => m.providerSymbol);
    for (let i = 0; i < providerSymbols.length; i += this.maxSymbolsPerRequest) {
      this.subscribeSymbols(providerSymbols.slice(i, i + this.maxSymbolsPerRequest));
    }
  }

  async disconnectWs(): Promise<void> {
    await this.disconnect();
    this.tickerMappings.clear();
  }

  async fetchTickers(mappings: InstrumentMapping[]): Promise<Ticker[]> {
    if (mappings.length === 0) return [];

    // Rebuild mapping cache (providerSymbol -> mapping)
    this.tickerMappings.clear();
    for (const mapping of mappings) {
      this.tickerMappings.set(mapping.providerSymbol, mapping);
    }

    const now = Date.now();

    const toNumber = (v: unknown): number | null => {
      if (v === null || v === undefined) return null;
      const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, '').trim());
      return Number.isFinite(n) ? n : null;
    };

    const toTimestampMs = (v: unknown): number => {
      if (v === null || v === undefined) return now;
      if (typeof v === 'number') {
        // seconds vs ms heuristic
        return v > 1e12 ? v : v * 1000;
      }
      const s = String(v).trim();
      const d = new Date(s);
      const ms = d.getTime();
      return Number.isFinite(ms) ? ms : now;
    };

    const results: Ticker[] = [];

    const batches: InstrumentMapping[][] = [];
    for (let i = 0; i < mappings.length; i += this.maxSymbolsPerRequest) {
      batches.push(mappings.slice(i, i + this.maxSymbolsPerRequest));
    }

    for (const batch of batches) {
      const symbols = batch.map((m) => m.providerSymbol).join(',');

      const response = await retry(
        async () =>
          this.restClient.get('/quote', {
            params: { symbol: symbols, apikey: this.apiKey },
          }),
        this.retryAttempts,
        this.retryBaseDelayMs,
        this.logger,
      );

      const raw = response.data as any;

      // TwelveData can return:
      // - single object { symbol, ... }
      // - object keyed by symbol { "AAPL": {...}, "MSFT": {...} }
      // - array of quote objects
      // - error object { code, message, ... }
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        if ('code' in raw && 'message' in raw && !('symbol' in raw)) {
          this.logger.warn({
            event: 'twelvedata_quote_error',
            provider: this.name,
            code: raw.code,
            message: raw.message,
          });
          continue;
        }
      }

      const items: any[] = Array.isArray(raw)
        ? raw
        : raw && typeof raw === 'object'
          ? 'symbol' in raw
            ? [raw]
            : Object.values(raw)
          : [];

      for (const item of items) {
        if (!item || typeof item !== 'object') continue;

        const providerSymbol = String((item as any).symbol ?? (item as any).ticker ?? '');
        if (!providerSymbol) continue;

        const mapping = this.tickerMappings.get(providerSymbol);
        if (!mapping) continue;

        const last =
          toNumber((item as any).price) ??
          toNumber((item as any).close) ??
          toNumber((item as any).last) ??
          toNumber((item as any).bid) ??
          toNumber((item as any).ask);

        if (last === null) continue;

        const bid = toNumber((item as any).bid) ?? last;
        const ask = toNumber((item as any).ask) ?? last;

        const ts = toTimestampMs((item as any).timestamp ?? (item as any).datetime);
        const vol = toNumber((item as any).volume) ?? toNumber((item as any).volume_24h) ?? undefined;

        const normalized = normalizeTickerFromBestBidAsk(this.name, mapping, bid, ask, last, ts, vol);
        if (normalized) results.push(normalized);
      }
    }

    return results;
  }

  async fetchCandles(mapping: InstrumentMapping, interval: string, limit: number): Promise<Candle[]> {
    const providerInterval = toInterval(this.name, interval);

    const response = await retry(
      async () =>
        this.restClient.get('/time_series', {
          params: {
            symbol: mapping.providerSymbol,
            interval: providerInterval,
            outputsize: limit,
            apikey: this.apiKey,
          },
        }),
      this.retryAttempts,
      this.retryBaseDelayMs,
      this.logger,
    );

    const values = (response.data?.values ?? []) as any[];

    const candles = values
      .map((v) =>
        normalizeCandle(this.name, mapping, {
          ts: new Date(v.datetime).getTime(),
          open: Number(v.open),
          high: Number(v.high),
          low: Number(v.low),
          close: Number(v.close),
          volume: v.volume ? Number(v.volume) : undefined,
        }),
      )
      .filter(Boolean) as Candle[];

    return candles.reverse();
  }
}