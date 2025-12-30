import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MarketDataCandle, MarketDataProvider, MarketDataTicker } from '../market-data-provider.interface';
import { MarketDataProviderBase } from '../market-data-provider.base';
import { canonicalizeSymbol, joinSymbol } from '../utils/canonicalize';
import { createProviderHttp, retry } from '../utils/http';

const mapInterval = (interval: string): string => {
  const mapping: Record<string, string> = {
    '1m': '1m',
    '5m': '5m',
    '15m': '15m',
    '30m': '30m',
    '1h': '1h',
    '4h': '4h',
    '1d': '1d',
  };
  return mapping[interval] ?? '1m';
};

@Injectable()
export class GateioMarketDataProvider
  extends MarketDataProviderBase
  implements MarketDataProvider
{
  name = 'gateio';
  private readonly http;

  constructor(private readonly configService: ConfigService) {
    super('gateio');
    const baseURL = this.configService.get<string>('GATEIO_REST_URL', 'https://api.gateio.ws/api/v4');
    const timeout = this.configService.get<number>('GATEIO_REST_TIMEOUT_MS', 10000);
    this.http = createProviderHttp(baseURL, timeout);
  }

  async getTickers(params: { symbols: string[] }): Promise<MarketDataTicker[]> {
    const symbols = params.symbols.map((symbol) => canonicalizeSymbol(symbol));
    const startedAt = Date.now();
    try {
      const results = await Promise.all(
        symbols.map(async (symbol) => {
          const pair = joinSymbol(symbol, '_');
          const response = await retry(() =>
            this.http.get('/spot/tickers', {
              params: { currency_pair: pair },
            }),
          );
          const data = (response.data as Array<Record<string, string>>)?.[0] ?? {};
          const bid = Number(data.highest_bid ?? data.bid);
          const ask = Number(data.lowest_ask ?? data.ask);
          const last = Number(data.last);
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
      const pair = joinSymbol(params.symbol, '_');
      const response = await retry(() =>
        this.http.get('/spot/candlesticks', {
          params: {
            currency_pair: pair,
            interval: mapInterval(params.interval),
            limit: params.limit ?? 200,
          },
        }),
      );
      const data = response.data as Array<string[]>;
      const candles = (data ?? []).map((item) => ({
        provider: this.name,
        symbol: canonicalizeSymbol(params.symbol),
        interval: params.interval,
        ts: Number(item[0]) * 1000,
        volume: Number(item[1]),
        close: Number(item[2]),
        high: Number(item[3]),
        low: Number(item[4]),
        open: Number(item[5]),
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
