#!/bin/sh
set -eu

PRISMA_BIN="./node_modules/.bin/prisma"

if [ ! -x "$PRISMA_BIN" ]; then
  echo "Prisma CLI not found at $PRISMA_BIN" >&2
  exit 1
fi

"$PRISMA_BIN" migrate status
