
// apps/worker/src/feeds/feeds.config.ts

export type FeedType = 'prices' | 'news' | 'signals';

export type FeedFormat = 'table' | 'compact';

export interface BaseFeedConfig<TType extends FeedType, TOptions> {
  id: string;
  type: TType;
  enabled: boolean;
  schedule: string; // cron (supports seconds)
  destinations: string[]; // telegram chat_id(s)
  options: TOptions;
}

export interface PricesFeedOptions {
  providers: string[];
  symbols: string[];
  format: FeedFormat;
  includeTimestamp: boolean;
}

export interface NewsFeedOptions {
  providers: string[];
  maxItems: number;
  includeTags: boolean;
}

export interface SignalsFeedOptions {
  // اگر بعداً لازم شد توسعه می‌دی
  destinationsOverride?: string[];
}

export type PricesFeedConfig = BaseFeedConfig<'prices', PricesFeedOptions>;
export type NewsFeedConfig = BaseFeedConfig<'news', NewsFeedOptions>;
export type SignalsFeedConfig = BaseFeedConfig<'signals', SignalsFeedOptions>;

export type FeedConfig = PricesFeedConfig | NewsFeedConfig | SignalsFeedConfig;

const parseCsv = (raw?: string): string[] =>
  (raw ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

const envTrue = (v?: string, def = false): boolean => {
  if (v === undefined) return def;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
};

const defaultProviders = parseCsv(process.env.ARB_ENABLED_PROVIDERS) // همون لیست معروف
  .filter(Boolean);

const defaultDestinations =
  parseCsv(process.env.FEEDS_TELEGRAM_DESTINATIONS) ||
  parseCsv(process.env.PRICES_FEED_DESTINATIONS) ||
  parseCsv(process.env.TELEGRAM_CHAT_IDS);

const defaultSymbols =
  parseCsv(process.env.PRICE_TICKER_INSTRUMENTS) ||
  parseCsv(process.env.PRICES_FEED_SYMBOLS);

export const feedsConfig: FeedConfig[] = [
  {
    id: 'prices-main',
    type: 'prices',
    enabled: envTrue(process.env.FEEDS_PRICES_ENABLED, true),
    schedule: process.env.FEEDS_PRICES_CRON ?? '*/30 * * * * *', // هر ۳۰ ثانیه
    destinations: defaultDestinations,
    options: {
      providers: defaultProviders.length ? defaultProviders : ['binance', 'bybit', 'okx', 'coinbase', 'kraken'],
      symbols: defaultSymbols.length ? defaultSymbols : ['BTCUSDT', 'ETHUSDT'],
      format: (process.env.FEEDS_PRICES_FORMAT as FeedFormat) ?? 'table',
      includeTimestamp: envTrue(process.env.FEEDS_PRICES_INCLUDE_TIMESTAMP, true),
    },
  },

  // اگر بعداً news/signals خواستی فعال کنی، همینجا اضافه می‌کنی
];