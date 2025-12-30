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
export class MexcMarketDataProvider extends BaseRestProvider {
  private readonly restClient;

  constructor(private readonly configService: ConfigService) {
    super('mexc');
    const endpoints = getProviderEndpoints(configService, 'mexc');
    const timeoutMs = configService.get<number>('MARKET_DATA_REST_TIMEOUT_MS', 10000);
    this.restClient = createHttpClient(endpoints.rest, timeoutMs);
  }

  async fetchTickers(instruments: InstrumentMapping[]): Promise<Ticker[]> {
    const results = await Promise.all(
      instruments.map(async (mapping) => {
        const response = await retry(
          () =>
            this.restClient.get('/api/v3/ticker/bookTicker', {
              params: { symbol: mapping.providerInstId },
            }),
          { attempts: 3, baseDelayMs: 500 },
        );
        const data = response.data as { bidPrice?: string; askPrice?: string };
        const bid = Number(data.bidPrice);
        const ask = Number(data.askPrice);
        return normalizeTickerFromBestBidAsk(
          this.provider,
          mapping,
          bid,
          ask,
          Number.isFinite(bid) && Number.isFinite(ask) ? (bid + ask) / 2 : NaN,
          Date.now(),
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
        this.restClient.get('/api/v3/klines', {
          params: { symbol: instrument.providerInstId, interval: toInterval('mexc', timeframe), limit },
        }),
      { attempts: 3, baseDelayMs: 500 },
    );
    const data = response.data as Array<[number, string, string, string, string, string]>;
    return (data ?? []).map((item) => ({
      provider: this.provider,
      canonicalSymbol: instrument.canonicalSymbol,
      timeframe,
      openTime: Number(item[0]),
      open: Number(item[1]),
      high: Number(item[2]),
      low: Number(item[3]),
      close: Number(item[4]),
      volume: Number(item[5]),
      isFinal: true,
    }));
  }
}
