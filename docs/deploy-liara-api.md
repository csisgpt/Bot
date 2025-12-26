# Deploy API on Liara

This repo runs two apps: `apps/api` and `apps/worker`. Liara should run **API only**.

## Environment variables

Set these on Liara:

- `RUN_API=true`
- `RUN_WORKER=false`
- `MIGRATE_ON_START=true`
- `DATABASE_URL=...`
- `REDIS_URL=...` (must match the Redis instance used by the worker)
- Any API-specific secrets (webhook secrets, Telegram token, etc.)

## Notes

- Binance-related background tasks should run on the worker service only. Do not run the worker on Liara.
- The start script honors `RUN_API` and `RUN_WORKER` to ensure only the API starts on Liara.
