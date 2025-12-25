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

   Optional but recommended:

   - `TELEGRAM_SIGNAL_CHANNEL_ID`
   - `TELEGRAM_SIGNAL_GROUP_ID`
   - `OWNER_USER_ID` or `ADMIN_TEST_TOKEN` for the admin test endpoint

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

### Admin test endpoint

Use the following endpoint to validate Telegram connectivity:

```
POST /admin/test-telegram
```

Provide either:

- `x-owner-user-id` header matching `OWNER_USER_ID`, or
- `x-admin-token` header matching `ADMIN_TEST_TOKEN`.
