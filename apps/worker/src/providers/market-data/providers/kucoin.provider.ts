import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MarketDataCandle, MarketDataProvider, MarketDataTicker } from '../market-data-provider.interface';
import { MarketDataProviderBase } from '../market-data-provider.base';
import { canonicalizeSymbol, joinSymbol } from '../utils/canonicalize';
import { createProviderHttp, retry } from '../utils/http';

const mapInterval = (interval: string): string => {
  const mapping: Record<string, string> = {
    '1m': '1min',
    '5m': '5min',
    '15m': '15min',
    '30m': '30min',
    '1h': '1hour',
    '4h': '4hour',
    '1d': '1day',
  };
  return mapping[interval] ?? '1min';
};

@Injectable()
export class KucoinMarketDataProvider
  extends MarketDataProviderBase
  implements MarketDataProvider
{
  name = 'kucoin';
  private readonly http;

  constructor(private readonly configService: ConfigService) {
    super('kucoin');
    const baseURL = this.configService.get<string>('KUCOIN_REST_URL', 'https://api.kucoin.com');
    const timeout = this.configService.get<number>('KUCOIN_REST_TIMEOUT_MS', 10000);
    this.http = createProviderHttp(baseURL, timeout);
  }

  async getTickers(params: { symbols: string[] }): Promise<MarketDataTicker[]> {
    const symbols = params.symbols.map((symbol) => canonicalizeSymbol(symbol));
    const startedAt = Date.now();
    try {
      const results = await Promise.all(
        symbols.map(async (symbol) => {
          const productId = joinSymbol(symbol, '-');
          const response = await retry(() =>
            this.http.get('/api/v1/market/orderbook/level1', {
              params: { symbol: productId },
            }),
          );
          const data = response.data?.data ?? {};
          const bid = Number(data.bestBid);
          const ask = Number(data.bestAsk);
          const last = Number(data.price);
          return {
            provider: this.name,
            symbol,
            last: Number.isFinite(last) ? last : (bid + ask) / 2,
            bid,
            ask,
            time: Number(data.time) || Date.now(),
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
        this.http.get('/api/v1/market/candles', {
          params: {
            symbol: productId,
            type: mapInterval(params.interval),
          },
        }),
      );
      const data = response.data?.data ?? [];
      const candles = (data as Array<string[]>).slice(0, params.limit ?? data.length).map((item) => ({
        provider: this.name,
        symbol: canonicalizeSymbol(params.symbol),
        interval: params.interval,
        ts: Number(item[0]) * 1000,
        open: Number(item[1]),
        close: Number(item[2]),
        high: Number(item[3]),
        low: Number(item[4]),
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
