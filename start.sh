#!/bin/sh
set -e

echo "Syncing schema with prisma db push..."
./node_modules/.bin/prisma db push --accept-data-loss --skip-generate

API_MAIN="$(find dist/apps/api -type f -name main.js | head -n 1)"
WORKER_MAIN="$(find dist/apps/worker -type f -name main.js | head -n 1)"

if [ -z "$API_MAIN" ] || [ -z "$WORKER_MAIN" ]; then
  echo "ERROR: Could not find compiled main.js files."
  echo "API_MAIN=$API_MAIN"
  echo "WORKER_MAIN=$WORKER_MAIN"
  echo "Dump dist/apps:"
  find dist/apps -maxdepth 5 -type f -name "*.js" | head -n 200
  exit 1
fi

echo "Starting worker: $WORKER_MAIN"
node "$WORKER_MAIN" &
WORKER_PID=$!

echo "Starting api: $API_MAIN"
node "$API_MAIN" &
API_PID=$!

trap "kill $WORKER_PID $API_PID 2>/dev/null || true" INT TERM

while kill -0 $WORKER_PID 2>/dev/null && kill -0 $API_PID 2>/dev/null; do
  sleep 2
done

kill $WORKER_PID $API_PID 2>/dev/null || true
exit 1
