# Deploy API on Liara

This repo runs two apps: `apps/api` and `apps/worker`. Liara should run **API only**.

## Environment variables

Set these on Liara:

- `RUN_API=true`
- `RUN_WORKER=false`
- `MIGRATE_ON_START=true`
- `NODE_ENV`
- `DATABASE_URL`
- `REDIS_URL` (must match the Redis instance used by the worker)
- `PORT`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `BINANCE_API_KEY`
- `BINANCE_SECRET_KEY`

> Only set the variables your API actually uses. Do not store secrets in docs.

## Deployment steps

1. **Create a Docker-based deployment** using the repo `Dockerfile`.
2. **Use the provided `start.sh`** as the container entrypoint.
3. **Confirm runtime flags**:
   - `RUN_API=true`
   - `RUN_WORKER=false`
   - `MIGRATE_ON_START=true`
4. **Deploy** and watch logs for a successful `prisma migrate deploy` run.

## Notes

- Binance-related background tasks should run on the worker service only. Do not run the worker on Liara due to network limitations.
- The start script honors `RUN_API` and `RUN_WORKER` to ensure only the API starts on Liara.
