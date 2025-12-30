export type FeedType = 'prices' | 'news' | 'signals';

export interface BaseFeedConfig {
  id: string;
  enabled: boolean;
  type: FeedType;
  schedule?: string;
  destinations: string[];
}

export interface PricesFeedConfig extends BaseFeedConfig {
  type: 'prices';
  schedule: string;
  options: {
    providers: string[];
    symbols: string[];
    format: 'table' | 'compact';
    includeTimestamp: boolean;
  };
}

export interface NewsFeedConfig extends BaseFeedConfig {
  type: 'news';
  schedule: string;
  options: {
    providers: string[];
    maxItems: number;
    includeTags: boolean;
  };
}

export interface SignalsFeedConfig extends BaseFeedConfig {
  type: 'signals';
  options: {
    mode: 'realtime' | 'digest';
  };
}

export type FeedConfig = PricesFeedConfig | NewsFeedConfig | SignalsFeedConfig;

export const feedsConfig: FeedConfig[] = [
  {
    id: 'prices-default',
    enabled: true,
    type: 'prices',
    schedule: '*/60 * * * * *',
    destinations: [],
    options: {
      providers: [
        'binance',
        'bybit',
        'okx',
        'coinbase',
        'kraken',
      ],
      symbols: ['BTCUSDT', 'ETHUSDT','XRPUSDT','SOLUSDT','ADAUSDT','DOGEUSDT','TRXUSDT','XAUTUSDT'],
      format: 'table',
      includeTimestamp: true,
    },
  },
  {
    id: 'news-default',
    enabled: true,
    type: 'news',
    schedule: '*/30 * * * * *',
    destinations: [],
    options: {
      providers: ['binance', 'bybit', 'okx'],
      maxItems: 5,
      includeTags: false,
    },
  },
  {
    id: 'signals-default',
    enabled: true,
    type: 'signals',
    destinations: [],
    options: {
      mode: 'realtime',
    },
  },
];
