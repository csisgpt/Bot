import { z } from 'zod';

const numberSchema = (defaultValue: number) =>
  z.preprocess(
    (value) => {
      if (typeof value === 'string' && value.trim() !== '') {
        return Number(value);
      }
      return value;
    },
    z.number().finite().default(defaultValue),
  );

const booleanSchema = (defaultValue: boolean) =>
  z.preprocess(
    (value) => {
      if (typeof value === 'string') {
        return value.toLowerCase() === 'true';
      }
      return value;
    },
    z.boolean().default(defaultValue),
  );

export const envSchema = z.object({
  NODE_ENV: z.string().optional().default('development'),
  APP_NAME: z.string().optional().default('crypto-signals-bot'),
  TZ: z.string().optional().default('UTC'),
  LOG_LEVEL: z.string().optional().default('info'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  PRISMA_LOG_LEVEL: z.string().optional().default('info'),
  REDIS_URL: z.string().optional(),
  REDIS_HOST: z.string().optional().default('localhost'),
  REDIS_PORT: numberSchema(6379),
  REDIS_PASSWORD: z.string().optional(),
  PORT: numberSchema(3000),
  WORKER_PORT: numberSchema(3001),
  QUEUE_SIGNALS_NAME: z.string().optional().default('signals'),
  QUEUE_CONCURRENCY: numberSchema(5),
  TELEGRAM_BOT_TOKEN: z.string().min(1, 'TELEGRAM_BOT_TOKEN is required'),
  TELEGRAM_BOT_ID: z.string().optional(),
  TELEGRAM_BOT_USERNAME: z.string().optional(),
  TELEGRAM_SIGNAL_CHANNEL_ID: z.string().optional().default(''),
  TELEGRAM_SIGNAL_CHANNEL_USERNAME: z.string().optional(),
  TELEGRAM_SIGNAL_CHANNEL_TITLE: z.string().optional(),
  TELEGRAM_SIGNAL_GROUP_ID: z.string().optional().default(''),
  TELEGRAM_SIGNAL_GROUP_TITLE: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional().default(''),
  TELEGRAM_CHAT_TYPE: z.string().optional().default('GROUP'),
  TELEGRAM_OWNER_USER_ID: z.string().optional(),
  TELEGRAM_OWNER_USERNAME: z.string().optional(),
  OWNER_USER_ID: z.string().optional(),
  ADMIN_TEST_TOKEN: z.string().optional(),
  TELEGRAM_PARSE_MODE: z.string().optional().default('HTML'),
  TELEGRAM_DISABLE_WEB_PAGE_PREVIEW: booleanSchema(true),
  PRICE_TICKER_ENABLED: booleanSchema(false),
  PRICE_TICKER_POST_SECONDS: numberSchema(10),
  PRICE_TICKER_INSTRUMENTS: z.string().optional().default('XAUTUSDT'),
  PRICE_TICKER_POST_TO_GROUP: booleanSchema(true),
  PRICE_TICKER_POST_TO_CHANNEL: booleanSchema(true),
  BINANCE_WS_ENABLED: booleanSchema(true),
  BINANCE_WS_BASE_URL: z.string().optional().default('wss://stream.binance.com:9443'),
  BINANCE_WS_RECONNECT_MS: numberSchema(3000),
  BINANCE_WS_STREAMS: z.string().optional().default('miniTicker'),
  BINANCE_WS_INSTRUMENTS: z.string().optional().default('XAUTUSDT'),
  BINANCE_REST_BASE_URL: z.string().optional().default('https://api.binance.com'),
  BINANCE_REST_TIMEOUT_MS: numberSchema(8000),
  PRICE_CACHE_TTL_SECONDS: numberSchema(120),
  ASSETS_ENABLED: z.string().optional().default('GOLD,CRYPTO'),
  GOLD_INSTRUMENTS: z.string().optional().default('XAUTUSDT'),
  CRYPTO_INSTRUMENTS: z.string().optional().default(''),
  BINANCE_SYMBOLS: z.string().optional().default(''),
  PRICE_PROVIDER_GOLD: z.string().optional().default('BINANCE_SPOT'),
  PRICE_PROVIDER_CRYPTO: z.string().optional().default('BINANCE_SPOT'),
  BINANCE_BASE_URL: z.string().optional().default('https://api.binance.com'),
  BINANCE_INTERVAL: z.string().optional().default('15m'),
  BINANCE_KLINES_LIMIT: numberSchema(200),
  BINANCE_REQUEST_TIMEOUT_MS: numberSchema(10000),
  STRATEGIES_ENABLED: z.string().optional().default('ema_rsi,rsi_threshold,breakout,macd'),
  RSI_PERIOD: numberSchema(14),
  RSI_BUY_THRESHOLD: numberSchema(30),
  RSI_SELL_THRESHOLD: numberSchema(70),
  EMA_FAST_PERIOD: numberSchema(12),
  EMA_SLOW_PERIOD: numberSchema(26),
  BREAKOUT_LOOKBACK: numberSchema(20),
  MACD_FAST_PERIOD: numberSchema(12),
  MACD_SLOW_PERIOD: numberSchema(26),
  MACD_SIGNAL_PERIOD: numberSchema(9),
  ENABLE_RISK_LEVELS: booleanSchema(true),
  ATR_PERIOD: numberSchema(14),
  SL_ATR_MULTIPLIER: numberSchema(1.5),
  TP1_ATR_MULTIPLIER: numberSchema(2),
  TP2_ATR_MULTIPLIER: numberSchema(3),
  SIGNAL_DEDUPE_TTL_SECONDS: numberSchema(7200),
  SIGNAL_MIN_COOLDOWN_SECONDS: numberSchema(300),
  SEED_ON_STARTUP: booleanSchema(true),
  DEFAULT_STRATEGY_KEY: z.string().optional().default('default'),
  DEFAULT_STRATEGY_NAME: z.string().optional().default('Default'),
  TRADINGVIEW_WEBHOOK_ENABLED: booleanSchema(false),
  TRADINGVIEW_WEBHOOK_SECRET: z.string().optional(),
  TRADINGVIEW_DEFAULT_ASSET_TYPE: z.string().optional().default('GOLD'),
  TRADINGVIEW_DEFAULT_INSTRUMENT: z.string().optional().default('XAUTUSDT'),
  TRADINGVIEW_DEFAULT_INTERVAL: z.string().optional().default('15m'),
  TRADINGVIEW_DEFAULT_STRATEGY: z.string().optional().default('tradingview'),
  TRADINGVIEW_EMAIL_ENABLED: booleanSchema(false),
  TRADINGVIEW_IMAP_HOST: z.string().optional(),
  TRADINGVIEW_IMAP_PORT: numberSchema(993),
  TRADINGVIEW_IMAP_SECURE: booleanSchema(true),
  TRADINGVIEW_IMAP_USER: z.string().optional(),
  TRADINGVIEW_IMAP_PASS: z.string().optional(),
  TRADINGVIEW_EMAIL_FOLDER: z.string().optional().default('INBOX'),
  TRADINGVIEW_EMAIL_POLL_SECONDS: numberSchema(30),
});
