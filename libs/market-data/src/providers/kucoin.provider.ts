import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InstrumentMapping, Ticker, Candle } from '../models';
import { createHttpClient } from '../utils/http.util';
import { retry } from '../utils/retry.util';
import { BaseRestProvider } from './base-rest.provider';
import { toInterval } from './interval-mapper';
import { getProviderEndpoints } from './providers.config';
import { normalizeTickerFromBestBidAsk } from '../normalizers';

@Injectable()
export class KucoinMarketDataProvider extends BaseRestProvider {
  private readonly restClient;

  constructor(private readonly configService: ConfigService) {
    super('kucoin');
    const endpoints = getProviderEndpoints(configService, 'kucoin');
    const timeoutMs = configService.get<number>('MARKET_DATA_REST_TIMEOUT_MS', 10000);
    this.restClient = createHttpClient(endpoints.rest, timeoutMs);
  }

  async fetchTickers(instruments: InstrumentMapping[]): Promise<Ticker[]> {
    const results = await Promise.all(
      instruments.map(async (mapping) => {
        const response = await retry(
          () =>
            this.restClient.get('/api/v1/market/orderbook/level1', {
              params: { symbol: mapping.providerInstId },
            }),
          { attempts: 3, baseDelayMs: 500 },
        );
        const data = response.data?.data ?? {};
        const bid = Number(data.bestBid);
        const ask = Number(data.bestAsk);
        const last = Number(data.price);
        const ts = Number(data.time) || Date.now();
        return normalizeTickerFromBestBidAsk(
          this.provider,
          mapping,
          bid,
          ask,
          Number.isFinite(last) ? last : (bid + ask) / 2,
          ts,
        );
      }),
    );
    return results.filter((ticker): ticker is Ticker => Boolean(ticker));
  }

  async fetchCandles(
    instrument: InstrumentMapping,
    timeframe: string,
    limit: number,
  ): Promise<Candle[]> {
    const response = await retry(
      () =>
        this.restClient.get('/api/v1/market/candles', {
          params: {
            symbol: instrument.providerInstId,
            type: toInterval('kucoin', timeframe),
          },
        }),
      { attempts: 3, baseDelayMs: 500 },
    );
    const data = response.data?.data ?? [];
    return (data as Array<string[]>).slice(0, limit).map((item) => ({
      provider: this.provider,
      canonicalSymbol: instrument.canonicalSymbol,
      timeframe,
      openTime: Number(item[0]) * 1000,
      open: Number(item[1]),
      close: Number(item[2]),
      high: Number(item[3]),
      low: Number(item[4]),
      volume: Number(item[5]),
      isFinal: true,
    }));
  }
}
