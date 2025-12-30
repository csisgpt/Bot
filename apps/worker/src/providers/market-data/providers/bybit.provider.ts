import { AxiosInstance } from 'axios';
import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';
import {
  MarketDataCandle,
  MarketDataProvider,
  MarketDataTicker,
} from '../market-data-provider.interface';
import { MarketDataProviderBase } from '../market-data-provider.base';
import { canonicalizeSymbol } from '../utils/canonicalize';
import { createProviderHttp, retry } from '../utils/http';

const mapIntervalToBybit = (interval: string): string => {
  const normalized = interval.toLowerCase();
  const map: Record<string, string> = {
    '1m': '1',
    '3m': '3',
    '5m': '5',
    '15m': '15',
    '30m': '30',
    '1h': '60',
    '2h': '120',
    '4h': '240',
    '6h': '360',
    '12h': '720',
    '1d': 'D',
    '1w': 'W',
    '1mo': 'M',
  };
  return map[normalized] ?? interval;
};

@Injectable()
export class BybitMarketDataProvider
  extends MarketDataProviderBase
  implements MarketDataProvider
{
  name = 'bybit';
  private readonly http: AxiosInstance;

  constructor(private readonly configService: ConfigService) {
    super('bybit');
    const baseURL = this.configService.get<string>('BYBIT_REST_URL', 'https://api.bybit.com');
    const timeout = this.configService.get<number>('BYBIT_REST_TIMEOUT_MS', 10000);
    this.http = createProviderHttp(baseURL, timeout);
  }

  async getTickers(params: { symbols: string[] }): Promise<MarketDataTicker[]> {
    const symbols = params.symbols.map((symbol) => canonicalizeSymbol(symbol));
    if (symbols.length === 0) {
      return [];
    }
    const startedAt = Date.now();
    try {
      const response = await retry(() =>
        this.http.get('/v5/market/tickers', {
          params: {
            category: 'spot',
          },
        }),
      );
      const list =
        (response.data as { result?: { list?: Array<Record<string, string>> } })?.result?.list ?? [];
      const filtered = list.filter((item) => symbols.includes(String(item.symbol).toUpperCase()));
      const tickers = filtered.map((item) => ({
        provider: this.name,
        symbol: canonicalizeSymbol(String(item.symbol)),
        last: Number(item.lastPrice),
        bid: Number(item.bid1Price),
        ask: Number(item.ask1Price),
        time: Date.now(),
      }));
      this.recordSuccess(Date.now() - startedAt);
      return tickers.filter((item) => Number.isFinite(item.last));
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
      const response = await retry(() =>
        this.http.get('/v5/market/kline', {
          params: {
            category: 'spot',
            symbol: canonicalizeSymbol(params.symbol),
            interval: mapIntervalToBybit(params.interval),
            limit: params.limit ?? 200,
          },
        }),
      );
      const list =
        (response.data as { result?: { list?: Array<string[]> } })?.result?.list ?? [];
      const candles = list.map((item) => ({
        provider: this.name,
        symbol: canonicalizeSymbol(params.symbol),
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
