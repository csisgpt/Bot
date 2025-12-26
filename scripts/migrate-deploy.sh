#!/bin/sh
set -eu

PRISMA_BIN="./node_modules/.bin/prisma"

if [ ! -x "$PRISMA_BIN" ]; then
  echo "Prisma CLI not found at $PRISMA_BIN" >&2
  exit 1
fi

max_attempts=10
attempt=1

while [ "$attempt" -le "$max_attempts" ]; do
  echo "Running prisma migrate deploy (attempt $attempt/$max_attempts)..."
  if "$PRISMA_BIN" migrate deploy; then
    echo "Prisma migrate deploy succeeded."
    exit 0
  fi

  echo "Prisma migrate deploy failed. Retrying in 3 seconds..." >&2
  attempt=$((attempt + 1))
  sleep 3
done

echo "Prisma migrate deploy failed after $max_attempts attempts." >&2
exit 1
