export type FeedType = 'prices' | 'news' | 'signals';
export type FeedDestination = string; // e.g., Telegram chatId

export interface BaseFeedConfig<TOptions> {
  id: string;
  type: FeedType;
  enabled: boolean;
  intervalSec: number;
  destinations: FeedDestination[];
  options: TOptions;
}

export interface PricesFeedOptions {
  providers?: string[];
  symbols?: string[];
  format?: 'table' | 'compact';
  includeTimestamp?: boolean;
}

export interface NewsFeedOptions {
  providers?: string[];
  maxItems?: number;
  includeTags?: boolean;
}

export interface SignalsFeedOptions {
  /**
   * نحوه ارسال سیگنال‌ها:
   * - realtime: همزمان با تولید سیگنال منتشر می‌شود (پیشنهادی)
   * - scheduled: توسط scheduler اجرا می‌شود (اگر بعداً خواستی)
   */
  mode?: 'realtime' | 'scheduled';

  // اگر بعداً لازم شد توسعه می‌دی
  destinationsOverride?: string[];
}

export type PricesFeedConfig = BaseFeedConfig<PricesFeedOptions>;
export type NewsFeedConfig = BaseFeedConfig<NewsFeedOptions>;
export type SignalsFeedConfig = BaseFeedConfig<SignalsFeedOptions>;

export type FeedConfig = PricesFeedConfig | NewsFeedConfig | SignalsFeedConfig;

const parseCsv = (raw?: string): string[] =>
  (raw ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

const firstNonEmpty = (...lists: string[][]): string[] => {
  for (const list of lists) {
    if (list && list.length > 0) return list;
  }
  return [];
};

const defaultDestinations = firstNonEmpty(
  parseCsv(process.env.FEEDS_TELEGRAM_DESTINATIONS),
  parseCsv(process.env.TELEGRAM_CHAT_IDS),
  parseCsv(process.env.TELEGRAM_SIGNAL_CHANNEL_ID),
  parseCsv(process.env.TELEGRAM_SIGNAL_GROUP_ID),
);

const defaultSymbols = firstNonEmpty(
  parseCsv(process.env.PRICE_TICKER_INSTRUMENTS),
  parseCsv(process.env.PRICES_FEED_SYMBOLS),
);

const defaultProviders = parseCsv(process.env.ARB_ENABLED_PROVIDERS);

export const feedsConfig: FeedConfig[] = [
  {
    id: 'prices',
    type: 'prices',
    enabled: true,
    intervalSec: Number(process.env.PRICES_FEED_INTERVAL_SEC ?? 30),
    destinations: defaultDestinations,
    options: {
      providers: defaultProviders.length ? defaultProviders : ['binance'],
      symbols: defaultSymbols.length ? defaultSymbols : ['BTCUSDT', 'ETHUSDT'],
      format: (process.env.PRICES_FEED_FORMAT as any) ?? 'table',
      includeTimestamp: process.env.PRICES_FEED_INCLUDE_TIMESTAMP !== 'false',
    },
  },
  {
    id: 'news',
    type: 'news',
    enabled: process.env.NEWS_FEED_ENABLED === 'true',
    intervalSec: Number(process.env.NEWS_FEED_INTERVAL_SEC ?? 300),
    destinations: defaultDestinations,
    options: {
      providers: parseCsv(process.env.NEWS_ENABLED_PROVIDERS),
      maxItems: Number(process.env.NEWS_FEED_MAX_ITEMS ?? 10),
      includeTags: process.env.NEWS_FEED_INCLUDE_TAGS !== 'false',
    },
  },
];