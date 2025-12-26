# Deploy Worker on Render (Free Web Service)

This repo is a NestJS monorepo with `apps/api` and `apps/worker`. Render Free does not support background worker services, so deploy the worker as a **Web Service** that listens on Render's injected `PORT` and exposes `/health`.

## Render service settings

**Service type:** Web Service

**Build command:**
```
pnpm install --no-frozen-lockfile && pnpm build:worker
```

**Start command:**
```
pnpm start:worker:prod
```

**Health check path:**
```
/health
```

## Required environment variables

Set the same values you use locally. Common ones for the worker include:

- `NODE_ENV=production`
- `REDIS_URL=...` (shared with API)
- `TELEGRAM_BOT_TOKEN=...` (if the worker sends Telegram messages)
- `BINANCE_API_KEY=...` / `BINANCE_SECRET_KEY=...` (if Binance integration is enabled)
- `DATABASE_URL=...` (only if the worker reads from the database)

> Render automatically injects `PORT`; the worker will use it first and bind to `0.0.0.0`.

## Node version

This repo pins Node via `.node-version`. Render should pick it up automatically. If not, set:

```
NODE_VERSION=22.11.0
```

## Prisma

Prisma client generation is required for builds. `pnpm build:worker` runs `pnpm prisma:generate` before building. For production schema changes, use migrations (avoid `prisma db push --accept-data-loss`).

## Verification checklist

### Local (dev)

1. Run the worker in watch mode:
   ```
   PORT=3001 pnpm dev:worker
   ```
2. Verify the health endpoint:
   ```
   curl -s http://localhost:3001/health
   ```
3. Expected log example:
   ```
   Worker listening on 0.0.0.0:3001
   ```

### Local (production-like build)

1. Build the worker:
   ```
   pnpm build:worker
   ```
2. Start the built worker:
   ```
   PORT=3001 pnpm start:worker:prod
   ```
3. Verify health:
   ```
   curl -s http://localhost:3001/health
   ```

### Docker (worker only)

```
docker run -e RUN_API=false -e RUN_WORKER=true -e PORT=3001 -p 3001:3001 <image>
```

### Docker (api only)

```
docker run -e RUN_API=true -e RUN_WORKER=false -e PORT=3000 -p 3000:3000 <image>
```

### Render

1. Deploy the Web Service.
2. Open the Render URL and check:
   ```
   https://<your-service>.onrender.com/health
   ```

> Render Free services sleep after inactivity. During testing, keep it awake by periodically pinging `/health`.
