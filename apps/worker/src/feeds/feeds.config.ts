export type FeedType = 'prices' | 'news' | 'signals';

export interface FeedDestination {
  kind: 'telegram';
  chatId: string;
}

interface BaseFeedConfig {
  id: string;
  type: FeedType;
  enabled: boolean;
  schedule: string; // cron (با ثانیه)
  destinations: FeedDestination[];
}

export interface PricesFeedConfig extends BaseFeedConfig {
  type: 'prices';
  symbols: string[];
  format?: 'compact' | 'table';
  includeTimestamp?: boolean;
  maxProvidersPerSymbol?: number;
}

export interface NewsFeedConfig extends BaseFeedConfig {
  type: 'news';
  providers: string[];
  limit?: number;
}

export interface SignalsFeedConfig extends BaseFeedConfig {
  type: 'signals';
  symbols: string[];
  timeframes: string[];
}

export type FeedConfig = PricesFeedConfig | NewsFeedConfig | SignalsFeedConfig;

export const feedsConfig: FeedConfig[] = [
  {
    id: 'prices-default',
    type: 'prices',
    enabled: true,
    schedule: '*/30 * * * * *', // هر ۳۰ ثانیه
    destinations: [], // با env پر می‌کنیم
    symbols: ['BTCUSDT', 'ETHUSDT', 'XRPUSDT', 'SOLUSDT', 'ADAUSDT', 'DOGEUSDT', 'PAXGUSDT', 'RXUSDT'],
    format: 'compact',
    includeTimestamp: true,
    maxProvidersPerSymbol: 3,
  },
  {
    id: 'news-default',
    type: 'news',
    enabled: false,
    schedule: '0 */10 * * * *', // هر ۱۰ دقیقه
    destinations: [],
    providers: ['bybit', 'binance'],
    limit: 10,
  },
  {
    id: 'signals-default',
    type: 'signals',
    enabled: false,
    schedule: '*/30 * * * * *',
    destinations: [],
    symbols: ['BTCUSDT', 'ETHUSDT'],
    timeframes: ['5m', '15m'],
  },
];