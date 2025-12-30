import { EventEmitter } from 'events';
import { ArbOpportunity, Candle, InstrumentMapping, NewsItem, ProviderSnapshot, Ticker } from './models';

export interface MarketDataProvider extends EventEmitter {
  provider: string;
  supportsWebsocket: boolean;
  start(): Promise<void>;
  stop(): Promise<void>;
  subscribeTickers(instruments: InstrumentMapping[]): Promise<void>;
  subscribeCandles(instruments: InstrumentMapping[], timeframes: string[]): Promise<void>;
  fetchTickers(instruments: InstrumentMapping[]): Promise<Ticker[]>;
  fetchCandles(
    instrument: InstrumentMapping,
    timeframe: string,
    limit: number,
  ): Promise<Candle[]>;
  getSnapshot(): ProviderSnapshot;
}

export interface NewsProvider {
  provider: string;
  fetchLatest(): Promise<NewsItem[]>;
  normalize(items: NewsItem[]): NewsItem[];
  dedupe(items: NewsItem[]): NewsItem[];
}

export interface ArbitrageStrategy {
  kind: string;
  requiredCapabilities: string[];
  scan(snapshot: ArbitrageSnapshot): ArbOpportunity[];
}

export interface ArbitrageSnapshot {
  ts: number;
  tickers: Record<string, Record<string, Ticker>>;
}
