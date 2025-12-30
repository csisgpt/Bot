import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MarketDataCandle, MarketDataProvider, MarketDataTicker } from '../market-data-provider.interface';
import { MarketDataProviderBase } from '../market-data-provider.base';
import { canonicalizeSymbol, splitSymbol } from '../utils/canonicalize';
import { createProviderHttp, retry } from '../utils/http';

const QUOTE_ALIASES: Record<string, string> = {
  USDT: 'UST',
};

const mapInterval = (interval: string): string => {
  const mapping: Record<string, string> = {
    '1m': '1m',
    '5m': '5m',
    '15m': '15m',
    '30m': '30m',
    '1h': '1h',
    '4h': '4h',
    '1d': '1D',
  };
  return mapping[interval] ?? '1m';
};

const toBitfinexSymbol = (value: string): string => {
  const parts = splitSymbol(value);
  if (!parts) {
    return `t${canonicalizeSymbol(value)}`;
  }
  const quote = QUOTE_ALIASES[parts.quote] ?? parts.quote;
  return `t${parts.base}${quote}`;
};

@Injectable()
export class BitfinexMarketDataProvider
  extends MarketDataProviderBase
  implements MarketDataProvider
{
  name = 'bitfinex';
  private readonly http;

  constructor(private readonly configService: ConfigService) {
    super('bitfinex');
    const baseURL = this.configService.get<string>(
      'BITFINEX_REST_URL',
      'https://api-pub.bitfinex.com',
    );
    const timeout = this.configService.get<number>('BITFINEX_REST_TIMEOUT_MS', 10000);
    this.http = createProviderHttp(baseURL, timeout);
  }

  async getTickers(params: { symbols: string[] }): Promise<MarketDataTicker[]> {
    const symbols = params.symbols.map((symbol) => canonicalizeSymbol(symbol));
    const startedAt = Date.now();
    try {
      const results = await Promise.all(
        symbols.map(async (symbol) => {
          const market = toBitfinexSymbol(symbol);
          const response = await retry(() => this.http.get(`/v2/ticker/${market}`));
          const data = response.data as [
            number,
            number,
            number,
            number,
            number,
            number,
            number,
            number,
            number,
            number,
          ];
          const bid = Number(data[0]);
          const ask = Number(data[2]);
          const last = Number(data[6]);
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
      const market = toBitfinexSymbol(params.symbol);
      const response = await retry(() =>
        this.http.get(`/v2/candles/trade:${mapInterval(params.interval)}:${market}/hist`, {
          params: { limit: params.limit ?? 200 },
        }),
      );
      const data = response.data as Array<[number, number, number, number, number, number]>;
      const candles = (data ?? []).map((item) => ({
        provider: this.name,
        symbol: canonicalizeSymbol(params.symbol),
        interval: params.interval,
        ts: Number(item[0]),
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
