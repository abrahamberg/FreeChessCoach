#!/usr/bin/env bash
# Run the three built images the way the Helm chart runs them, and prove they
# work before anything is pushed or deployed.
#
# Every container gets the chart's restrictions (values.yaml podSecurityContext /
# containerSecurityContext): uid 1000, read-only root filesystem, all Linux
# capabilities dropped, no privilege escalation. Only web gets a writable /tmp,
# matching the emptyDir the chart mounts for it. A real Postgres backs the
# migrate job, api and worker.
#
# Checks: images run as uid 1000 and have no shell; migrations apply; api
# /healthz + /readyz (DB reachable); the worker stays up; the engine spawns
# Stockfish and returns an analysis; nginx serves the SPA with its security
# headers.
#
# Usage:
#   scripts/build-images.sh --platform "" --tag smoke   # build for this host
#   scripts/smoke-images.sh [--tag smoke] [--repo freechesscoach]
set -euo pipefail

TAG="smoke"
REPO="freechesscoach"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag) TAG="${2:-}"; shift 2 ;;
    --repo) REPO="${2:-}"; shift 2 ;;
    -h|--help) awk 'NR==1 {next} !/^#/ {exit} {sub(/^# ?/, ""); print}' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

API="$REPO:api-$TAG"
WEB="$REPO:web-$TAG"
ENGINE="$REPO:engine-$TAG"
RUN_ID="fcc-smoke-$$"
NET="$RUN_ID"
FAILED=0

log() { echo "[smoke] $*"; }
pass() { echo "[smoke] PASS $*"; }
fail() { echo "[smoke] FAIL $*" >&2; FAILED=1; }

cleanup() {
  if [[ "$FAILED" -ne 0 ]]; then
    for c in engine api worker web migrate; do
      echo "----- logs: $c" >&2
      docker logs "$RUN_ID-$c" 2>&1 | tail -30 >&2 || true
    done
  fi
  docker rm -f "$RUN_ID-postgres" "$RUN_ID-engine" "$RUN_ID-api" "$RUN_ID-worker" "$RUN_ID-web" "$RUN_ID-migrate" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# The chart's container restrictions, as docker flags.
HARDENED=(--user 1000:1000 --read-only --cap-drop ALL --security-opt no-new-privileges)

# Throwaway values that satisfy the api's boot checks (bootstrap.ts).
APP_ENV=(
  -e DATABASE_URL="postgresql://smoke:smoke@$RUN_ID-postgres:5432/smoke"
  -e ENGINE_URL="http://$RUN_ID-engine:8081"
  -e API_INTERNAL_URL="http://$RUN_ID-api:3000"
  -e ENGINE_TUNNEL_INTERNAL_TOKEN="smoke-internal-token-0123456789abcdef"
  -e LLM_UNLOCK_PEPPER="smoke-pepper"
  -e LLM_UNLOCK_CACHE_KEY="MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="
  -e LLM_FAKE=1
)

# Polls a URL until it answers 2xx, or gives up after ~60s.
wait_for() {
  local url="$1"
  for _ in $(seq 1 60); do
    curl -fsS -o /dev/null "$url" 2>/dev/null && return 0
    sleep 1
  done
  return 1
}
host_port() { docker port "$1" "$2" | head -1 | sed 's/.*://'; }

for image in "$API" "$WEB" "$ENGINE"; do
  docker image inspect "$image" >/dev/null 2>&1 || { echo "[smoke] missing image $image — build it first (see --help)" >&2; exit 1; }
  user="$(docker image inspect "$image" --format '{{.Config.User}}')"
  [[ "$user" == "1000" ]] && pass "$image runs as uid 1000" || fail "$image USER is '$user', want 1000"
  if docker run --rm --entrypoint sh "$image" -c true >/dev/null 2>&1; then
    fail "$image contains a shell"
  else
    pass "$image has no shell"
  fi
done

docker network create "$NET" >/dev/null

log "starting postgres and engine"
docker run -d --name "$RUN_ID-postgres" --network "$NET" \
  -e POSTGRES_USER=smoke -e POSTGRES_PASSWORD=smoke -e POSTGRES_DB=smoke \
  postgres:16-alpine >/dev/null
docker run -d --name "$RUN_ID-engine" --network "$NET" "${HARDENED[@]}" \
  -p 127.0.0.1::8081 "$ENGINE" >/dev/null

for _ in $(seq 1 30); do
  docker exec "$RUN_ID-postgres" pg_isready -U smoke -d smoke >/dev/null 2>&1 && break
  sleep 1
done

log "running migrations"
if docker run --name "$RUN_ID-migrate" --network "$NET" "${HARDENED[@]}" "${APP_ENV[@]}" \
  "$API" node dist-bundle/migrate.mjs >/dev/null 2>&1; then
  pass "migrate job"
else
  fail "migrate job exited non-zero"
fi

log "starting api, worker and web"
docker run -d --name "$RUN_ID-api" --network "$NET" "${HARDENED[@]}" "${APP_ENV[@]}" \
  -p 127.0.0.1::3000 "$API" >/dev/null
docker run -d --name "$RUN_ID-worker" --network "$NET" "${HARDENED[@]}" "${APP_ENV[@]}" \
  "$API" node dist-bundle/worker.mjs >/dev/null
docker run -d --name "$RUN_ID-web" --network "$NET" "${HARDENED[@]}" --tmpfs /tmp \
  -p 127.0.0.1::8080 "$WEB" >/dev/null

ENGINE_URL="http://127.0.0.1:$(host_port "$RUN_ID-engine" 8081)"
API_URL="http://127.0.0.1:$(host_port "$RUN_ID-api" 3000)"
WEB_URL="http://127.0.0.1:$(host_port "$RUN_ID-web" 8080)"

wait_for "$ENGINE_URL/health" && pass "engine /health" || fail "engine /health"
ANALYSIS="$(curl -fsS -X POST "$ENGINE_URL/analyze-position" -H 'content-type: application/json' \
  -d '{"fen":"rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1","depth":10}' 2>&1 || true)"
if [[ "$ANALYSIS" == *'"analysis"'* ]]; then
  pass "engine ran Stockfish (analyze-position)"
else
  fail "engine analyze-position: $ANALYSIS"
fi

wait_for "$API_URL/healthz" && pass "api /healthz" || fail "api /healthz"
wait_for "$API_URL/readyz" && pass "api /readyz (database reachable)" || fail "api /readyz"

sleep 3
WORKER_LOG="$(docker logs "$RUN_ID-worker" 2>&1)"
if [[ "$(docker inspect -f '{{.State.Running}}' "$RUN_ID-worker")" != "true" ]]; then
  fail "worker exited"
elif grep -qiE '"level":(50|60)|EROFS|EACCES' <<<"$WORKER_LOG"; then
  fail "worker logged errors"
else
  pass "worker is running"
fi

if wait_for "$WEB_URL/"; then
  pass "web serves /"
  headers="$(curl -fsSI "$WEB_URL/")"
  grep -qi '^x-content-type-options: nosniff' <<<"$headers" \
    && pass "web sends security headers" || fail "web is missing X-Content-Type-Options"
  grep -qi '^server: nginx/' <<<"$headers" && fail "web leaks the nginx version" || true
else
  fail "web serves /"
fi

if [[ "$FAILED" -ne 0 ]]; then
  echo "[smoke] FAILED" >&2
  exit 1
fi
echo "[smoke] all checks passed"
