# راهنمای استقرار: Liara (API) + Render (Worker)

این راهنما فرض می‌کند سرویس API روی Liara و سرویس Worker روی Render اجرا می‌شوند.

## پیش‌نیازها

- دیتابیس Postgres قابل دسترس با `DATABASE_URL`
- Redis مشترک برای صف‌ها و کش‌ها (`REDIS_URL`)
- دسترسی خروجی به Telegram API

## استقرار API روی Liara

### متغیرهای محیطی پیشنهادی

- `RUN_API=true`
- `RUN_WORKER=false`
- `MIGRATE_ON_START=true` (فقط برای API)
- `DATABASE_URL`
- `REDIS_URL`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_URL` (باید به `/telegram/webhook` ختم شود)
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_USE_POLLING=false`
- سایر متغیرهای مورد نیاز پروژه (Providerها، خبرها، آر‌بیتراژ، ...)

### Health check

- مسیر پیشنهادی: `GET /health`
- نمونه:
  ```bash
  curl -s https://<liara-domain>/health
  ```

## استقرار Worker روی Render

### متغیرهای محیطی پیشنهادی

- `RUN_API=false`
- `RUN_WORKER=true`
- `MIGRATE_ON_START=false`
- `DATABASE_URL`
- `REDIS_URL`
- سایر متغیرهای عملیاتی (Providerها، خبرها، آر‌بیتراژ، ...)

### Health check

Worker باید به پورت `PORT` رندر گوش بدهد و `/health` را ارائه دهد.

- نمونه:
  ```bash
  curl -s https://<render-service>.onrender.com/health
  ```

## استراتژی مایگریشن

- **فقط سرویس API** مجاز به اجرای مایگریشن است.
- در Worker مقدار `MIGRATE_ON_START` باید `false` باشد.
- در Liara مقدار `MIGRATE_ON_START=true` و `RUN_API=true` تنظیم شود.

## تنظیم Webhook تلگرام

- مسیر صحیح وبهوک: `POST /telegram/webhook`
- هدر امنیتی باید با `TELEGRAM_WEBHOOK_SECRET` برابر باشد.
- هدر مورد انتظار Telegram: `x-telegram-bot-api-secret-token`

### اسکریپت کمکی

اسکریپت زیر با استفاده از متغیرهای محیطی وبهوک را تنظیم می‌کند:

```bash
export TELEGRAM_BOT_TOKEN=...
export TELEGRAM_WEBHOOK_URL=https://<liara-domain>/telegram/webhook
export TELEGRAM_WEBHOOK_SECRET=...

sh ./scripts/telegram-set-webhook.sh
```
