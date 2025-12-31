import { AxiosInstance } from 'axios';
import { createHttpClient } from '../utils/http.util';
import { BaseWsProvider } from './base-ws.provider';
import { Candle, ProviderInstrumentMapping, Ticker } from '../models';
import { getProviderEndpoints } from './providers.config';
import { toInterval } from './interval-mapper';

type TwelveDataWsPriceMsg =
  | { event: 'price'; symbol: string; price: string; timestamp?: number | string }
  | { event: 'subscribe-status'; status: 'ok' | 'error'; message?: string }
  | { event: 'error'; code?: number; message?: string }
  | Record<string, unknown>;

type TwelveDataQuoteResponse =
  | {
      status?: 'ok' | 'error';
      code?: number;
      message?: string;
      symbol?: string;
      price?: string;
      bid?: string;
      ask?: string;
      timestamp?: number | string;
    }
  | any;

type TwelveDataTimeSeriesResponse =
  | {
      status?: 'ok' | 'error';
      code?: number;
      message?: string;
      meta?: { symbol?: string };
      values?: Array<{
        datetime: string;
        open: string;
        high: string;
        low: string;
        close: string;
        volume?: string;
      }>;
    }
  | any;

const toNum = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = Number(String(v));
  return Number.isFinite(n) ? n : null;
};

const chunk = <T>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

export class TwelveDataMarketDataProvider extends BaseWsProvider {
  readonly name = 'twelvedata';

  supportsWebsocket = true;
  supportsTickers = true;
  supportsCandles = true;

  private readonly apiKey: string;
  private readonly maxSymbolsPerRequest: number;
  private readonly timeoutMs: number;
  private readonly restUrl: string;
  private readonly wsBaseUrl: string;

  private readonly http: AxiosInstance;

  private tickerMappings = new Map<string, ProviderInstrumentMapping>();

  constructor() {
    super('twelvedata', {
      // TwelveData doesn't require a special ping, but having one helps keep some proxies alive.
      pingIntervalMs: 25000,
      pingMessage: JSON.stringify({ action: 'ping' }),
      pingIsText: true,
    });

    const endpoints = getProviderEndpoints('twelvedata');
    this.restUrl = process.env.TWELVEDATA_REST_URL || endpoints.restBaseUrl;
    this.wsBaseUrl = process.env.TWELVEDATA_WS_URL || endpoints.wsBaseUrl;

    this.apiKey =
      process.env.TWELVEDATA_API_KEY ||
      process.env.TWELVE_DATA_API_KEY ||
      '';

    this.maxSymbolsPerRequest = Number(process.env.TWELVEDATA_MAX_SYMBOLS_PER_REQUEST || 20);
    this.timeoutMs = Number(process.env.TWELVEDATA_TIMEOUT_MS || 15000);

    this.http = createHttpClient(this.restUrl, this.timeoutMs);
  }

  protected buildUrl(): string {
    // TwelveData WS endpoint format:
    // wss://ws.twelvedata.com/v1/quotes/price?apikey=XXX
    const base = this.wsBaseUrl;
    const apikey = encodeURIComponent(this.apiKey || '');
    if (!apikey) return base; // will fail fast; but avoids crashing
    return `${base}?apikey=${apikey}`;
  }

  subscribeTickers(mappings: ProviderInstrumentMapping[]): void {
    this.tickerMappings = new Map(mappings.map((m) => [m.canonicalSymbol, m]));

    // If ws is already open, subscribe immediately
    if (this.isOpen()) {
      void this.subscribeAllCurrent();
    }
  }

  async connect(): Promise<void> {
    if (!this.apiKey) {
      this.logger.warn({ event: 'provider_missing_api_key', provider: this.name });
      return;
    }
    await super.connect();
  }

  protected async onOpen(): Promise<void> {
    await this.subscribeAllCurrent();
  }

  protected async onClose(code: number, reason: Buffer): Promise<void> {
    // no-op; base handles reconnect
    void code;
    void reason;
  }

  protected async onMessage(raw: string): Promise<void> {
    let msg: TwelveDataWsPriceMsg;
    try {
      msg = JSON.parse(raw) as TwelveDataWsPriceMsg;
    } catch {
      return;
    }

    const event = (msg as any)?.event;

    if (event === 'subscribe-status') {
      const status = (msg as any)?.status;
      if (status !== 'ok') {
        this.logger.warn({ event: 'twelvedata_subscribe_failed', provider: this.name, msg });
      }
      return;
    }

    if (event === 'error') {
      this.logger.warn({ event: 'twelvedata_ws_error', provider: this.name, msg });
      return;
    }

    if (event !== 'price') return;

    const symbol = String((msg as any).symbol || '');
    const price = toNum((msg as any).price);
    if (!symbol || price === null) return;

    // Map providerSymbol back to canonical mapping
    const mapping = [...this.tickerMappings.values()].find((m) => m.providerSymbol === symbol);
    if (!mapping) return;

    const tsRaw = (msg as any).timestamp;
    const ts =
      typeof tsRaw === 'number'
        ? tsRaw * 1000
        : typeof tsRaw === 'string' && /^\d+$/.test(tsRaw)
          ? Number(tsRaw) * 1000
          : Date.now();

    const ticker: Ticker = {
      provider: this.name,
      canonicalSymbol: mapping.canonicalSymbol,
      ts,
      last: price,
      // bid/ask unknown in this stream. Keep undefined (optional in Ticker model).
    };

    this.emit('ticker', ticker);
  }

  private async subscribeAllCurrent(): Promise<void> {
    const symbols = [...this.tickerMappings.values()]
      .map((m) => m.providerSymbol)
      .filter(Boolean);

    if (symbols.length === 0) return;

    // TwelveData expects a comma separated string
    for (const batch of chunk(symbols, Math.max(1, this.maxSymbolsPerRequest))) {
      const payload = {
        action: 'subscribe',
        params: { symbols: batch.join(',') },
      };
      this.send(JSON.stringify(payload));
    }
  }

  async fetchTickers(mappings: ProviderInstrumentMapping[]): Promise<Ticker[]> {
    if (!this.apiKey) return [];

    // Prefer REST quote for bid/ask if available
    const out: Ticker[] = [];
    const providerSymbols = mappings.map((m) => m.providerSymbol).filter(Boolean);

    for (const batch of chunk(providerSymbols, Math.max(1, this.maxSymbolsPerRequest))) {
      try {
        const res = await this.http.get<TwelveDataQuoteResponse>('/quote', {
          params: {
            symbol: batch.join(','),
            apikey: this.apiKey,
          },
        });

        const data = res.data;

        // TwelveData sometimes returns array/object depending on count.
        const items: any[] = Array.isArray(data) ? data : data?.symbol ? [data] : Object.values(data ?? {});

        for (const item of items) {
          if (!item) continue;
          if (item.status === 'error') {
            continue;
          }

          const ps = String(item.symbol || '');
          const mapping = mappings.find((m) => m.providerSymbol === ps);
          if (!mapping) continue;

          const bid = toNum(item.bid);
          const ask = toNum(item.ask);
          const last = toNum(item.price) ?? bid ?? ask;

          if (last === null) continue;

          const tsRaw = item.timestamp;
          const ts =
            typeof tsRaw === 'number'
              ? tsRaw * 1000
              : typeof tsRaw === 'string' && /^\d+$/.test(tsRaw)
                ? Number(tsRaw) * 1000
                : Date.now();

          const ticker: Ticker = {
            provider: this.name,
            canonicalSymbol: mapping.canonicalSymbol,
            ts,
            last,
            bid: bid ?? undefined,
            ask: ask ?? undefined,
          };

          out.push(ticker);
        }
      } catch (err: any) {
        this.logger.warn({
          event: 'twelvedata_fetch_quote_failed',
          provider: this.name,
          batchSize: batch.length,
          message: err?.message,
        });
      }
    }

    return out;
  }

  async fetchCandles(mapping: ProviderInstrumentMapping, interval: string, limit: number): Promise<Candle[]> {
    if (!this.apiKey) return [];

    const providerInterval = toInterval('twelvedata', interval);
    if (!providerInterval) return [];

    try {
      const res = await this.http.get<TwelveDataTimeSeriesResponse>('/time_series', {
        params: {
          symbol: mapping.providerSymbol,
          interval: providerInterval,
          outputsize: limit,
          apikey: this.apiKey,
        },
      });

      const data = res.data;
      if (!data || data.status === 'error') return [];

      const values = Array.isArray(data.values) ? data.values : [];
      // values are usually newest-first
      return values
        .map((v) => {
          const ts = Date.parse(v.datetime);
          const open = toNum(v.open);
          const high = toNum(v.high);
          const low = toNum(v.low);
          const close = toNum(v.close);
          const volume = toNum(v.volume);

          if (!Number.isFinite(ts) || open === null || high === null || low === null || close === null) return null;

          const c: Candle = {
            ts,
            open,
            high,
            low,
            close,
            volume: volume ?? undefined,
          };
          return c;
        })
        .filter(Boolean) as Candle[];
    } catch (err: any) {
      this.logger.warn({
        event: 'twelvedata_fetch_candles_failed',
        provider: this.name,
        symbol: mapping.providerSymbol,
        interval,
        limit,
        message: err?.message,
      });
      return [];
    }
  }
}