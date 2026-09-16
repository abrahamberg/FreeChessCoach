#!/usr/bin/env bash
# Copies a built puzzle pool file onto the SAME cluster PVC the Lichess eval
# index already uses (deploy-lichess-eval-index.sh) — a second file on that
# volume, not a new one (see apps/api/data/README.md, docs/plan.md Task
# 59.1). Only needed once per dataset refresh; ordinary app deploys never
# touch this PVC.
#
# Usage:
#   apps/api/scripts/deploy-puzzle-pool.sh <namespace> [file] [pvc-name]
#
#   namespace   required. The namespace freechesscoach is deployed into.
#   file        path to the built pool.
#               Default: apps/api/data/puzzle-pool.bin
#   pvc-name    name of the PVC to copy onto (must already exist — same one
#               the Lichess eval index uses).
#               Default: freechesscoach-lichess-eval-index
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../../.."

log() { echo "[deploy-puzzle-pool] $*"; }
die() { echo "[deploy-puzzle-pool] ERROR: $*" >&2; exit 1; }

NAMESPACE="${1:-}"
FILE="${2:-apps/api/data/puzzle-pool.bin}"
PVC_NAME="${3:-freechesscoach-lichess-eval-index}"
POD_NAME="puzzle-pool-copy"

[[ -n "$NAMESPACE" ]] || die "Usage: $0 <namespace> [file] [pvc-name]"
command -v kubectl >/dev/null || die "kubectl is required."
[[ -f "$FILE" ]] || die "No file at $FILE — build one first (npm run build-puzzle-pool -- <path-to-lichess_db_puzzle.csv>)."

kubectl get pvc "$PVC_NAME" -n "$NAMESPACE" >/dev/null 2>&1 \
  || die "PVC \"$PVC_NAME\" not found in namespace \"$NAMESPACE\" — enable lichessEvalIndex in the Helm chart values and let ArgoCD sync first (same PVC this script reuses)."

cleanup() {
  log "Cleaning up throwaway pod..."
  kubectl delete pod "$POD_NAME" -n "$NAMESPACE" --wait=false --ignore-not-found >/dev/null 2>&1 || true
}
trap cleanup EXIT

log "Starting throwaway pod \"$POD_NAME\" mounting PVC \"$PVC_NAME\" in namespace \"$NAMESPACE\"..."
kubectl run "$POD_NAME" -n "$NAMESPACE" --restart=Never --image=busybox:1.36 \
  --overrides="{\"spec\":{\"containers\":[{\"name\":\"$POD_NAME\",\"image\":\"busybox:1.36\",\"command\":[\"sleep\",\"3600\"],\"volumeMounts\":[{\"name\":\"data\",\"mountPath\":\"/data\"}]}],\"volumes\":[{\"name\":\"data\",\"persistentVolumeClaim\":{\"claimName\":\"$PVC_NAME\"}}]}}"

log "Waiting for pod to be ready..."
kubectl wait --for=condition=Ready "pod/$POD_NAME" -n "$NAMESPACE" --timeout=120s

log "Copying $FILE onto the PVC..."
kubectl cp "$FILE" "$NAMESPACE/$POD_NAME:/data/puzzle-pool.bin"

log "Done. api/worker will pick it up on their next restart:"
log "  kubectl rollout restart deployment/freechesscoach-api deployment/freechesscoach-worker -n $NAMESPACE"
