#!/usr/bin/env bash
# Runs the full dev stack without Docker: Postgres, Redis, migrations, engine,
# api, worker and web (http://localhost:5173). Ctrl-C stops everything.
# Run `npm run dev:native:setup` once first. Logs: $FCC_NATIVE_DIR/*.log
set -euo pipefail
cd "$(dirname "$0")/.."

STATE=${FCC_NATIVE_DIR:-/tmp/fcc-native}
PGDIR="$STATE/pg"
PG_BIN=$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)
export PATH="$STATE/node/node_modules/node/bin:$PATH"

export DATABASE_URL=postgresql://chess_coach:chess_coach@localhost:5432/chess_coach
export ENGINE_URL=http://localhost:8081 REDIS_URL=redis://localhost:6379
export API_INTERNAL_URL=http://localhost:3000
export LLM_FAKE=${LLM_FAKE:-1} AUTH_MODE=${AUTH_MODE:-dev-stub} COACH_DEV_COMMANDS=${COACH_DEV_COMMANDS:-1}
export LLM_UNLOCK_PEPPER=${LLM_UNLOCK_PEPPER:-local-development-pepper}
export LLM_UNLOCK_CACHE_KEY=${LLM_UNLOCK_CACHE_KEY:-MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=}
export ENGINE_TUNNEL_INTERNAL_TOKEN=${ENGINE_TUNNEL_INTERNAL_TOKEN:-dev-internal-token-not-for-production-use}

if [ "$(id -u)" -eq 0 ]; then PGRUN="su postgres -c"; else PGRUN="bash -c"; fi
$PGRUN "$PG_BIN/pg_ctl -D $PGDIR/data -l $PGDIR/pg.log -o '-p 5432 -k $PGDIR' -w start" || true
redis-cli ping >/dev/null 2>&1 || redis-server --save '' --appendonly no --daemonize yes >/dev/null

npm run migrate -w apps/api

PIDS=()
cleanup() {
  kill "${PIDS[@]}" 2>/dev/null || true
  $PGRUN "$PG_BIN/pg_ctl -D $PGDIR/data stop -m fast" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM
start() { local n=$1; shift; "$@" >"$STATE/$n.log" 2>&1 & PIDS+=($!); }
start engine npm run dev -w services/engine
start api npm run dev -w apps/api
start worker npm run dev:worker -w apps/api
start web npm run dev -w apps/web -- --host

echo "Web http://localhost:5173  API :3000  Engine :8081  (logs in $STATE)"
wait
