#!/bin/sh
set -eu

RUN_API="${RUN_API:-true}"
RUN_WORKER="${RUN_WORKER:-true}"
MIGRATE_ON_START="${MIGRATE_ON_START:-true}"

is_true() {
  v="${1:-}"
  [ "$v" = "true" ] || [ "$v" = "TRUE" ] || [ "$v" = "1" ] || [ "$v" = "yes" ] || [ "$v" = "YES" ]
}

# پیدا کردن entrypoint واقعی هر اپ (api/worker)
pick_entry() {
  APP="$1"

  # مسیرهای رایج (اولویت بالا)
  if [ -f "dist/apps/$APP/main.js" ]; then
    echo "dist/apps/$APP/main.js"
    return 0
  fi
  if [ -f "dist/apps/$APP/src/main.js" ]; then
    echo "dist/apps/$APP/src/main.js"
    return 0
  fi

  # fallback: هر main.js داخل مسیر مربوط به اون app
  found="$(find dist -maxdepth 7 -type f -name 'main.js' -path "*/apps/$APP/*" 2>/dev/null | head -n 1 || true)"
  if [ -n "${found:-}" ]; then
    echo "$found"
    return 0
  fi

  return 1
}

echo "=== Boot configuration ==="
echo "RUN_API=$RUN_API"
echo "RUN_WORKER=$RUN_WORKER"
echo "MIGRATE_ON_START=$MIGRATE_ON_START"
echo "NODE_ENV=${NODE_ENV:-}"
echo "=========================="

# دیباگ dist: کمک می‌کند دقیق بفهمیم داخل ایمیج چی وجود دارد
echo "=== DEBUG dist listing ==="
ls -la /app || true
if [ -d "dist" ]; then
  echo "[dist exists] top-level:"
  ls -la dist || true
  echo "[dist main.js candidates:]"
  find dist -maxdepth 7 -type f -name "main.js" -print 2>/dev/null || true
else
  echo "WARNING: dist directory not found at /app/dist"
fi
echo "=========================="

if ! is_true "$RUN_API" && ! is_true "$RUN_WORKER"; then
  echo "ERROR: RUN_API and RUN_WORKER are both false; nothing to run." >&2
  exit 1
fi

# migrations (اختیاری)
if is_true "$MIGRATE_ON_START" && ! is_true "$RUN_API"; then
  echo "Migrations are enabled but RUN_API is false; skipping migrate deploy."
fi

if is_true "$RUN_API" && is_true "$MIGRATE_ON_START"; then
  if [ -f "./scripts/migrate-deploy.sh" ]; then
    echo "Running prisma migrations (API only)..."
    sh ./scripts/migrate-deploy.sh
  else
    echo "WARNING: ./scripts/migrate-deploy.sh not found. Skipping migrations."
  fi
fi

PIDS=""

terminate() {
  echo "Stopping processes..."
  for pid in $PIDS; do
    kill -TERM "$pid" 2>/dev/null || true
  done
}

trap 'terminate' INT TERM

start_one() {
  APP="$1"
  ENTRY="$(pick_entry "$APP" || true)"

  if [ -z "${ENTRY:-}" ]; then
    echo "ERROR: Could not find entrypoint for '$APP'." >&2
    echo "Dumping dist tree (maxdepth 7):" >&2
    find dist -maxdepth 7 -type f -print 2>/dev/null || true
    exit 1
  fi

  echo "Starting $APP: $ENTRY"
  node "$ENTRY" &
  PIDS="$PIDS $!"
}

# شروع Worker و API
if is_true "$RUN_WORKER"; then
  start_one "worker"
fi

if is_true "$RUN_API"; then
  start_one "api"
fi

# اگر یکی کرش کرد، همه رو می‌بندیم
EXIT_CODE=0
for pid in $PIDS; do
  if ! wait "$pid"; then
    EXIT_CODE=$?
    echo "Process $pid exited with code $EXIT_CODE"
    terminate
    break
  fi
done

exit "$EXIT_CODE"
