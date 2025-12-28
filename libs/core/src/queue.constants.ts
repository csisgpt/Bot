export const SIGNALS_QUEUE_NAME = process.env.QUEUE_SIGNALS_NAME ?? 'signals';
export const SIGNALS_QUEUE_CONCURRENCY = Number(process.env.QUEUE_CONCURRENCY ?? '5');
export const MARKET_DATA_QUEUE_NAME =
  process.env.QUEUE_MARKET_DATA_NAME ?? 'market-data';
export const NEWS_QUEUE_NAME = process.env.QUEUE_NEWS_NAME ?? 'news';
