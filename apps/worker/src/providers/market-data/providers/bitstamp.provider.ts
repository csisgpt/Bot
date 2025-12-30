import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MarketDataCandle, MarketDataProvider, MarketDataTicker } from '../market-data-provider.interface';
import { MarketDataProviderBase } from '../market-data-provider.base';
import { canonicalizeSymbol, splitSymbol } from '../utils/canonicalize';
import { createProviderHttp, retry } from '../utils/http';

const mapStepSeconds = (interval: string): number => {
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

const toBitstampPair = (value: string): string => {
  const parts = splitSymbol(value);
  if (!parts) {
    return canonicalizeSymbol(value).toLowerCase();
  }
  return `${parts.base}${parts.quote}`.toLowerCase();
};

@Injectable()
export class BitstampMarketDataProvider
  extends MarketDataProviderBase
  implements MarketDataProvider
{
  name = 'bitstamp';
  private readonly http;

  constructor(private readonly configService: ConfigService) {
    super('bitstamp');
    const baseURL = this.configService.get<string>(
      'BITSTAMP_REST_URL',
      'https://www.bitstamp.net/api/v2',
    );
    const timeout = this.configService.get<number>('BITSTAMP_REST_TIMEOUT_MS', 10000);
    this.http = createProviderHttp(baseURL, timeout);
  }

  async getTickers(params: { symbols: string[] }): Promise<MarketDataTicker[]> {
    const symbols = params.symbols.map((symbol) => canonicalizeSymbol(symbol));
    const startedAt = Date.now();
    try {
      const results = await Promise.all(
        symbols.map(async (symbol) => {
          const pair = toBitstampPair(symbol);
          const response = await retry(() => this.http.get(`/ticker/${pair}/`));
          const data = response.data as { last?: string; bid?: string; ask?: string; timestamp?: string };
          return {
            provider: this.name,
            symbol,
            last: Number(data.last),
            bid: Number(data.bid),
            ask: Number(data.ask),
            time: data.timestamp ? Number(data.timestamp) * 1000 : Date.now(),
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
      const pair = toBitstampPair(params.symbol);
      const response = await retry(() =>
        this.http.get(`/ohlc/${pair}/`, {
          params: {
            step: mapStepSeconds(params.interval),
            limit: params.limit ?? 200,
          },
        }),
      );
      const data = response.data?.data?.ohlc ?? [];
      const candles = (data as Array<{ timestamp: string; open: string; high: string; low: string; close: string; volume: string }>).map(
        (item) => ({
          provider: this.name,
          symbol: canonicalizeSymbol(params.symbol),
          interval: params.interval,
          ts: Number(item.timestamp) * 1000,
          open: Number(item.open),
          high: Number(item.high),
          low: Number(item.low),
          close: Number(item.close),
          volume: Number(item.volume),
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
