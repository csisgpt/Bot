#!/bin/sh
set -e

RUN_API="${RUN_API:-true}"
RUN_WORKER="${RUN_WORKER:-true}"
MIGRATE_ON_START="${MIGRATE_ON_START:-true}"

is_true() {
  [ "$1" = "true" ] || [ "$1" = "TRUE" ] || [ "$1" = "1" ]
}

if ! is_true "$RUN_API" && ! is_true "$RUN_WORKER"; then
  echo "ERROR: RUN_API and RUN_WORKER are both false; nothing to run."
  exit 1
fi

API_MAIN=""
WORKER_MAIN=""

if is_true "$RUN_API"; then
  API_MAIN="$(find dist/apps/api -type f -name main.js | head -n 1)"
  if [ -z "$API_MAIN" ]; then
    echo "ERROR: Could not find compiled API main.js."
    find dist/apps -maxdepth 5 -type f -name "*.js" | head -n 200
    exit 1
  fi
fi

if is_true "$RUN_WORKER"; then
  WORKER_MAIN="$(find dist/apps/worker -type f -name main.js | head -n 1)"
  if [ -z "$WORKER_MAIN" ]; then
    echo "ERROR: Could not find compiled worker main.js."
    find dist/apps -maxdepth 5 -type f -name "*.js" | head -n 200
    exit 1
  fi
fi

if is_true "$RUN_API" && is_true "$MIGRATE_ON_START"; then
  echo "Running prisma migrations..."
  ./node_modules/.bin/prisma migrate deploy
fi

PIDS=""

terminate() {
  for pid in $PIDS; do
    kill "$pid" 2>/dev/null || true
  done
}

trap "terminate" INT TERM

if is_true "$RUN_WORKER"; then
  echo "Starting worker: $WORKER_MAIN"
  node "$WORKER_MAIN" &
  PIDS="$PIDS $!"
fi

if is_true "$RUN_API"; then
  echo "Starting api: $API_MAIN"
  node "$API_MAIN" &
  PIDS="$PIDS $!"
fi

EXIT_CODE=0
while :; do
  for pid in $PIDS; do
    if ! kill -0 "$pid" 2>/dev/null; then
      wait "$pid" || EXIT_CODE=$?
      terminate
      exit "$EXIT_CODE"
    fi
  done
  sleep 2
done
