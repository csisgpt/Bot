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
    QUEUE_MARKET_DATA_NAME: z.string().trim().default("market-data"),
    QUEUE_NEWS_NAME: z.string().trim().default("news"),

    NOTIFICATION_ORCHESTRATOR_ENABLED: toBool(true).default(true),
    NOTIF_MODE_DEFAULT: z.string().trim().default("NORMAL"),
    NOTIF_MAX_PER_HOUR_DEFAULT: toInt(12).pipe(z.number().int().min(1).max(1000)),
    NOTIF_QUIET_HOURS_DEFAULT_ENABLED: toBool(true).default(true),
    NOTIF_QUIET_HOURS_DEFAULT_START: z.string().trim().default("23:00"),
    NOTIF_QUIET_HOURS_DEFAULT_END: z.string().trim().default("08:00"),
    NOTIF_COOLDOWN_SIGNALS_DEFAULT: toInt(600).pipe(z.number().int().min(0).max(86400)),
    NOTIF_COOLDOWN_NEWS_DEFAULT: toInt(1800).pipe(z.number().int().min(0).max(86400)),
    NOTIF_COOLDOWN_ARB_DEFAULT: toInt(300).pipe(z.number().int().min(0).max(86400)),
    NOTIF_MIN_CONFIDENCE_DEFAULT: toInt(60).pipe(z.number().int().min(0).max(100)),
    NOTIF_DIGEST_ENABLED_DEFAULT: toBool(false).default(false),
    NOTIF_DIGEST_TIMES_DEFAULT: csv([]).default([]),

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
    PROVIDERS_ENABLED: z.string().trim().default("binance,bybit,okx"),
    MARKET_DATA_INGEST_ENABLED: toBool(true).default(true),
    MARKET_DATA_TIMEFRAMES: csv(["1m"]).default(["1m"]),
    MARKET_DATA_TICKER_TTL_SECONDS: toInt(120).pipe(z.number().int().min(5).max(3600)),
    LEGACY_CANDLE_COMPAT_ENABLED: toBool(true).default(true),

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
    LEGACY_SIGNALS_CRON_ENABLED: toBool(false).default(false),

    BINANCE_BASE_URL: z.string().trim().default("https://data-api.binance.vision"),
    BINANCE_INTERVAL: z.string().trim().default("15m"),
    BINANCE_KLINES_LIMIT: toInt(200).pipe(z.number().int().min(1).max(1000)),
    BINANCE_REQUEST_TIMEOUT_MS: toInt(10000).pipe(z.number().int().min(1000).max(120_000)),
    BINANCE_WS_URL: z.string().trim().default("wss://stream.binance.com:9443/stream"),
    BINANCE_WS_MINI_TICKER: toBool(false).default(false),

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

    BYBIT_WS_URL: z.string().trim().default("wss://stream.bybit.com/v5/public/spot"),
    BYBIT_REST_URL: z.string().trim().default("https://api.bybit.com"),
    BYBIT_REST_TIMEOUT_MS: toInt(10000).pipe(z.number().int().min(1000).max(120_000)),
    BYBIT_REST_FALLBACK_INTERVAL_SECONDS: toInt(60).pipe(z.number().int().min(10).max(3600)),

    OKX_REST_URL: z.string().trim().default("https://www.okx.com"),
    OKX_REST_TIMEOUT_MS: toInt(10000).pipe(z.number().int().min(1000).max(120_000)),
    OKX_REST_TICKER_INTERVAL_SECONDS: toInt(10).pipe(z.number().int().min(1).max(600)),
    OKX_REST_CANDLE_INTERVAL_SECONDS: toInt(60).pipe(z.number().int().min(10).max(3600)),
    OKX_POLL_INTERVAL_MS: toInt(10000).pipe(z.number().int().min(1000).max(60_000)),
    OKX_REST_CONCURRENCY: toInt(4).pipe(z.number().int().min(1).max(20)),
    OKX_WS_URL: z.string().trim().optional(),
    OKX_WS_ENABLED: toBool(false).default(false),

    KCEX_ENABLE: toBool(false).default(false),
    KCEX_REST_URL: z.string().trim().optional(),
    KCEX_WS_URL: z.string().trim().optional(),

    ARB_ENABLED: toBool(true).default(true),
    ARB_SCAN_INTERVAL_SECONDS: toInt(5).pipe(z.number().int().min(1).max(3600)),
    ARB_STALE_MS: toInt(15000).pipe(z.number().int().min(1000).max(300_000)),
    ARB_MIN_SPREAD_PCT: toFloat(0.2).pipe(z.number().min(0).max(100)),
    ARB_MIN_NET_PCT: toFloat(0.05).pipe(z.number().min(-100).max(100)),
    ARB_COOLDOWN_SECONDS: toInt(60).pipe(z.number().int().min(0).max(3600)),
    ARB_DEDUPE_TTL_SECONDS: toInt(300).pipe(z.number().int().min(10).max(3600)),
    ARB_FUNDING_ENABLED: toBool(false).default(false),
    ARB_TRIANGULAR_ENABLED: toBool(false).default(false),
    ARB_DEPTH_ENABLED: toBool(false).default(false),
    PROVIDER_TAKER_FEE_BPS_BINANCE: toFloat(10).pipe(z.number().min(0).max(1000)),
    PROVIDER_TAKER_FEE_BPS_BYBIT: toFloat(10).pipe(z.number().min(0).max(1000)),
    PROVIDER_TAKER_FEE_BPS_OKX: toFloat(10).pipe(z.number().min(0).max(1000)),
    PROVIDER_TAKER_FEE_BPS_KCEX: toFloat(10).pipe(z.number().min(0).max(1000)),

    NEWS_ENABLED: toBool(true).default(true),
    NEWS_FETCH_INTERVAL_MINUTES: toInt(5).pipe(z.number().int().min(1).max(1440)),
    NEWS_HTTP_TIMEOUT_MS: toInt(10000).pipe(z.number().int().min(1000).max(120_000)),
    NEWS_RETRY_ATTEMPTS: toInt(3).pipe(z.number().int().min(1).max(10)),
    NEWS_RETRY_BASE_DELAY_MS: toInt(500).pipe(z.number().int().min(100).max(10_000)),
    NEWS_BINANCE_URL: z.string().trim().default("https://www.binance.com/en/support/announcement"),
    NEWS_BYBIT_URL: z.string().trim().default("https://www.bybit.com/en/announcement-info"),
    NEWS_OKX_URL: z.string().trim().default("https://www.okx.com/support/hc/en-us/categories/360000030652"),

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

export const envSchema = envObject;

export const envSchemaWithRefinements = envObject.superRefine((env, ctx) => {
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
export const EnvSchema = envSchemaWithRefinements;
export type Env = z.infer<typeof envSchemaWithRefinements>;
