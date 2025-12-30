import { EventEmitter } from 'events';
import { Logger } from '@nestjs/common';
import { MarketDataProvider } from '../interfaces';
import { ProviderSnapshot, Ticker, Candle, InstrumentMapping } from '../models';

export abstract class BaseRestProvider extends EventEmitter implements MarketDataProvider {
  readonly provider: string;
  supportsWebsocket = false;
  protected readonly logger: Logger;
  protected connected = false;
  protected lastMessageTs: number | null = null;
  protected reconnects = 0;
  protected failures = 0;
  protected lastError: string | null = null;

  protected constructor(provider: string) {
    super();
    this.provider = provider;
    this.logger = new Logger(`${provider}-provider`);
  }

  async start(): Promise<void> {
    this.connected = true;
  }

  async stop(): Promise<void> {
    this.connected = false;
  }

  async subscribeTickers(_instruments: InstrumentMapping[]): Promise<void> {
    return;
  }

  async subscribeCandles(_instruments: InstrumentMapping[], _timeframes: string[]): Promise<void> {
    return;
  }

  abstract fetchTickers(instruments: InstrumentMapping[]): Promise<Ticker[]>;
  abstract fetchCandles(
    instrument: InstrumentMapping,
    timeframe: string,
    limit: number,
  ): Promise<Candle[]>;

  getSnapshot(): ProviderSnapshot {
    return {
      provider: this.provider,
      connected: this.connected,
      lastMessageTs: this.lastMessageTs,
      reconnects: this.reconnects,
      failures: this.failures,
      lastError: this.lastError,
    };
  }
}
