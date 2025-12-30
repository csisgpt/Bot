import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MarketDataCandle, MarketDataProvider, MarketDataTicker } from '../market-data-provider.interface';
import { MarketDataProviderBase } from '../market-data-provider.base';
import { canonicalizeSymbol } from '../utils/canonicalize';
import { createProviderHttp, retry } from '../utils/http';

@Injectable()
export class MexcMarketDataProvider
  extends MarketDataProviderBase
  implements MarketDataProvider
{
  name = 'mexc';
  private readonly http;

  constructor(private readonly configService: ConfigService) {
    super('mexc');
    const baseURL = this.configService.get<string>('MEXC_REST_URL', 'https://api.mexc.com');
    const timeout = this.configService.get<number>('MEXC_REST_TIMEOUT_MS', 10000);
    this.http = createProviderHttp(baseURL, timeout);
  }

  async getTickers(params: { symbols: string[] }): Promise<MarketDataTicker[]> {
    const symbols = params.symbols.map((symbol) => canonicalizeSymbol(symbol));
    const startedAt = Date.now();
    try {
      const results = await Promise.all(
        symbols.map(async (symbol) => {
          const response = await retry(() =>
            this.http.get('/api/v3/ticker/bookTicker', {
              params: { symbol },
            }),
          );
          const data = response.data as { bidPrice?: string; askPrice?: string };
          const bid = Number(data.bidPrice);
          const ask = Number(data.askPrice);
          return {
            provider: this.name,
            symbol,
            last: Number.isFinite(bid) && Number.isFinite(ask) ? (bid + ask) / 2 : NaN,
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
      const response = await retry(() =>
        this.http.get('/api/v3/klines', {
          params: {
            symbol: canonicalizeSymbol(params.symbol),
            interval: params.interval,
            limit: params.limit ?? 200,
          },
        }),
      );
      const candles = (response.data as Array<[number, string, string, string, string, string]>).map(
        (item) => ({
          provider: this.name,
          symbol: canonicalizeSymbol(params.symbol),
          interval: params.interval,
          ts: Number(item[0]),
          open: Number(item[1]),
          high: Number(item[2]),
          low: Number(item[3]),
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
