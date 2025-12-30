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
export class BitfinexMarketDataProvider extends BaseRestProvider {
  private readonly restClient;

  constructor(private readonly configService: ConfigService) {
    super('bitfinex');
    const endpoints = getProviderEndpoints(configService, 'bitfinex');
    const timeoutMs = configService.get<number>('MARKET_DATA_REST_TIMEOUT_MS', 10000);
    this.restClient = createHttpClient(endpoints.rest, timeoutMs);
  }

  async fetchTickers(instruments: InstrumentMapping[]): Promise<Ticker[]> {
    const results = await Promise.all(
      instruments.map(async (mapping) => {
        const response = await retry(
          () => this.restClient.get(`/v2/ticker/${mapping.providerInstId}`),
          { attempts: 3, baseDelayMs: 500 },
        );
        const data = response.data as number[];
        const bid = Number(data[0]);
        const ask = Number(data[2]);
        const last = Number(data[6]);
        return normalizeTickerFromBestBidAsk(
          this.provider,
          mapping,
          bid,
          ask,
          Number.isFinite(last) ? last : (bid + ask) / 2,
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
        this.restClient.get(`/v2/candles/trade:${toInterval('bitfinex', timeframe)}:${instrument.providerInstId}/hist`, {
          params: { limit },
        }),
      { attempts: 3, baseDelayMs: 500 },
    );
    const data = response.data as Array<[number, number, number, number, number, number]>;
    return (data ?? []).map((item) => ({
      provider: this.provider,
      canonicalSymbol: instrument.canonicalSymbol,
      timeframe,
      openTime: Number(item[0]),
      open: Number(item[1]),
      close: Number(item[2]),
      high: Number(item[3]),
      low: Number(item[4]),
      volume: Number(item[5]),
      isFinal: true,
    }));
  }
}
