import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MarketDataCandle, MarketDataProvider, MarketDataTicker } from '../market-data-provider.interface';
import { MarketDataProviderBase } from '../market-data-provider.base';
import { canonicalizeSymbol, joinSymbol } from '../utils/canonicalize';
import { createProviderHttp, retry } from '../utils/http';

const mapGranularity = (interval: string): number => {
  const mapping: Record<string, number> = {
    '1m': 60,
    '5m': 300,
    '15m': 900,
    '30m': 1800,
    '1h': 3600,
    '4h': 14400,
    '1d': 86400,
  };
  return mapping[interval] ?? 60;
};

@Injectable()
export class CoinbaseMarketDataProvider
  extends MarketDataProviderBase
  implements MarketDataProvider
{
  name = 'coinbase';
  private readonly http;

  constructor(private readonly configService: ConfigService) {
    super('coinbase');
    const baseURL = this.configService.get<string>(
      'COINBASE_REST_URL',
      'https://api.exchange.coinbase.com',
    );
    const timeout = this.configService.get<number>('COINBASE_REST_TIMEOUT_MS', 10000);
    this.http = createProviderHttp(baseURL, timeout);
  }

  async getTickers(params: { symbols: string[] }): Promise<MarketDataTicker[]> {
    const symbols = params.symbols.map((symbol) => canonicalizeSymbol(symbol));
    const startedAt = Date.now();
    try {
      const results = await Promise.all(
        symbols.map(async (symbol) => {
          const productId = joinSymbol(symbol, '-');
          const response = await retry(() => this.http.get(`/products/${productId}/ticker`));
          const data = response.data as {
            price: string;
            bid: string;
            ask: string;
            time: string;
          };
          return {
            provider: this.name,
            symbol,
            last: Number(data.price),
            bid: Number(data.bid),
            ask: Number(data.ask),
            time: data.time ? Date.parse(data.time) : Date.now(),
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
      const productId = joinSymbol(params.symbol, '-');
      const response = await retry(() =>
        this.http.get(`/products/${productId}/candles`, {
          params: {
            granularity: mapGranularity(params.interval),
            limit: params.limit ?? 200,
          },
        }),
      );
      const candles = (response.data as Array<[number, number, number, number, number, number]>).map(
        (item) => ({
          provider: this.name,
          symbol: canonicalizeSymbol(params.symbol),
          interval: params.interval,
          ts: item[0] * 1000,
          low: Number(item[1]),
          high: Number(item[2]),
          open: Number(item[3]),
          close: Number(item[4]),
          volume: Number(item[5]),
        }),
      );
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
