#!/usr/bin/env bash
# Downloads the latest official Lichess evaluation database and builds the
# app's binary-search index from it in one step. See apps/api/data/README.md
# for what this index is and why it's built this way.
#
# Usage:
#   apps/api/scripts/fetch-and-build-lichess-eval-index.sh [options]
#
#   --output <path>   where to write the built index.
#                      Default: apps/api/data/lichess-eval-index.bin
#   --keep-download    don't delete the downloaded .jsonl.zst afterward.
#                      Default: deleted once the build succeeds — it's only
#                      useful for re-running the build, and it's tens of GB.
#
# Run this by hand, roughly monthly (matching Lichess's own refresh cadence)
# — never wired into CI or app deploys (apps/api/data/README.md). Once it's
# built, get it onto the cluster with:
#   apps/api/scripts/deploy-lichess-eval-index.sh <namespace>
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../../.."

DOWNLOAD_URL="https://database.lichess.org/lichess_db_eval.jsonl.zst"
DOWNLOAD_PATH="apps/api/data/lichess_db_eval.jsonl.zst"
OUTPUT_PATH="apps/api/data/lichess-eval-index.bin"
KEEP_DOWNLOAD=0
REPO_ROOT="$(pwd)"

log() { echo "[fetch-and-build-lichess-eval-index] $*"; }
die() { echo "[fetch-and-build-lichess-eval-index] ERROR: $*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output)
      OUTPUT_PATH="$2"
      shift 2
      ;;
    --keep-download)
      KEEP_DOWNLOAD=1
      shift
      ;;
    *)
      die "Unknown option: $1"
      ;;
  esac
done

log "Checking dependencies..."
command -v curl >/dev/null || die "curl is required to download the dataset."
command -v zstd >/dev/null || die "zstd is required to decompress the dataset during the build (apt install zstd / brew install zstd)."
command -v npm >/dev/null || die "npm is required to run the build (Node.js not found)."

mkdir -p "$(dirname "$DOWNLOAD_PATH")"

log "Downloading latest dataset from $DOWNLOAD_URL — this is tens of GB, resumable if interrupted..."
# --retry-all-errors: retry even on a connection reset mid-transfer (curl's
# plain --retry only covers a fresh connection attempt failing, not a drop
# after data has started flowing) — combined with -C - to resume from where
# the dropped connection left off instead of restarting the whole download.
curl -fL --continue-at - --retry 50 --retry-delay 5 --retry-all-errors -o "$DOWNLOAD_PATH" "$DOWNLOAD_URL"

log "Building index..."
# Absolute paths: `npm run build-eval` runs via `-w @freechesscoach/api`, which
# makes npm invoke the script with apps/api (not this repo root) as cwd — a
# relative path here would resolve against the wrong directory and silently
# match nothing.
npm run build-eval -- "$REPO_ROOT/$DOWNLOAD_PATH" "$REPO_ROOT/$OUTPUT_PATH"

if [[ "$KEEP_DOWNLOAD" -eq 0 ]]; then
  log "Removing downloaded dataset ($DOWNLOAD_PATH) — pass --keep-download to keep it."
  rm -f "$DOWNLOAD_PATH"
fi

log "Done: $OUTPUT_PATH"
log "Next: apps/api/scripts/deploy-lichess-eval-index.sh <namespace>"
