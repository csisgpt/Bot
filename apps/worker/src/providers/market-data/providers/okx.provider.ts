import axios, { AxiosInstance } from 'axios';
import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';
import {
  MarketDataCandle,
  MarketDataProvider,
  MarketDataTicker,
} from '../market-data-provider.interface';
import { MarketDataProviderBase } from '../market-data-provider.base';

const normalizeToOkxSymbol = (symbol: string): string => {
  if (symbol.includes('-')) {
    return symbol.toUpperCase();
  }
  const upper = symbol.toUpperCase();
  const suffixes = ['USDT', 'USDC', 'USD', 'BTC', 'ETH'];
  const match = suffixes.find((suffix) => upper.endsWith(suffix));
  if (!match) {
    return upper;
  }
  const base = upper.slice(0, -match.length);
  return `${base}-${match}`;
};

const normalizeFromOkxSymbol = (symbol: string): string => symbol.replace('-', '').toUpperCase();

@Injectable()
export class OkxMarketDataProvider
  extends MarketDataProviderBase
  implements MarketDataProvider
{
  name = 'okx';
  private readonly http: AxiosInstance;

  constructor(private readonly configService: ConfigService) {
    super('okx');
    const baseURL = this.configService.get<string>('OKX_REST_URL', 'https://www.okx.com');
    const timeout = this.configService.get<number>('OKX_REST_TIMEOUT_MS', 10000);
    this.http = axios.create({
      baseURL,
      timeout,
      headers: {
        'User-Agent': 'market-data-worker/1.0',
      },
    });
  }

  async getTickers(params: { symbols: string[] }): Promise<MarketDataTicker[]> {
    const symbols = params.symbols.map((symbol) => symbol.toUpperCase());
    if (symbols.length === 0) {
      return [];
    }
    const startedAt = Date.now();
    try {
      const response = await this.http.get('/api/v5/market/tickers', {
        params: {
          instType: 'SPOT',
        },
      });
      const list =
        (response.data as { data?: Array<Record<string, string>> })?.data ?? [];
      const normalized = list.map((item) => ({
        provider: this.name,
        symbol: normalizeFromOkxSymbol(String(item.instId)),
        price: Number(item.last),
        bid: Number(item.bidPx),
        ask: Number(item.askPx),
        ts: Date.now(),
      }));
      const filtered = normalized.filter((item) => symbols.includes(item.symbol));
      this.recordSuccess(Date.now() - startedAt);
      return filtered.filter((item) => Number.isFinite(item.price));
    } catch (error) {
      this.recordError(error);
      throw error;
    }
  }

  async getCandles(params: {
    symbol: string;
    interval: string;
    limit?: number;
  }): Promise<MarketDataCandle[]> {
    const startedAt = Date.now();
    try {
      const response = await this.http.get('/api/v5/market/candles', {
        params: {
          instId: normalizeToOkxSymbol(params.symbol),
          bar: params.interval,
          limit: params.limit ?? 200,
        },
      });
      const list =
        (response.data as { data?: Array<string[]> })?.data ?? [];
      const candles = list.map((item) => ({
        provider: this.name,
        symbol: params.symbol.toUpperCase(),
        interval: params.interval,
        ts: Number(item[0]),
        open: Number(item[1]),
        high: Number(item[2]),
        low: Number(item[3]),
        close: Number(item[4]),
        volume: Number(item[5]),
      }));
      this.recordSuccess(Date.now() - startedAt);
      return candles.filter((item) =>
        [item.open, item.high, item.low, item.close, item.volume].every((value) =>
          Number.isFinite(value),
        ),
      );
    } catch (error) {
      this.recordError(error);
      throw error;
    }
  }
}
