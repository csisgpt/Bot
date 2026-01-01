export type FeedType = 'prices' | 'news' | 'signals';

export interface FeedConfigBase {
  id: string;
  type: FeedType;
  title: string;
  enabled: boolean;
  schedule: string; // cron with seconds: "*/30 * * * * *"
  destinations: string[]; // chatIds as strings
}

export interface PricesFeedConfig extends FeedConfigBase {
  type: 'prices';
  providers: string[];
  symbolLimit: number;
  maxProvidersPerSymbol: number;
  format: 'table' | 'compact';
  includeTimestamp: boolean;
}

export interface NewsFeedConfig extends FeedConfigBase {
  type: 'news';
  providers: string[];
  maxItems: number;
}

export interface SignalsFeedConfig extends FeedConfigBase {
  type: 'signals';
  options: {
    mode: 'realtime' | 'batch';
    includeReasons: boolean;
  };
}

export type FeedConfig = PricesFeedConfig | NewsFeedConfig | SignalsFeedConfig;

export const feedsConfig: FeedConfig[] = [
  {
    id: 'prices-default',
    type: 'prices',
    title: 'Prices',
    enabled: true,
    schedule: '*/30 * * * * *', // هر ۳۰ ثانیه
    destinations: [], // از env پر میشه (FeedConfigService)
    providers: ['binance', 'bybit', 'okx', 'coinbase', 'kraken'],
    symbolLimit: 12,
    maxProvidersPerSymbol: 3,
    format: 'table',
    includeTimestamp: true,
  },
  {
    id: 'news-default',
    type: 'news',
    title: 'News',
    enabled: false,
    schedule: '0 */5 * * * *', // هر ۵ دقیقه
    destinations: [],
    providers: ['bybit'],
    maxItems: 5,
  },
  {
    id: 'signals-default',
    type: 'signals',
    title: 'Signals',
    enabled: true,
    schedule: '*/30 * * * * *',
    destinations: [],
    options: {
      mode: 'realtime',
      includeReasons: true,
    },
  },
];