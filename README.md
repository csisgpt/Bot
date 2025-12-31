# Bot

Signals bot for Binance Spot data that generates trading alerts and sends them to Telegram. GOLD signals use Tether Gold on Binance Spot (`XAUTUSDT`), and CRYPTO signals use standard spot instruments like `BTCUSDT`.

## What this project does

- Worker pulls candle data from Binance Spot (default data provider).
- TradingView alerts can be ingested via webhook or email and mapped into the same signal pipeline.
- GOLD is tokenized gold (`XAUTUSDT`).
- Multiple strategies generate signals that are persisted to Postgres and sent to Telegram.

## Architecture

- `apps/api`: API + admin test endpoint.
- `apps/worker`: Cron worker that fetches candles, generates signals, and queues Telegram notifications.
- `apps/worker/src/market-data-v3`: Multi-provider market data ingest + normalization.
- `apps/worker/src/arbitrage`: Arbitrage scanner (cross-exchange spread).
- `apps/worker/src/news`: News fetcher (Binance/Bybit/OKX announcements).
- `libs/*`: shared Binance client, signal strategies, Telegram integration, and core utilities.
- Prisma + Postgres for persistence.
- BullMQ + Redis for background jobs.

## Local development (Liara Postgres + Liara Redis, no Docker)

1. Copy the example env file:

   ```bash
   cp .env.example .env
   ```

2. Configure required env values in `.env`:

   - `DATABASE_URL` (Liara Postgres must include `sslmode=require`)
   - `REDIS_URL` (Liara Redis supports `redis://` or `rediss://`)
   - `TELEGRAM_BOT_TOKEN`

3. Install dependencies:

   ```bash
   pnpm install
   ```

4. Generate Prisma client and run migrations:

   ```bash
   pnpm prisma:generate
   pnpm prisma:migrate:deploy
   ```

5. Start API and worker in separate terminals:

   ```bash
   pnpm dev:api
   pnpm dev:worker
   ```

## Endpoints

- `GET /health` (API)
- `GET /health` (worker)
- `POST /admin/test-telegram`
- `POST /webhooks/tradingview`
- `POST /telegram/webhook`

For the admin Telegram test endpoint, provide either:

- `x-owner-user-id` header matching `TELEGRAM_OWNER_USER_ID` (or legacy `OWNER_USER_ID`), or
- `x-admin-token` header matching `ADMIN_TEST_TOKEN`.

## Configuration guide

### Signal sources

- **Binance** remains the default data provider for candles/quotes.
- **TradingView** is a signal provider and can be ingested via webhook (paid plan) or email (free plan).

### Price ticker (Binance WS)

Enable the real-time price ticker (posts every 10 seconds via the worker queue):

```bash
PRICE_TICKER_ENABLED=true
PRICE_TICKER_POST_SECONDS=10
PRICE_TICKER_POST_TO_GROUP=true
PRICE_TICKER_POST_TO_CHANNEL=true
PRICE_TICKER_INSTRUMENTS=XAUTUSDT,BTCUSDT
```

Required Telegram config:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_SIGNAL_GROUP_ID` and/or `TELEGRAM_SIGNAL_CHANNEL_ID`

Binance WebSocket is used for real-time pricing and Redis caches the latest values. If the WS feed is unavailable, the worker falls back to Binance REST.

**Note:** This is a high-frequency test mode and will post every 10 seconds without anti-spam.

### Multi-provider market data (PR3)

Enable the multi-provider WS ingest (Binance/Bybit/OKX) via env:

```bash
MARKET_DATA_ENABLED_PROVIDERS=binance,bybit,okx
MARKET_DATA_WS_ENABLED_PROVIDERS=binance,bybit,okx
MARKET_DATA_INGEST_ENABLED=true
MARKET_DATA_TIMEFRAMES=1m
```

Legacy mode (PR1 ingest) is used when `MARKET_DATA_INGEST_ENABLED=false`. In that mode, `CANDLE_INGEST_ENABLED` and `CANDLE_AGGREGATE_ENABLED` control the legacy Binance-only ingest/aggregation.
For PR3 mode, keep `MARKET_DATA_INGEST_ENABLED=true` and leave legacy ingest flags on their defaults (they are ignored while v3 is enabled).
When `LEGACY_CANDLE_COMPAT_ENABLED=true`, Binance candles are also written to the legacy `Candle` table so PR2 signals continue to work.
Legacy Binance WS price ingest is disabled in V3 mode (set `PRICE_INGEST_ENABLED=false`).

WebSocket/REST endpoints:

```bash
BINANCE_WS_URL=wss://stream.binance.com:9443/stream
BYBIT_WS_URL=wss://stream.bybit.com/v5/public/spot
BYBIT_REST_URL=https://api.bybit.com
OKX_REST_URL=https://www.okx.com
OKX_POLL_INTERVAL_MS=10000
OKX_REST_CONCURRENCY=4
OKX_WS_ENABLED=false
```

KCEX is scaffolded but disabled by default because official docs are not reliable yet. Enable only when endpoints are confirmed:

```bash
KCEX_ENABLE=false
KCEX_REST_URL=
KCEX_WS_URL=
```

Redis keys written by the ingest worker:

- `latest:ticker:{canonicalSymbol}:{provider}` -> JSON (last/bid/ask/ts)
- `latest:book:{canonicalSymbol}:{provider}` -> JSON (bid/ask/ts)

PR3 ingestion writes to both `MarketCandle` and the legacy `Candle` table so the existing PR2 signal engine continues to work.

### Arbitrage scanner

Enable the arbitrage engine:

```bash
ARB_ENABLED=true
ARB_ENABLED_PROVIDERS=binance,bybit,okx,coinbase,kraken
ARB_SCAN_INTERVAL_SECONDS=5
ARB_MIN_SPREAD_PCT=0.2
ARB_MIN_NET_PCT=0.05
```

The cross-exchange spread strategy reads the latest bid/ask snapshots from Redis and stores opportunities in Postgres (`ArbOpportunity`). Deduplication is done per minute bucket and symbol+pair cooldown.

### News fetcher

Enable the news worker:

```bash
NEWS_ENABLED=true
NEWS_ENABLED_PROVIDERS=binance,bybit,okx
NEWS_FETCH_INTERVAL_MINUTES=5
NEWS_BINANCE_URL=https://www.binance.com/en/support/announcement
NEWS_BYBIT_URL=https://www.bybit.com/en/announcement-info
NEWS_OKX_URL=https://www.okx.com/support/hc/en-us/categories/360000030652
```

News items are normalized and stored in Postgres (`News`) with deduplication by `hash`.

### Feeds (Telegram publishing)

Worker feeds are configured in code (not env) in:

- `apps/worker/src/feeds/feeds.config.ts`

Define schedules (cron) and default symbols in code. Feed destinations can be configured via env (or inline in `feeds.config.ts`). Prices and news feeds run via `FeedRunnerService` and publish HTML messages through the Telegram bot. Ensure these env keys are set for local runs:

- `TELEGRAM_BOT_TOKEN`
- `FEED_PRICES_DESTINATIONS`, `FEED_NEWS_DESTINATIONS`, `FEED_SIGNALS_DESTINATIONS` (comma-separated chat IDs)
- `FEED_PRICES_SYMBOLS` / `FEED_PRICES_PROVIDERS` (optional overrides for price feeds)
- `MARKET_DATA_ENABLED_PROVIDERS` / `MARKET_DATA_WS_ENABLED_PROVIDERS`
- `NEWS_ENABLED_PROVIDERS`
- `ARB_ENABLED_PROVIDERS`
- `NEWS_*` URLs + timeout/retry settings (optional, defaults are set in code)

### Running workers locally

Start the worker with the multi-provider ingest + arbitrage + news enabled:

```bash
pnpm dev:worker
```

Market data v3 provider config (REST/WS):

```bash
MARKET_DATA_ENABLED_PROVIDERS=binance,bybit,okx,coinbase,kraken,kucoin,gateio,mexc,bitfinex,bitstamp
MARKET_DATA_WS_ENABLED_PROVIDERS=binance,bybit,okx,coinbase,kraken
# Enable TwelveData/Navasan by adding them to the list:
# MARKET_DATA_ENABLED_PROVIDERS=...,twelvedata,navasan
# MARKET_DATA_WS_ENABLED_PROVIDERS=...,twelvedata
MARKET_DATA_REST_POLL_INTERVAL_SECONDS=30
```

### How to add Forex/Stocks/Iran symbols to the price feed

Use env overrides to avoid editing `feeds.config.ts`:

```bash
FEED_PRICES_SYMBOLS=BTCUSDT,ETHUSDT,EURUSD,USDJPY,XAUUSD,AAPLUSD,USDIRT,EURIRT,SEKKEHIRT,ABSHODEHIRT,GOLD18IRT
FEED_PRICES_PROVIDERS=binance,bybit,okx,coinbase,kraken,twelvedata,navasan
```

For Navasan mappings, set symbol overrides:

```bash
MARKET_DATA_SYMBOL_OVERRIDES_NAVASAN=USDIRT:usd_sell,EURIRT:eur,SEKKEHIRT:sekkeh,ABSHODEHIRT:abshodeh,GOLD18IRT:18ayar
```

API keys are required when using these providers:

```bash
TWELVEDATA_API_KEY=...
NAVASAN_API_KEY=...
```

Health endpoints:

- `GET /health/providers` (provider connections)
- `GET /health/market-data-v3` (provider stats + active symbols)
- `GET /health/queues` (queue depth)
- `GET /health/arbitrage` (last scan + stale counts)
- `GET /health/news` (last fetch + errors)

### Assets and instruments

Enable assets and their instruments via env:

- `ASSETS_ENABLED=GOLD,CRYPTO`
- `GOLD_INSTRUMENTS=XAUTUSDT`
- `CRYPTO_INSTRUMENTS=BTCUSDT,ETHUSDT`

Legacy `BINANCE_SYMBOLS` is supported if `CRYPTO_INSTRUMENTS` is empty.

### Strategies

Enable strategies via `STRATEGIES_ENABLED`:

- `ema_rsi`: EMA12/EMA26 crossover with RSI filter for confirmation.
- `rsi_threshold`: BUY when RSI is oversold; SELL when RSI is overbought.
- `breakout`: BUY/SELL on breakouts above/below the N-period high/low.
- `macd`: MACD line crossover with the signal line.

### Risk levels

When `ENABLE_RISK_LEVELS=true`, signals include ATR-derived levels:

- `entry` = current price.
- `sl`/`tp1`/`tp2` based on ATR multipliers.

Use `ATR_PERIOD`, `SL_ATR_MULTIPLIER`, `TP1_ATR_MULTIPLIER`, and `TP2_ATR_MULTIPLIER` to tune risk.

### Dedupe and cooldown

- `SIGNAL_DEDUPE_TTL_SECONDS` prevents duplicate alerts for the same candle/strategy/side.
- `SIGNAL_MIN_COOLDOWN_SECONDS` enforces a cooldown per asset + instrument + strategy.

### Telegram bot modes

#### Local dev with polling

Set polling mode so the bot listens via long polling:

```bash
TELEGRAM_USE_POLLING=true
```

Run the API and worker, then open your bot in Telegram and run `/menu`.

#### Production with webhook

1. Set webhook env values:

   ```bash
   TELEGRAM_USE_POLLING=false
   TELEGRAM_WEBHOOK_URL=https://<your-host>/telegram/webhook
   TELEGRAM_WEBHOOK_SECRET=change-me
   ```

2. Register the webhook with Telegram:

   ```bash
   curl -X POST \"https://api.telegram.org/bot<YOUR_TOKEN>/setWebhook\" \\
     -d \"url=https://<your-host>/telegram/webhook\" \\
     -d \"secret_token=change-me\"
   ```

Telegram will include the `x-telegram-bot-api-secret-token` header for verification.

### Chat configuration

Chat configuration is stored per chat (`ChatConfig`) and drives:

- Watchlist instruments (per chat)
- Timeframes and asset toggles
- Minimum confidence
- Quiet hours
- Destination toggles (group vs channel)

If a chat has no overrides, env defaults are used instead.

### Notification modes (PR4.1)

Per-chat notification modes:

- `NORMAL`: تعادل معمولی
- `FOCUS`: سخت‌گیرانه‌تر
- `SLEEP`: بسیار سخت‌گیرانه
- `SCALP`: آزادتر ولی با سقف ساعتی پایین

Quiet hours are evaluated in `APP_TIMEZONE` (default: `Europe/Berlin`).

### TradingView webhook (paid plan)

1. Set `TRADINGVIEW_WEBHOOK_ENABLED=true`.
2. Set `TRADINGVIEW_WEBHOOK_SECRET`.
3. Configure TradingView to POST alerts to:

   ```
   https://<your-host>/webhooks/tradingview
   ```

The webhook handler responds immediately and queues ingest work in the background.

### TradingView email ingest (free plan)

1. Set `TRADINGVIEW_EMAIL_ENABLED=true`.
2. Configure the IMAP settings (`TRADINGVIEW_IMAP_*`) for the mailbox receiving alerts.
3. Alerts will be polled and ingested on the configured interval.
   - Email bodies can be raw JSON or include a JSON block between `---TV_JSON---` and `---/TV_JSON---`.

### Recommended TradingView alert JSON payload

Use this message template for webhook or email (email can embed JSON in the body):

```json
{
  "token": "<secret>",
  "source": "tradingview",
  "assetType": "GOLD",
  "instrument": "XAUTUSDT",
  "interval": "15m",
  "signal": "BUY",
  "price": "{{close}}",
  "strategy": "tv_ema_rsi",
  "time": "{{time}}",
  "tags": ["tv"]
}
```

Webhook endpoints must be served over HTTPS and should respond quickly (<3s) to avoid TradingView retries.

## Smoke test

Run the smoke test to verify DB/Redis connectivity and optional Telegram:

```bash
pnpm smoke:test
```

The script checks Postgres, Redis, and sends a Telegram test message if `TELEGRAM_BOT_TOKEN` and a destination ID are set.

## Troubleshooting

- **Telegram bot**: ensure the bot is an admin in the channel/group you configured.
- **Long polling vs webhook**: use `TELEGRAM_USE_POLLING=true` for local dev, or configure the webhook for production.
- **Liara Postgres**: include `sslmode=require` in `DATABASE_URL`.
- **Liara Redis**: use `rediss://` if TLS is required by your instance.

## Existing DB migration rename

If you already deployed with the previous migration folder names, follow the one-time rename steps in
[`docs/migrations-rename.md`](docs/migrations-rename.md) before running `pnpm prisma:migrate:deploy`.

## Roadmap

- Admin panel for signal monitoring and configuration.
- Additional price providers (e.g., XAUUSD real feed).
- Backtesting tooling.
