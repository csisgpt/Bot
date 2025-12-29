#!/bin/sh
set -eu

if [ -z "${TELEGRAM_BOT_TOKEN:-}" ]; then
  echo "خطا: TELEGRAM_BOT_TOKEN تنظیم نشده است." >&2
  exit 1
fi

if [ -z "${TELEGRAM_WEBHOOK_URL:-}" ]; then
  echo "خطا: TELEGRAM_WEBHOOK_URL تنظیم نشده است." >&2
  exit 1
fi

if [ -z "${TELEGRAM_WEBHOOK_SECRET:-}" ]; then
  echo "خطا: TELEGRAM_WEBHOOK_SECRET تنظیم نشده است." >&2
  exit 1
fi

api_url="https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook"

curl -sS -X POST "$api_url" \
  -d "url=${TELEGRAM_WEBHOOK_URL}" \
  -d "secret_token=${TELEGRAM_WEBHOOK_SECRET}"

echo "\nوبهوک تلگرام ارسال شد. بررسی کنید که پاسخ Telegram ok=true باشد."
