// libs/market-data/src/providers/twelvedata.provider.ts

import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { InstrumentMapping, Ticker } from '../models';

@Injectable()
export class TwelvedataMarketDataProvider {
  readonly name = 'twelvedata';
  private readonly logger = new Logger('twelvedata-provider');
  private readonly http: AxiosInstance;

  constructor() {
    this.http = axios.create({
      baseURL: process.env.TWELVEDATA_REST_URL ?? 'https://api.twelvedata.com',
      timeout: Number(process.env.TWELVEDATA_TIMEOUT_MS ?? 15000),
    });
  }

  /**
   * Snapshot price fetch (برای Feed قیمت‌ها)
   */
  async fetchTickers(mappings: InstrumentMapping[]): Promise<Ticker[]> {
    if (!mappings.length) return [];

    const apiKey = process.env.TWELVEDATA_API_KEY;
    if (!apiKey) {
      this.logger.warn('TWELVEDATA_API_KEY is missing');
      return [];
    }

    const symbols = mappings.map((m) => m.providerSymbol).filter(Boolean);
    if (!symbols.length) return [];

    try {
      const res = await this.http.get('/price', {
        params: {
          apikey: apiKey,
          symbol: symbols.join(','),
          format: 'JSON',
        },
      });

      const data = res.data;

      // ❗️ error واقعی
      if (data?.status === 'error' || data?.code || data?.message) {
        throw new Error(JSON.stringify(data));
      }

      const now = Date.now();
      const byProviderSymbol = new Map(mappings.map((m) => [m.providerSymbol, m]));
      const tickers: Ticker[] = [];

      // Single symbol response
      if (symbols.length === 1 && typeof data?.price === 'string') {
        const last = Number(data.price);
        if (Number.isFinite(last)) {
          const m = mappings[0];
          tickers.push({
            provider: this.name,
            canonicalSymbol: m.canonicalSymbol,
            ts: now,
            last,
            bid: last,
            ask: last,
          });
        }
        return tickers;
      }

      // Multi symbol response
      for (const s of symbols) {
        const entry = data?.[s];
        const priceRaw = typeof entry === 'string' ? entry : entry?.price;
        const last = Number(priceRaw);

        if (!Number.isFinite(last)) continue;

        const m = byProviderSymbol.get(s);
        if (!m) continue;

        tickers.push({
          provider: this.name,
          canonicalSymbol: m.canonicalSymbol,
          ts: now,
          last,
          bid: last,
          ask: last,
        });
      }

      return tickers;
    } catch (err: any) {
      this.logger.warn({
        event: 'fetch_tickers_failed',
        symbols,
        message: err?.message ?? err,
      });
      return [];
    }
  }

  /**
   * WS subscribe
   * ❌ heartbeat حذف شده (باعث disconnect می‌شد)
   */
  subscribeTickers(ws: WebSocket, symbols: string[]) {
    if (!symbols.length) return;

    ws.send(
      JSON.stringify({
        action: 'subscribe',
        params: {
          symbols,
        },
      }),
    );
  }
}