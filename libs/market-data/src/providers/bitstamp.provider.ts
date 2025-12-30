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
export class BitstampMarketDataProvider extends BaseRestProvider {
  private readonly restClient;

  constructor(private readonly configService: ConfigService) {
    super('bitstamp');
    const endpoints = getProviderEndpoints(configService, 'bitstamp');
    const timeoutMs = configService.get<number>('MARKET_DATA_REST_TIMEOUT_MS', 10000);
    this.restClient = createHttpClient(endpoints.rest, timeoutMs);
  }

  async fetchTickers(instruments: InstrumentMapping[]): Promise<Ticker[]> {
    const results = await Promise.all(
      instruments.map(async (mapping) => {
        const response = await retry(
          () => this.restClient.get(`/ticker/${mapping.providerInstId}/`),
          { attempts: 3, baseDelayMs: 500 },
        );
        const data = response.data as { last?: string; bid?: string; ask?: string; timestamp?: string };
        const bid = Number(data.bid);
        const ask = Number(data.ask);
        const last = Number(data.last);
        const ts = data.timestamp ? Number(data.timestamp) * 1000 : Date.now();
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
        this.restClient.get(`/ohlc/${instrument.providerInstId}/`, {
          params: { step: toInterval('bitstamp', timeframe), limit },
        }),
      { attempts: 3, baseDelayMs: 500 },
    );
    const data = response.data?.data?.ohlc ?? [];
    return (data as Array<{ timestamp: string; open: string; high: string; low: string; close: string; volume: string }>).map(
      (item) => ({
        provider: this.provider,
        canonicalSymbol: instrument.canonicalSymbol,
        timeframe,
        openTime: Number(item.timestamp) * 1000,
        open: Number(item.open),
        high: Number(item.high),
        low: Number(item.low),
        close: Number(item.close),
        volume: Number(item.volume),
        isFinal: true,
      }),
    );
  }
}
