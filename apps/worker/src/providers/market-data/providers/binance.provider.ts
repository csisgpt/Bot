import axios, { AxiosInstance } from 'axios';
import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';
import {
  MarketDataCandle,
  MarketDataProvider,
  MarketDataTicker,
} from '../market-data-provider.interface';
import { MarketDataProviderBase } from '../market-data-provider.base';

@Injectable()
export class BinanceMarketDataProvider
  extends MarketDataProviderBase
  implements MarketDataProvider
{
  name = 'binance';
  private readonly http: AxiosInstance;

  constructor(private readonly configService: ConfigService) {
    super('binance');
    const baseURL = this.configService.get<string>(
      'BINANCE_BASE_URL',
      'https://data-api.binance.vision',
    );
    const timeout = this.configService.get<number>('BINANCE_REQUEST_TIMEOUT_MS', 10000);
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
      const response = await this.http.get('/api/v3/ticker/price', {
        params: {
          symbols: JSON.stringify(symbols),
        },
      });
      const tickers = (response.data as Array<{ symbol: string; price: string }>).map((item) => ({
        provider: this.name,
        symbol: item.symbol,
        price: Number(item.price),
        ts: Date.now(),
      }));
      this.recordSuccess(Date.now() - startedAt);
      return tickers.filter((item) => Number.isFinite(item.price));
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
      const response = await this.http.get('/api/v3/klines', {
        params: {
          symbol: params.symbol.toUpperCase(),
          interval: params.interval,
          limit: params.limit ?? 200,
        },
      });
      const candles = (response.data as Array<[number, string, string, string, string, string]>).map(
        (item) => ({
          provider: this.name,
          symbol: params.symbol.toUpperCase(),
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
