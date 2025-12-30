import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MarketDataCandle, MarketDataProvider, MarketDataTicker } from '../market-data-provider.interface';
import { MarketDataProviderBase } from '../market-data-provider.base';
import { canonicalizeSymbol, splitSymbol } from '../utils/canonicalize';
import { createProviderHttp, retry } from '../utils/http';

const BASE_ALIASES: Record<string, string> = {
  BTC: 'XBT',
};

const mapInterval = (interval: string): number => {
  const mapping: Record<string, number> = {
    '1m': 1,
    '5m': 5,
    '15m': 15,
    '30m': 30,
    '1h': 60,
    '4h': 240,
    '1d': 1440,
  };
  return mapping[interval] ?? 1;
};

const toKrakenPair = (symbol: string): string => {
  const parts = splitSymbol(symbol);
  if (!parts) {
    return canonicalizeSymbol(symbol);
  }
  const base = BASE_ALIASES[parts.base] ?? parts.base;
  return `${base}${parts.quote}`;
};

@Injectable()
export class KrakenMarketDataProvider
  extends MarketDataProviderBase
  implements MarketDataProvider
{
  name = 'kraken';
  private readonly http;

  constructor(private readonly configService: ConfigService) {
    super('kraken');
    const baseURL = this.configService.get<string>('KRAKEN_REST_URL', 'https://api.kraken.com');
    const timeout = this.configService.get<number>('KRAKEN_REST_TIMEOUT_MS', 10000);
    this.http = createProviderHttp(baseURL, timeout);
  }

  async getTickers(params: { symbols: string[] }): Promise<MarketDataTicker[]> {
    const symbols = params.symbols.map((symbol) => canonicalizeSymbol(symbol));
    const startedAt = Date.now();
    try {
      const results = await Promise.all(
        symbols.map(async (symbol) => {
          const pair = toKrakenPair(symbol);
          const response = await retry(() => this.http.get('/0/public/Ticker', { params: { pair } }));
          const result = response.data?.result ?? {};
          const data = result[Object.keys(result)[0]] as {
            a?: string[];
            b?: string[];
            c?: string[];
          };
          const bid = Number(data?.b?.[0]);
          const ask = Number(data?.a?.[0]);
          const last = Number(data?.c?.[0]);
          return {
            provider: this.name,
            symbol,
            last: Number.isFinite(last) ? last : (bid + ask) / 2,
            bid,
            ask,
            time: Date.now(),
          };
        }),
      );
      this.recordSuccess(Date.now() - startedAt);
      return results.filter((item) => Number.isFinite(item.last));
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
      const pair = toKrakenPair(params.symbol);
      const response = await retry(() =>
        this.http.get('/0/public/OHLC', {
          params: { pair, interval: mapInterval(params.interval) },
        }),
      );
      const result = response.data?.result ?? {};
      const series = result[Object.keys(result)[0]] as Array<string[]>;
      const candles = (series ?? []).slice(0, params.limit ?? series?.length ?? 0).map((item) => ({
        provider: this.name,
        symbol: canonicalizeSymbol(params.symbol),
        interval: params.interval,
        ts: Number(item[0]) * 1000,
        open: Number(item[1]),
        high: Number(item[2]),
        low: Number(item[3]),
        close: Number(item[4]),
        volume: Number(item[6]),
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
