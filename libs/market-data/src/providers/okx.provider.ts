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

interface OkxWsMessage {
  arg?: { channel?: string; instId?: string };
  data?: Array<Record<string, string>> | string[];
  event?: string;
  code?: string;
  msg?: string;
}

@Injectable()
export class OkxMarketDataProvider extends BaseWsProvider implements MarketDataProvider {
  supportsWebsocket = true;
  private tickerMappings = new Map<string, InstrumentMapping>();
  private candleMappings = new Map<string, InstrumentMapping>();
  private timeframes: string[] = [];
  private readonly restClient;

  constructor(private readonly configService: ConfigService) {
    const endpoints = getProviderEndpoints(configService, 'okx');
    super('okx', {
      url: endpoints.ws ?? 'wss://ws.okx.com:8443/ws/v5/public',
      heartbeatMs: 20000,
      reconnectBaseMs: configService.get<number>('MARKET_DATA_WS_RECONNECT_BASE_DELAY_MS', 1000),
      reconnectMaxMs: configService.get<number>('MARKET_DATA_WS_RECONNECT_MAX_DELAY_MS', 30000),
    });
    const timeoutMs = configService.get<number>('MARKET_DATA_REST_TIMEOUT_MS', 10000);
    this.restClient = createHttpClient(endpoints.rest, timeoutMs);
  }

  async subscribeTickers(instruments: InstrumentMapping[]): Promise<void> {
    instruments.forEach((mapping) => {
      this.tickerMappings.set(mapping.providerInstId, mapping);
    });
    this.sendSubscribe();
  }

  async subscribeCandles(instruments: InstrumentMapping[], timeframes: string[]): Promise<void> {
    instruments.forEach((mapping) => {
      this.candleMappings.set(mapping.providerInstId, mapping);
    });
    this.timeframes = timeframes;
    this.sendSubscribe();
  }

  async fetchTickers(instruments: InstrumentMapping[]): Promise<Ticker[]> {
    if (!instruments.length) {
      return [];
    }
    const mappingByInstId = new Map(instruments.map((item) => [item.providerInstId, item]));
    const response = await retry(
      () =>
        this.restClient.get('/api/v5/market/tickers', {
          params: { instType: 'SPOT' },
        }),
      { attempts: 3, baseDelayMs: 500 },
    );
    const list = response.data?.data ?? [];
    return (list as Array<Record<string, string>>)
      .map((item) => {
        const mapping = mappingByInstId.get(String(item.instId));
        if (!mapping) {
          return null;
        }
        const bid = Number(item.bidPx);
        const ask = Number(item.askPx);
        const last = Number(item.last);
        const ts = Number(item.ts) || Date.now();
        return normalizeTickerFromBestBidAsk(
          this.provider,
          mapping,
          bid,
          ask,
          Number.isFinite(last) ? last : (bid + ask) / 2,
          ts,
          Number(item.vol24h),
        );
      })
      .filter((ticker): ticker is Ticker => Boolean(ticker));
  }

  async fetchCandles(
    instrument: InstrumentMapping,
    timeframe: string,
    limit: number,
  ): Promise<Candle[]> {
    const response = await retry(
      () =>
        this.restClient.get('/api/v5/market/candles', {
          params: { instId: instrument.providerInstId, bar: toInterval('okx', timeframe), limit },
        }),
      { attempts: 3, baseDelayMs: 500 },
    );
    const data = response.data?.data ?? [];
    return (data as Array<string[]>).map((item) => ({
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

  protected buildUrl(): string {
    return this.options.url;
  }

  protected onOpen(): void {
    this.logger.log(JSON.stringify({ event: 'provider_connected', provider: this.provider }));
    this.sendSubscribe();
  }

  protected onMessage(data: WebSocket.RawData): void {
    const raw = typeof data === 'string' ? data : data.toString();
    if (raw === 'pong') {
      return;
    }

    let message: OkxWsMessage | null = null;
    try {
      message = JSON.parse(raw) as OkxWsMessage;
    } catch (error) {
      this.failures += 1;
      return;
    }

    if (message?.event) {
      if (message.event === 'error') {
        this.lastError = message.msg ?? 'Unknown error';
      }
      return;
    }

    if (!message?.arg?.channel || !message.data) {
      return;
    }

    if (message.arg.channel === 'tickers') {
      const instId = message.arg.instId ?? '';
      const mapping = this.tickerMappings.get(instId);
      if (!mapping) {
        return;
      }
      const dataItem = Array.isArray(message.data) ? message.data[0] : undefined;
      if (!dataItem || typeof dataItem !== 'object') {
        return;
      }
      const bid = Number(dataItem.bidPx);
      const ask = Number(dataItem.askPx);
      const last = Number(dataItem.last);
      const ts = Number(dataItem.ts) || Date.now();
      const ticker = normalizeTickerFromBestBidAsk(
        this.provider,
        mapping,
        bid,
        ask,
        Number.isFinite(last) ? last : (bid + ask) / 2,
        ts,
        Number(dataItem.vol24h),
      );
      if (ticker) {
        this.emit('ticker', ticker as Ticker);
      }
      return;
    }

    if (message.arg.channel.startsWith('candle')) {
      const instId = message.arg.instId ?? '';
      const mapping = this.candleMappings.get(instId);
      if (!mapping) {
        return;
      }
      const payload = Array.isArray(message.data) ? message.data[0] : undefined;
      if (!Array.isArray(payload)) {
        return;
      }
      const [ts, open, high, low, close, volume, , , confirm] = payload as string[];
      const candle: Candle = {
        provider: this.provider,
        canonicalSymbol: mapping.canonicalSymbol,
        timeframe: this.parseTimeframe(message.arg.channel),
        openTime: Number(ts),
        open: Number(open),
        high: Number(high),
        low: Number(low),
        close: Number(close),
        volume: Number(volume),
        isFinal: confirm === '1',
      };
      if ([candle.open, candle.high, candle.low, candle.close, candle.volume, candle.openTime].every(Number.isFinite)) {
        this.emit('candle', candle as Candle);
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
    const args: Array<{ channel: string; instId: string }> = [];
    if (this.tickerMappings.size) {
      for (const [instId] of this.tickerMappings) {
        args.push({ channel: 'tickers', instId });
      }
    }
    if (this.candleMappings.size && this.timeframes.length) {
      for (const [instId] of this.candleMappings) {
        for (const timeframe of this.timeframes) {
          args.push({ channel: this.toOkxChannel(timeframe), instId });
        }
      }
    }
    if (!args.length) {
      return;
    }
    this.send({ op: 'subscribe', args });
  }

  private toOkxChannel(timeframe: string): string {
    const normalized = String(toInterval('okx', timeframe));
    return `candle${normalized}`;
  }

  private parseTimeframe(channel: string): string {
    return channel.replace('candle', '').toLowerCase();
  }
}
