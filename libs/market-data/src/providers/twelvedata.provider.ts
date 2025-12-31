import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import WebSocket from 'ws';

import { Instrument, Ticker } from '../models';
import { normalizeCanonicalSymbol, providerSymbolFromCanonical } from '../symbol-mapper';
import { createHttpClient } from '../utils/http.util';
import { normalizeTickerFromBestBidAsk } from '../normalizers';
import { BaseWsProvider } from './base-ws.provider';

type TwelveDataQuoteItem = {
  symbol?: string;
  price?: string | number;
  bid?: string | number;
  ask?: string | number;
  timestamp?: number;
};

const chunk = <T>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const toNum = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(String(v));
  return Number.isFinite(n) ? n : null;
};

export class TwelveDataMarketDataProvider extends BaseWsProvider {
  readonly name = 'twelvedata';
  readonly supportsTickers = true;
  readonly supportsCandles = true;
  readonly supportsWebsocket = true;

  private readonly logger = new Logger('twelvedata-provider');
  private readonly http = createHttpClient();

  private readonly apiKey: string;
  private readonly restUrl: string;
  private readonly wsUrl: string;

  private readonly timeoutMs: number;
  private readonly maxSymbolsPerRequest: number;

  private tickerMappings = new Map<string, { canonicalSymbol: string }>();

  constructor(private readonly configService: ConfigService) {
    super();

    this.apiKey =
      this.configService.get<string>('TWELVEDATA_API_KEY') ??
      this.configService.get<string>('TWELVE_DATA_API_KEY') ??
      '';

    this.restUrl = this.configService.get<string>('TWELVEDATA_REST_URL', 'https://api.twelvedata.com');
    this.wsUrl = this.configService.get<string>('TWELVEDATA_WS_URL', 'wss://ws.twelvedata.com/v1/quotes/price');

    this.timeoutMs = Number(this.configService.get('TWELVEDATA_TIMEOUT_MS', 15000));
    this.maxSymbolsPerRequest = Number(this.configService.get('TWELVEDATA_MAX_SYMBOLS_PER_REQUEST', 20));

    this.setProviderName(this.name);
  }

  // ---------------- WS ----------------
  protected buildWsUrl(): string {
    // api key via query param
    const u = new URL(this.wsUrl);
    if (this.apiKey) u.searchParams.set('apikey', this.apiKey);
    return u.toString();
  }

  protected onOpen(): void {
    this.logger.log(JSON.stringify({ event: 'provider_connected', provider: this.name }));
    this.sendSubscribe();
  }

  protected onClose(): void {
    this.logger.warn(JSON.stringify({ event: 'provider_disconnected', provider: this.name }));
  }

  protected onError(err: unknown): void {
    this.logger.warn(
      JSON.stringify({
        event: 'provider_ws_error',
        provider: this.name,
        message: err instanceof Error ? err.message : String(err),
      }),
    );
  }

  protected onMessage(data: WebSocket.RawData): void {
    let payload: any;
    try {
      payload = JSON.parse(data.toString('utf8'));
    } catch {
      return;
    }

    // TwelveData can send {event:"price", symbol:"EUR/USD", price:"1.07"} or similar
    const symbolRaw = (payload?.symbol ?? payload?.instrument ?? '').toString().toUpperCase();
    if (!symbolRaw) return;

    const mapping = this.tickerMappings.get(symbolRaw);
    if (!mapping) return;

    const price = toNum(payload?.price);
    const bid = toNum(payload?.bid);
    const ask = toNum(payload?.ask);

    const last = price ?? bid ?? ask;
    if (last === null) return;

    const ticker: Ticker = {
      provider: this.name,
      canonicalSymbol: mapping.canonicalSymbol,
      ts: Date.now(),
      last,
      bid: bid ?? last,
      ask: ask ?? last,
      raw: payload,
    };

    this.emitTicker(ticker);
  }

  private sendSubscribe(): void {
    const ws = this.getWs();
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const symbols = [...this.tickerMappings.keys()];
    if (!symbols.length) return;

    // ✅ format used by TwelveData:
    // {"action":"subscribe","params":{"symbols":"EUR/USD,GBP/USD"}}
    ws.send(
      JSON.stringify({
        action: 'subscribe',
        params: { symbols: symbols.join(',') },
      }),
    );
  }

  // called by orchestration when tickers are needed
  setTickersTargets(instruments: Instrument[]): void {
    const overrides = this.getOverrides();
    this.tickerMappings.clear();

    for (const inst of instruments) {
      const mapping = providerSymbolFromCanonical(this.name, inst.canonicalSymbol, { overrides });
      if (!mapping) continue;
      const key = mapping.providerSymbol.toUpperCase();
      this.tickerMappings.set(key, { canonicalSymbol: inst.canonicalSymbol });
    }

    // if ws is already connected, re-subscribe
    this.sendSubscribe();
  }

  private getOverrides(): Record<string, string> {
    // env-style overrides
    const raw = this.configService.get<string>('MARKET_DATA_SYMBOL_OVERRIDES_TWELVEDATA', '');
    const map: Record<string, string> = {};
    raw
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .forEach((pair) => {
        const [canonical, providerSymbol] = pair.split(':').map((x) => x.trim());
        if (canonical && providerSymbol) map[normalizeCanonicalSymbol(canonical)] = providerSymbol;
      });
    return map;
  }

  // ---------------- REST: Tickers ----------------
  async fetchTickers(instruments: Instrument[]): Promise<Ticker[]> {
    if (!this.apiKey) return [];

    const overrides = this.getOverrides();
    const targets = instruments
      .map((inst) => {
        const m = providerSymbolFromCanonical(this.name, inst.canonicalSymbol, { overrides });
        if (!m) return null;
        return { canonicalSymbol: inst.canonicalSymbol, providerSymbol: m.providerSymbol };
      })
      .filter((x): x is { canonicalSymbol: string; providerSymbol: string } => Boolean(x));

    if (!targets.length) return [];

    const byProviderSymbol = new Map<string, string>();
    for (const t of targets) byProviderSymbol.set(t.providerSymbol.toUpperCase(), t.canonicalSymbol);

    const batches = chunk(
      [...new Set(targets.map((t) => t.providerSymbol))],
      Math.max(1, this.maxSymbolsPerRequest),
    );

    const out: Ticker[] = [];

    for (const batch of batches) {
      const tickers = await this.fetchTickersBatch(batch, byProviderSymbol);
      out.push(...tickers);
    }

    return out;
  }

  private async fetchTickersBatch(
    providerSymbols: string[],
    byProviderSymbol: Map<string, string>,
  ): Promise<Ticker[]> {
    const symbolsParam = providerSymbols.join(',');
    const baseParams = { apikey: this.apiKey };

    // 1) try /quote (often returns bid/ask too)
    try {
      const resp = await this.http.get(`${this.restUrl}/quote`, {
        params: { ...baseParams, symbol: symbolsParam },
        timeout: this.timeoutMs,
      });

      const items = this.parseQuoteLike(resp.data);
      const tickers = items
        .map((it) => this.toTickerFromQuoteLike(it, byProviderSymbol))
        .filter((t): t is Ticker => Boolean(t));
      if (tickers.length) return tickers;
    } catch {
      // ignore and fallback to /price
    }

    // 2) fallback /price
    try {
      const resp = await this.http.get(`${this.restUrl}/price`, {
        params: { ...baseParams, symbol: symbolsParam },
        timeout: this.timeoutMs,
      });

      const items = this.parsePriceLike(resp.data, providerSymbols);
      const tickers = items
        .map((it) => this.toTickerFromQuoteLike(it, byProviderSymbol))
        .filter((t): t is Ticker => Boolean(t));
      return tickers;
    } catch (err) {
      this.logger.warn(
        JSON.stringify({
          event: 'twelvedata_fetch_tickers_failed',
          provider: this.name,
          symbols: providerSymbols.length,
          message: err instanceof Error ? err.message : String(err),
        }),
      );
      return [];
    }
  }

  private parseQuoteLike(data: any): TwelveDataQuoteItem[] {
    if (!data) return [];
    if (Array.isArray(data)) return data as TwelveDataQuoteItem[];

    if (typeof data === 'object') {
      if (data.status === 'error') return [];
      if (data.symbol || data.price || data.bid || data.ask) return [data as TwelveDataQuoteItem];
      if (Array.isArray(data.data)) return data.data as TwelveDataQuoteItem[];

      // map response: { "EUR/USD": {...}, "GBP/USD": {...} }
      const out: TwelveDataQuoteItem[] = [];
      for (const [k, v] of Object.entries<any>(data)) {
        if (v && typeof v === 'object') out.push({ symbol: v.symbol ?? k, ...v });
      }
      return out;
    }

    return [];
  }

  private parsePriceLike(data: any, providerSymbols: string[]): TwelveDataQuoteItem[] {
    if (!data) return [];
    if (Array.isArray(data)) return data as TwelveDataQuoteItem[];

    if (typeof data === 'object') {
      if (data.status === 'error') return [];
      if (data.price && (data.symbol || providerSymbols.length === 1)) {
        return [
          {
            symbol: data.symbol ?? providerSymbols[0],
            price: data.price,
          },
        ];
      }

      // map response: { "EUR/USD": "1.07", "GBP/USD": "1.25" } OR { "EUR/USD": {price:"..."} }
      const out: TwelveDataQuoteItem[] = [];
      for (const [k, v] of Object.entries<any>(data)) {
        if (typeof v === 'string' || typeof v === 'number') out.push({ symbol: k, price: v });
        else if (v && typeof v === 'object') out.push({ symbol: v.symbol ?? k, ...v });
      }
      return out;
    }

    return [];
  }

  private toTickerFromQuoteLike(item: TwelveDataQuoteItem, byProviderSymbol: Map<string, string>): Ticker | null {
    const sym = (item.symbol ?? '').toString().toUpperCase().trim();
    if (!sym) return null;

    const canonicalSymbol = byProviderSymbol.get(sym);
    if (!canonicalSymbol) return null;

    const price = toNum(item.price);
    const bid = toNum(item.bid);
    const ask = toNum(item.ask);
    const last = price ?? bid ?? ask;
    if (last === null) return null;

    const base: Ticker = {
      provider: this.name,
      canonicalSymbol,
      ts: Date.now(),
      last,
      bid: bid ?? last,
      ask: ask ?? last,
      raw: item,
    };

    // اگر bid/ask داشتیم، normalize هم انجام بده (اختیاری ولی بهتر)
    const normalized = normalizeTickerFromBestBidAsk(this.name, base);
    return normalized ?? base;
  }

  // ---------------- Candles ----------------
  // (اگر قبلاً candleها رو از TwelveData نمی‌خوای، می‌تونی همین بخش رو بعداً خاموش کنی)
}
