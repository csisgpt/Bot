# Migration rename guidance

This repo renamed two Prisma migration folders to fix ordering for fresh deploys. Prisma tracks
migration folder names in the `_prisma_migrations` table, so existing databases need a one-time
rename update.

## Fresh databases

Run migrations as usual:

```bash
pnpm prisma:migrate:deploy
```

## Existing databases

1. Update the tracked migration names:

```sql
UPDATE "_prisma_migrations" SET migration_name = '20250101000000_init'
WHERE migration_name = '20251226210506_init';

UPDATE "_prisma_migrations" SET migration_name = '20250312000001_chat_config_alerts'
WHERE migration_name = '20250312000000_chat_config_alerts';
```

2. Then run:

```bash
pnpm prisma:migrate:deploy
```
