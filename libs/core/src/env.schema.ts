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
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().optional(),
  REDIS_HOST: z.string().optional().default('localhost'),
  REDIS_PORT: numberSchema(6379),
  REDIS_PASSWORD: z.string().optional(),
  PORT: numberSchema(3000),
  WORKER_PORT: numberSchema(3001),
  TELEGRAM_BOT_TOKEN: z.string().min(1, 'TELEGRAM_BOT_TOKEN is required'),
  TELEGRAM_SIGNAL_CHANNEL_ID: z.string().optional().default(''),
  TELEGRAM_SIGNAL_GROUP_ID: z.string().optional().default(''),
  TELEGRAM_OWNER_USER_ID: z.string().optional(),
  OWNER_USER_ID: z.string().optional(),
  ADMIN_TEST_TOKEN: z.string().optional(),
  TELEGRAM_PARSE_MODE: z.string().optional().default('HTML'),
  TELEGRAM_DISABLE_WEB_PAGE_PREVIEW: booleanSchema(true),
  ASSETS_ENABLED: z.string().optional().default('GOLD,CRYPTO'),
  GOLD_INSTRUMENTS: z.string().optional().default('XAUTUSDT'),
  CRYPTO_INSTRUMENTS: z.string().optional().default(''),
  BINANCE_SYMBOLS: z.string().optional().default(''),
  PRICE_PROVIDER_GOLD: z.string().optional().default('BINANCE_SPOT'),
  PRICE_PROVIDER_CRYPTO: z.string().optional().default('BINANCE_SPOT'),
  BINANCE_BASE_URL: z.string().optional().default('https://api.binance.com'),
  BINANCE_INTERVAL: z.string().optional().default('15m'),
  BINANCE_KLINES_LIMIT: numberSchema(200),
  STRATEGIES_ENABLED: z.string().optional().default('ema_rsi,rsi_threshold,breakout,macd'),
  RSI_PERIOD: numberSchema(14),
  RSI_BUY_THRESHOLD: numberSchema(30),
  RSI_SELL_THRESHOLD: numberSchema(70),
  EMA_FAST_PERIOD: numberSchema(12),
  EMA_SLOW_PERIOD: numberSchema(26),
  BREAKOUT_LOOKBACK: numberSchema(20),
  ENABLE_RISK_LEVELS: booleanSchema(true),
  ATR_PERIOD: numberSchema(14),
  SL_ATR_MULTIPLIER: numberSchema(1.5),
  TP1_ATR_MULTIPLIER: numberSchema(2),
  TP2_ATR_MULTIPLIER: numberSchema(3),
  SIGNAL_DEDUPE_TTL_SECONDS: numberSchema(7200),
  SIGNAL_MIN_COOLDOWN_SECONDS: numberSchema(300),
});
