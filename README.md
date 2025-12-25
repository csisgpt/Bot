# Bot

## Local development (Liara Postgres + Liara Redis)

This project runs locally without Docker while connecting to Liara-managed Postgres and Redis.

### Setup

1. Copy the example env file and update the required values:

   ```bash
   cp .env.example .env
   ```

2. Set at least the following values in `.env`:

   - `DATABASE_URL` (must include `sslmode=require` for Liara Postgres)
   - `REDIS_URL`
   - `TELEGRAM_BOT_TOKEN`
   - `ASSETS_ENABLED` (default `GOLD,CRYPTO`)
   - `GOLD_INSTRUMENTS` (default `XAUTUSDT`)

   Optional but recommended:

   - `TELEGRAM_SIGNAL_CHANNEL_ID`
   - `TELEGRAM_SIGNAL_GROUP_ID`
   - `TELEGRAM_OWNER_USER_ID` (or legacy `OWNER_USER_ID`) / `ADMIN_TEST_TOKEN` for the admin test endpoint

3. Install dependencies:

   ```bash
   pnpm install
   ```

4. Generate Prisma client and run migrations:

   ```bash
   pnpm prisma:generate
   pnpm prisma:migrate:deploy
   ```

### Run locally

Start the API and worker in separate terminals:

```bash
pnpm dev:api
pnpm dev:worker
```

### Asset + strategy configuration

- GOLD signals are derived from tokenized gold on Binance Spot (XAUTUSDT).
- Configure assets and instruments using:
  - `ASSETS_ENABLED=GOLD,CRYPTO`
  - `GOLD_INSTRUMENTS=XAUTUSDT`
  - `CRYPTO_INSTRUMENTS=BTCUSDT,ETHUSDT`
- Strategy selection and settings:
  - `STRATEGIES_ENABLED=ema_rsi,rsi_threshold,breakout,macd`
  - `RSI_PERIOD`, `EMA_FAST_PERIOD`, `EMA_SLOW_PERIOD`, `BREAKOUT_LOOKBACK`
- Optional risk levels are controlled by:
  - `ENABLE_RISK_LEVELS=true`
  - `ATR_PERIOD`, `SL_ATR_MULTIPLIER`, `TP1_ATR_MULTIPLIER`, `TP2_ATR_MULTIPLIER`

### Testing Telegram integration

Send a test message with the admin endpoint after setting:

```
POST /admin/test-telegram
```

Provide either:

- `x-owner-user-id` header matching `TELEGRAM_OWNER_USER_ID` (or legacy `OWNER_USER_ID`), or
- `x-admin-token` header matching `ADMIN_TEST_TOKEN`.

### Validate worker signals

1. Ensure Redis + Postgres are reachable and `pnpm dev:worker` is running.
2. Set `ASSETS_ENABLED=GOLD` and `GOLD_INSTRUMENTS=XAUTUSDT` to focus on gold.
3. Watch logs for signal creation and Telegram delivery after at least one candle interval.
