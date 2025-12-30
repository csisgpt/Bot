import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';
import { BaseWsProvider } from './base-ws.provider';
import { InstrumentMapping, Ticker, Candle } from '../models';
import { MarketDataProvider } from '../interfaces';
import { normalizeTickerFromBestBidAsk } from '../normalizers';
import * as WebSocket from 'ws';
import { createHttpClient } from '../utils/http.util';
import { retry } from '../utils/retry.util';
import { toInterval } from './interval-mapper';
import { getProviderEndpoints } from './providers.config';

interface KrakenWsEvent {
  event?: string;
  pair?: string;
  channelName?: string;
  status?: string;
  errorMessage?: string;
}

@Injectable()
export class KrakenMarketDataProvider extends BaseWsProvider implements MarketDataProvider {
  supportsWebsocket = true;
  private tickerMappings = new Map<string, InstrumentMapping>();
  private candleMappings = new Map<string, InstrumentMapping>();
  private timeframes: string[] = [];
  private readonly restClient;

  constructor(private readonly configService: ConfigService) {
    const endpoints = getProviderEndpoints(configService, 'kraken');
    super('kraken', {
      url: endpoints.ws ?? 'wss://ws.kraken.com',
      heartbeatMs: 20000,
      reconnectBaseMs: configService.get<number>('MARKET_DATA_WS_RECONNECT_BASE_DELAY_MS', 1000),
      reconnectMaxMs: configService.get<number>('MARKET_DATA_WS_RECONNECT_MAX_DELAY_MS', 30000),
    });
    const timeoutMs = configService.get<number>('MARKET_DATA_REST_TIMEOUT_MS', 10000);
    this.restClient = createHttpClient(endpoints.rest, timeoutMs);
  }

  async subscribeTickers(instruments: InstrumentMapping[]): Promise<void> {
    instruments.forEach((mapping) => {
      this.tickerMappings.set(mapping.providerSymbol, mapping);
    });
    this.sendSubscribe();
  }

  async subscribeCandles(instruments: InstrumentMapping[], timeframes: string[]): Promise<void> {
    instruments.forEach((mapping) => {
      this.candleMappings.set(mapping.providerSymbol, mapping);
    });
    this.timeframes = timeframes;
    this.sendSubscribe();
  }

  async fetchTickers(instruments: InstrumentMapping[]): Promise<Ticker[]> {
    if (!instruments.length) {
      return [];
    }
    const results = await Promise.all(
      instruments.map(async (mapping) => {
        const response = await retry(() =>
          this.restClient.get('/0/public/Ticker', {
            params: { pair: mapping.providerInstId },
          }),
        );
        const result = response.data?.result ?? {};
        const data = result[Object.keys(result)[0]] as {
          a?: string[];
          b?: string[];
          c?: string[];
        };
        const bid = Number(data?.b?.[0]);
        const ask = Number(data?.a?.[0]);
        const last = Number(data?.c?.[0]);
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
    const response = await retry(() =>
      this.restClient.get('/0/public/OHLC', {
        params: { pair: instrument.providerInstId, interval: toInterval('kraken', timeframe) },
      }),
    );
    const result = response.data?.result ?? {};
    const series = result[Object.keys(result)[0]] as Array<string[]>;
    return (series ?? []).slice(0, limit).map((item) => ({
      provider: this.provider,
      canonicalSymbol: instrument.canonicalSymbol,
      timeframe,
      openTime: Number(item[0]) * 1000,
      open: Number(item[1]),
      high: Number(item[2]),
      low: Number(item[3]),
      close: Number(item[4]),
      volume: Number(item[6]),
      isFinal: item[7] === '1',
    }));
  }

  protected buildUrl(): string {
    return this.options.url;
  }

  protected onOpen(): void {
    this.logger.log(JSON.stringify({ event: 'provider_connected', provider: this.provider }));
    this.sendSubscribe();
  }

  protected onMessage(data: WebSocket.RawData): void {
    const raw = typeof data === 'string' ? data : data.toString();
    if (raw === 'ping') {
      this.ws?.pong();
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      this.failures += 1;
      this.lastError = error instanceof Error ? error.message : 'Invalid JSON';
      return;
    }

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const event = parsed as KrakenWsEvent;
      if (event.event === 'subscriptionStatus' && event.status === 'error') {
        this.lastError = event.errorMessage ?? 'Subscription error';
      }
      return;
    }

    const message = parsed as any[];
    if (!Array.isArray(message) || message.length < 3) {
      return;
    }
    const [, payload, channelName, pair] = message;

    if (channelName?.startsWith('ticker')) {
      const mapping = this.tickerMappings.get(pair);
      if (!mapping) {
        return;
      }
      const bid = Number(payload?.b?.[0]);
      const ask = Number(payload?.a?.[0]);
      const last = Number(payload?.c?.[0]);
      const ticker = normalizeTickerFromBestBidAsk(
        this.provider,
        mapping,
        bid,
        ask,
        Number.isFinite(last) ? last : (bid + ask) / 2,
        Date.now(),
      );
      if (ticker) {
        this.emit('ticker', ticker as Ticker);
      }
      return;
    }

    if (channelName?.startsWith('ohlc')) {
      const mapping = this.candleMappings.get(pair);
      if (!mapping) {
        return;
      }
      const candle = payload as string[];
      const candlePayload: Candle = {
        provider: this.provider,
        canonicalSymbol: mapping.canonicalSymbol,
        timeframe: this.parseInterval(channelName),
        openTime: Number(candle[0]) * 1000,
        open: Number(candle[1]),
        high: Number(candle[2]),
        low: Number(candle[3]),
        close: Number(candle[4]),
        volume: Number(candle[6]),
        isFinal: candle[7] === '1',
      };
      if ([candlePayload.open, candlePayload.high, candlePayload.low, candlePayload.close, candlePayload.volume, candlePayload.openTime].every(Number.isFinite)) {
        this.emit('candle', candlePayload as Candle);
      }
    }
  }

  protected onClose(): void {
    this.logger.warn(JSON.stringify({ event: 'provider_disconnected', provider: this.provider }));
  }

  private sendSubscribe(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    if (this.tickerMappings.size) {
      this.send({
        event: 'subscribe',
        pair: Array.from(this.tickerMappings.keys()),
        subscription: { name: 'ticker' },
      });
    }
    if (this.candleMappings.size && this.timeframes.length) {
      for (const timeframe of this.timeframes) {
        this.send({
          event: 'subscribe',
          pair: Array.from(this.candleMappings.keys()),
          subscription: { name: 'ohlc', interval: this.mapInterval(timeframe) },
        });
      }
    }
  }

  private mapInterval(interval: string): number {
    const mapping: Record<string, number> = {
      '1m': 1,
      '5m': 5,
      '15m': 15,
      '30m': 30,
      '1h': 60,
      '4h': 240,
      '1d': 1440,
    };
    return mapping[interval] ?? 1;
  }

  private parseInterval(channelName: string): string {
    const match = channelName.match(/ohlc-(\d+)/);
    if (!match) {
      return '1m';
    }
    const minutes = Number(match[1]);
    if (minutes >= 60) {
      const hours = minutes / 60;
      return `${hours}h`;
    }
    return `${minutes}m`;
  }
}
