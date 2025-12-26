#!/bin/sh
set -eu

RUN_API="${RUN_API:-true}"
RUN_WORKER="${RUN_WORKER:-true}"
MIGRATE_ON_START="${MIGRATE_ON_START:-true}"

is_true() {
  [ "$1" = "true" ] || [ "$1" = "TRUE" ] || [ "$1" = "1" ]
}

if ! is_true "$RUN_API" && ! is_true "$RUN_WORKER"; then
  echo "ERROR: RUN_API and RUN_WORKER are both false; nothing to run." >&2
  exit 1
fi

if is_true "$RUN_API" && is_true "$MIGRATE_ON_START"; then
  echo "Running prisma migrations..."
  ./scripts/migrate-deploy.sh
fi

PIDS=""

terminate() {
  for pid in $PIDS; do
    kill -TERM "$pid" 2>/dev/null || true
  done
}

trap 'terminate' INT TERM

if is_true "$RUN_WORKER"; then
  echo "Starting worker: dist/apps/worker/main.js"
  node dist/apps/worker/main.js &
  PIDS="$PIDS $!"
fi

if is_true "$RUN_API"; then
  echo "Starting api: dist/apps/api/main.js"
  node dist/apps/api/main.js &
  PIDS="$PIDS $!"
fi

EXIT_CODE=0
for pid in $PIDS; do
  if ! wait "$pid"; then
    EXIT_CODE=$?
    terminate
  fi
done

exit "$EXIT_CODE"
