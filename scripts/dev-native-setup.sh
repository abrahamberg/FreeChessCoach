#!/usr/bin/env bash
# One-time setup for running the stack without Docker (sandboxes, CI boxes).
# Installs Stockfish, provisions Node 24 if needed, npm ci, and creates a local
# Postgres cluster. Idempotent. Needs Postgres 16 and redis-server on the box.
set -euo pipefail
cd "$(dirname "$0")/.."

STATE=${FCC_NATIVE_DIR:-/tmp/fcc-native}
PG_BIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)
SUDO=""; [ "$(id -u)" -ne 0 ] && SUDO="sudo"
PGDIR="$STATE/pg"
mkdir -p "$STATE" "$PGDIR"

[ -x /usr/games/stockfish ] || $SUDO apt-get install -y stockfish
[ -n "$PG_BIN" ] || { echo "Postgres server binaries not found (apt-get install postgresql)"; exit 1; }
command -v redis-server >/dev/null || { echo "redis-server not found (apt-get install redis-server)"; exit 1; }

# Node >=24.15: use the current one if new enough, else fetch it from npm.
if ! node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>24||(a===24&&b>=15)?0:1)'; then
  [ -x "$STATE/node/node_modules/node/bin/node" ] || {
    mkdir -p "$STATE/node" && (cd "$STATE/node" && npm init -y >/dev/null && npm i node@24)
  }
fi
export PATH="$STATE/node/node_modules/node/bin:$PATH"
node -v
npm ci

# Postgres runs as a non-root user (postgres refuses to run as root).
if [ "$(id -u)" -eq 0 ]; then
  id postgres >/dev/null 2>&1 || useradd -m postgres
  PGRUN="su postgres -c"
else
  PGRUN="bash -c"
fi
[ "$(id -u)" -eq 0 ] && chown postgres "$PGDIR"
if [ ! -f "$PGDIR/data/PG_VERSION" ]; then
  $PGRUN "$PG_BIN/initdb -D $PGDIR/data -A trust >/dev/null"
fi
$PGRUN "$PG_BIN/pg_ctl -D $PGDIR/data -l $PGDIR/pg.log -o '-p 5432 -k $PGDIR' -w start" || true
psql -h "$PGDIR" -U postgres -tc "select 1 from pg_roles where rolname='chess_coach'" | grep -q 1 ||
  psql -h "$PGDIR" -U postgres -c "create user chess_coach password 'chess_coach' superuser"
psql -h "$PGDIR" -U postgres -tc "select 1 from pg_database where datname='chess_coach'" | grep -q 1 ||
  psql -h "$PGDIR" -U postgres -c "create database chess_coach owner chess_coach"
$PGRUN "$PG_BIN/pg_ctl -D $PGDIR/data stop -m fast" || true
echo "Setup done. Run: npm run dev:native"
