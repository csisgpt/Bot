import { z } from "zod";

/** helpers (همون‌هایی که قبلاً نوشتی) */
const toInt = (def?: number) =>
  z.preprocess((v) => {
    if (v === undefined || v === null || v === "") return def;
    const n = typeof v === "number" ? v : Number(String(v).trim());
    return Number.isFinite(n) ? n : v;
  }, z.number().int());

const toFloat = (def?: number) =>
  z.preprocess((v) => {
    if (v === undefined || v === null || v === "") return def;
    const n = typeof v === "number" ? v : Number(String(v).trim());
    return Number.isFinite(n) ? n : v;
  }, z.number());

const toBool = (def?: boolean) =>
  z.preprocess((v) => {
    if (v === undefined || v === null || v === "") return def;
    if (typeof v === "boolean") return v;
    const s = String(v).trim().toLowerCase();
    if (["true", "1", "yes", "y", "on"].includes(s)) return true;
    if (["false", "0", "no", "n", "off"].includes(s)) return false;
    return v;
  }, z.boolean());

const csv = (def: string[] = []) =>
  z.preprocess((v) => {
    if (v === undefined || v === null) return def;
    if (Array.isArray(v)) return v.map(String);
    const s = String(v).trim();
    if (!s) return def;
    return s.split(",").map((x) => x.trim()).filter(Boolean);
  }, z.array(z.string()));

const nonEmpty = z.string().trim().min(1);

/**
 * 1) اول base object رو بساز
 * 2) همینجا passthrough کن
 * 3) بعد superRefine اضافه کن
 */
const envObject = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("production"),
    APP_NAME: z.string().trim().default("crypto-signals-bot"),
    TZ: z.string().trim().default("UTC"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

    PORT: toInt(3000).pipe(z.number().int().min(1).max(65535)),
    WORKER_PORT: toInt(3001).pipe(z.number().int().min(1).max(65535)),

    DATABASE_URL: z.string().trim().min(1, "DATABASE_URL is required"),
    PRISMA_LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

    REDIS_URL: z.string().trim().optional(),
    REDIS_HOST: z.string().trim().default("localhost"),
    REDIS_PORT: toInt(6379).pipe(z.number().int().min(1).max(65535)),
    REDIS_PASSWORD: z.string().optional().default(""),

    QUEUE_SIGNALS_NAME: z.string().trim().default("signals"),
    QUEUE_CONCURRENCY: toInt(5).pipe(z.number().int().min(1).max(200)),

    SIGNALS_TELEGRAM_JOB_ATTEMPTS: toInt(5).pipe(z.number().int().min(1).max(50)),
    SIGNALS_TELEGRAM_JOB_BACKOFF_DELAY_MS: toInt(3000).pipe(z.number().int().min(0).max(60_000)),
    SIGNALS_TELEGRAM_JOB_PRIORITY: toInt(1).pipe(z.number().int().min(0).max(10)),

    TELEGRAM_BOT_TOKEN: nonEmpty,
    TELEGRAM_BOT_ID: z.string().trim().optional(),
    TELEGRAM_BOT_USERNAME: z.string().trim().optional(),
    TELEGRAM_USE_POLLING: toBool(false).default(false),
    TELEGRAM_WEBHOOK_URL: z.string().trim().optional(),
    TELEGRAM_WEBHOOK_SECRET: z.string().trim().optional(),
    TELEGRAM_ADMIN_ONLY_GROUP_SETTINGS: toBool(true).default(true),

    TELEGRAM_OWNER_USER_ID: z.string().trim().optional(),
    TELEGRAM_OWNER_USERNAME: z.string().trim().optional(),
    OWNER_USER_ID: z.string().trim().optional(),
    ADMIN_TEST_TOKEN: z.string().trim().optional(),

    TELEGRAM_SIGNAL_CHANNEL_ID: z.string().trim().optional(),
    TELEGRAM_SIGNAL_CHANNEL_USERNAME: z.string().trim().optional(),
    TELEGRAM_SIGNAL_CHANNEL_TITLE: z.string().trim().optional(),
    TELEGRAM_SIGNAL_GROUP_ID: z.string().trim().optional(),
    TELEGRAM_SIGNAL_GROUP_TITLE: z.string().trim().optional(),

    TELEGRAM_PARSE_MODE: z.enum(["HTML", "MarkdownV2", "Markdown"]).default("HTML"),
    TELEGRAM_DISABLE_WEB_PAGE_PREVIEW: toBool(true).default(true),

    ASSETS_ENABLED: csv(["GOLD", "CRYPTO"]).default(["GOLD", "CRYPTO"]),
    GOLD_INSTRUMENTS: csv([]).default([]),
    CRYPTO_INSTRUMENTS: csv([]).default([]),
    BINANCE_SYMBOLS: z.string().trim().optional(),
    DEFAULT_TIMEFRAMES: csv(["5m", "15m"]).default(["5m", "15m"]),
    MONITORING_ENABLED: toBool(true).default(true),

    PRICE_PROVIDER_GOLD: z.enum(["BINANCE_SPOT", "BINANCE_FUTURES", "MANUAL"]).default("BINANCE_SPOT"),
    PRICE_PROVIDER_CRYPTO: z.enum(["BINANCE_SPOT", "BINANCE_FUTURES", "MANUAL"]).default("BINANCE_SPOT"),

    PRICE_INGEST_ENABLED: toBool(true).default(true),
    PRICE_TICKER_ENABLED: toBool(false).default(false),
    PRICE_TICKER_POST_SECONDS: toInt(30).pipe(z.number().int().min(1).max(3600)),
    PRICE_TICKER_INSTRUMENTS: csv([]).default([]),
    PRICE_TICKER_POST_TO_GROUP: toBool(true).default(true),
    PRICE_TICKER_POST_TO_CHANNEL: toBool(true).default(true),
    UNIVERSE_DEFAULT_SYMBOLS: csv([]).default([]),
    UNIVERSE_MAX_SYMBOLS: toInt(100).pipe(z.number().int().min(1).max(1000)),
    CANDLE_INGEST_ENABLED: toBool(true).default(true),
    CANDLE_INGEST_INTERVAL_SECONDS: toInt(60).pipe(z.number().int().min(10).max(3600)),
    CANDLE_INGEST_CONCURRENCY: toInt(5).pipe(z.number().int().min(1).max(50)),
    CANDLE_AGGREGATE_ENABLED: toBool(true).default(true),
    CANDLE_AGGREGATE_CONCURRENCY: toInt(5).pipe(z.number().int().min(1).max(50)),
    AGG_TIMEFRAMES: csv(["5m", "15m"]).default(["5m", "15m"]),

    SIGNAL_ENGINE_ENABLED: toBool(true).default(true),
    SIGNAL_ENGINE_INTERVAL_SECONDS: toInt(30).pipe(z.number().int().min(5).max(3600)),
    DEFAULT_SIGNAL_TIMEFRAMES: csv(["5m", "15m"]).default(["5m", "15m"]),
    MIN_CANDLES: toInt(50).pipe(z.number().int().min(2).max(2000)),
    SIGNAL_COOLDOWN_SECONDS: toInt(600).pipe(z.number().int().min(0).max(24 * 3600)),
    SIGNAL_ENGINE_CONCURRENCY: toInt(5).pipe(z.number().int().min(1).max(50)),
    SIGNAL_STRATEGY_NAME: z.string().trim().default("MVP_V1"),

    BINANCE_BASE_URL: z.string().trim().default("https://data-api.binance.vision"),
    BINANCE_INTERVAL: z.string().trim().default("15m"),
    BINANCE_KLINES_LIMIT: toInt(200).pipe(z.number().int().min(1).max(1000)),
    BINANCE_REQUEST_TIMEOUT_MS: toInt(10000).pipe(z.number().int().min(1000).max(120_000)),

    STRATEGIES_ENABLED: csv(["ema_rsi", "rsi_threshold", "breakout", "macd"]).default([
      "ema_rsi",
      "rsi_threshold",
      "breakout",
      "macd",
    ]),

    EMA_FAST_PERIOD: toInt(12).pipe(z.number().int().min(1).max(500)),
    EMA_SLOW_PERIOD: toInt(26).pipe(z.number().int().min(1).max(500)),
    RSI_PERIOD: toInt(14).pipe(z.number().int().min(1).max(500)),
    RSI_BUY_THRESHOLD: toInt(30).pipe(z.number().int().min(0).max(100)),
    RSI_SELL_THRESHOLD: toInt(70).pipe(z.number().int().min(0).max(100)),

    BREAKOUT_LOOKBACK: toInt(20).pipe(z.number().int().min(1).max(500)),

    MACD_FAST_PERIOD: toInt(12).pipe(z.number().int().min(1).max(500)),
    MACD_SLOW_PERIOD: toInt(26).pipe(z.number().int().min(1).max(500)),
    MACD_SIGNAL_PERIOD: toInt(9).pipe(z.number().int().min(1).max(500)),

    ENABLE_RISK_LEVELS: toBool(true).default(true),
    ATR_PERIOD: toInt(14).pipe(z.number().int().min(1).max(500)),
    SL_ATR_MULTIPLIER: toFloat(1.5).pipe(z.number().min(0.1).max(50)),
    TP1_ATR_MULTIPLIER: toFloat(2).pipe(z.number().min(0.1).max(50)),
    TP2_ATR_MULTIPLIER: toFloat(3).pipe(z.number().min(0.1).max(50)),

    SIGNAL_DEDUPE_TTL_SECONDS: toInt(7200).pipe(z.number().int().min(1).max(7 * 24 * 3600)),
    SIGNAL_MIN_COOLDOWN_SECONDS: toInt(1).pipe(z.number().int().min(0).max(3600)),

    DIGEST_TIME_UTC: z.string().trim().default("20:00"),
    DIGEST_ENABLED: toBool(true).default(true),
    DIGEST_POST_TO_GROUP: toBool(true).default(true),
    DIGEST_POST_TO_CHANNEL: toBool(false).default(false),

    TRADINGVIEW_WEBHOOK_ENABLED: toBool(true).default(true),
    TRADINGVIEW_WEBHOOK_SECRET: z.string().trim().optional().default(""),
    TRADINGVIEW_SEND_ALL: toBool(false).default(false),

    TRADINGVIEW_DEFAULT_ASSET_TYPE: z.enum(["GOLD", "CRYPTO"]).default("GOLD"),
    TRADINGVIEW_DEFAULT_INSTRUMENT: z.string().trim().default("XAUTUSDT"),
    TRADINGVIEW_DEFAULT_INTERVAL: z.string().trim().default("1s"),
    TRADINGVIEW_DEFAULT_STRATEGY: z.string().trim().default("tradingview"),

    TRADINGVIEW_PRICE_FALLBACK_TIMEOUT_MS: toInt(2000).pipe(z.number().int().min(0).max(30_000)),

    WEBHOOK_MAX_BODY_KB: toInt(64).pipe(z.number().int().min(1).max(1024)),
    RATE_LIMIT_WEBHOOK_RPM: toInt(60).pipe(z.number().int().min(1).max(6000)),

    TRADINGVIEW_EMAIL_ENABLED: toBool(false).default(false),
    TRADINGVIEW_IMAP_HOST: z.string().trim().optional(),
    TRADINGVIEW_IMAP_PORT: toInt(993).pipe(z.number().int().min(1).max(65535)),
    TRADINGVIEW_IMAP_SECURE: toBool(true).default(true),
    TRADINGVIEW_IMAP_USER: z.string().trim().optional(),
    TRADINGVIEW_IMAP_PASS: z.string().optional(),
    TRADINGVIEW_EMAIL_FOLDER: z.string().trim().default("INBOX"),
    TRADINGVIEW_EMAIL_POLL_SECONDS: toInt(30).pipe(z.number().int().min(5).max(3600)),

    HTTP_PROXY: z.string().trim().optional(),
    HTTPS_PROXY: z.string().trim().optional(),
    ALL_PROXY: z.string().trim().optional(),
    NO_PROXY: z.string().trim().optional(),

    BINANCE_WS_ENABLED: toBool(false).default(false),
    BINANCE_WS_BASE_URL: z.string().trim().default("wss://stream.binance.com:9443"),

    RUN_API: toBool(true).default(true),
    RUN_WORKER: toBool(false).default(false),
    MIGRATE_ON_START: toBool(false).default(false),

    RENDER_KEEPALIVE_ENABLED: toBool(false).default(false),
    RENDER_KEEPALIVE_URL: z.string().trim().optional(),
  })
  .passthrough();

export const envSchema = envObject.superRefine((env, ctx) => {
  if (env.TRADINGVIEW_WEBHOOK_ENABLED && !env.TRADINGVIEW_WEBHOOK_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["TRADINGVIEW_WEBHOOK_SECRET"],
      message: "TRADINGVIEW_WEBHOOK_SECRET is required when TRADINGVIEW_WEBHOOK_ENABLED=true",
    });
  }

  if (!env.TELEGRAM_USE_POLLING) {
    if (!env.TELEGRAM_WEBHOOK_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["TELEGRAM_WEBHOOK_URL"],
        message: "TELEGRAM_WEBHOOK_URL is required when TELEGRAM_USE_POLLING=false",
      });
    }
    if (!env.TELEGRAM_WEBHOOK_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["TELEGRAM_WEBHOOK_SECRET"],
        message: "TELEGRAM_WEBHOOK_SECRET is required when TELEGRAM_USE_POLLING=false",
      });
    }
  }

  if (env.RENDER_KEEPALIVE_ENABLED && !env.RENDER_KEEPALIVE_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["RENDER_KEEPALIVE_URL"],
      message: "RENDER_KEEPALIVE_URL is required when RENDER_KEEPALIVE_ENABLED=true",
    });
  }
});

// برای اینکه هم core.module قدیمی نشکنه هم اسم جدید داشته باشی:
export const EnvSchema = envSchema;
export type Env = z.infer<typeof envSchema>;
