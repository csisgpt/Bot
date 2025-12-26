# Deployment Overview

## Architecture

- **Liara** runs the **API only** (`apps/api`).
- **Render** runs the **Worker only** (`apps/worker`) as a Web Service.
- Both services share the same Redis queue and may share the same database.

Running two worker instances against the same queue can cause duplicate or conflicting background jobs, so keep **exactly one worker deployment** active in production.

## Migration strategy

- **Development:** use `prisma migrate dev` locally for schema changes.
- **Production:** use `prisma migrate deploy` only (never `prisma db push`).
- Migrations run on startup **only when the API is enabled** (`RUN_API=true`) and `MIGRATE_ON_START=true`.
- The worker-only deployment must not run migrations.

## Node modules

`node_modules` must not be committed. If it is tracked accidentally, remove it manually with:
`git rm --cached -r node_modules` (do not delete the directory itself).

## Verification checklist

- **Local worker (dev):**
  - `PORT=3001 RUN_API=false RUN_WORKER=true pnpm dev:worker`
  - `curl -s http://localhost:3001/health`
- **Local worker (prod build):**
  - `pnpm build:worker`
  - `PORT=3001 node dist/apps/worker/main.js`
  - `curl -s http://localhost:3001/health`
- **Docker worker-only:**
  - `docker run -e RUN_API=false -e RUN_WORKER=true -e PORT=3001 -p 3001:3001 <image>`
- **Docker api-only:**
  - `docker run -e RUN_API=true -e RUN_WORKER=false -e PORT=3000 -p 3000:3000 <image>`
