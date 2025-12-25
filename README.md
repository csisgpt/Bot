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

For the admin Telegram test endpoint, provide either:

- `x-owner-user-id` header matching `TELEGRAM_OWNER_USER_ID` (or legacy `OWNER_USER_ID`), or
- `x-admin-token` header matching `ADMIN_TEST_TOKEN`.

## Configuration guide

### Signal sources

- **Binance** remains the default data provider for candles/quotes.
- **TradingView** is a signal provider and can be ingested via webhook (paid plan) or email (free plan).

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
- **Long polling vs webhook**: this app uses polling via the Telegram API; no webhook is required.
- **Liara Postgres**: include `sslmode=require` in `DATABASE_URL`.
- **Liara Redis**: use `rediss://` if TLS is required by your instance.

## Roadmap

- Admin panel for signal monitoring and configuration.
- Additional price providers (e.g., XAUUSD real feed).
- Backtesting tooling.
