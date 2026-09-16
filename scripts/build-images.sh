#!/usr/bin/env bash
# Build the three deployment images (api, web, engine) — Task 9.1.
#
# All application images are built OUTSIDE Docker: their Dockerfiles only COPY
# finished artifacts (api/web/engine bundles and static files). The preparation
# steps below are order-sensitive
# — step 3 deletes the dev dependencies steps 1–2 need — which is exactly why
# they live in a script instead of a doc that can be transcribed wrongly.
# Background and rationale: docs/deploy-build.md.
#
# Usage:
#   scripts/build-images.sh [options]
#
#   --registry <host/org>   registry prefix for the image tags (e.g. ghcr.io/acme).
#                           Must be set when pushing. Default: none (local tags).
#   --tag <tag>             image tag. Repeatable: every value becomes another tag
#                           on the same build, so all of them share one digest.
#                           Default: the short git SHA, else "dev".
#   --platform <p>          target platform. Default: linux/arm64 (the cluster's
#                           node architecture). Pass "" to build for the host.
#   --push                  push to the registry instead of loading locally.
#                           Without it the images are --load'ed into the local
#                           daemon; buildx writes NOTHING with neither flag.
#   --skip-artifacts        reuse an existing dist-bundle/dist/node_modules
#                           (skips steps 1–3 — you own the ordering then).
#   --artifacts-only        run steps 1–3 and stop before building images.
#   --restore-dev-deps      re-run a full `npm ci` at the end, undoing step 3.
#                           Off by default: pointless on a throwaway CI runner,
#                           usually what you want on a workstation.
#   --summary-file <path>   append a Markdown list of every image reference this
#                           run created. CI points it at $GITHUB_STEP_SUMMARY so
#                           the published tags show on the workflow run page.
#
# Examples:
#   scripts/build-images.sh --registry ghcr.io/acme --tag latest --tag v1.2.3 --push
#   scripts/build-images.sh --platform "" --restore-dev-deps      # local smoke build
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

REGISTRY=""
TAGS=()
PLATFORM="linux/arm64"
PUSH=0
SKIP_ARTIFACTS=0
ARTIFACTS_ONLY=0
RESTORE_DEV_DEPS=0
SUMMARY_FILE=""
# Every image reference this run creates, in build order. Filled in by step 4
# and reported at the end — the caller's answer to "what did this publish?".
BUILT_REFS=()

log() { echo "[build-images] $*"; }
die() { echo "[build-images] ERROR: $*" >&2; exit 1; }
# The tag list rendered as "a,b", for the log lines.
joined_tags() { local IFS=,; echo "${TAGS[*]}"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --registry) REGISTRY="${2:-}"; shift 2 ;;
    --tag) TAGS+=("${2:-}"); shift 2 ;;
    --platform) PLATFORM="${2:-}"; shift 2 ;;
    --push) PUSH=1; shift ;;
    --skip-artifacts) SKIP_ARTIFACTS=1; shift ;;
    --artifacts-only) ARTIFACTS_ONLY=1; shift ;;
    --restore-dev-deps) RESTORE_DEV_DEPS=1; shift ;;
    --summary-file) SUMMARY_FILE="${2:-}"; shift 2 ;;
    -h|--help) awk 'NR==1 {next} !/^#/ {exit} {sub(/^# ?/, ""); print}' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) die "unknown option: $1 (try --help)" ;;
  esac
done

if [[ "${#TAGS[@]}" -eq 0 ]]; then
  TAGS=("$(git rev-parse --short HEAD 2>/dev/null || echo dev)")
fi
[[ "$PUSH" -eq 1 && -z "$REGISTRY" ]] && die "--push needs --registry (nothing to push to)"

PREFIX=""
[[ -n "$REGISTRY" ]] && PREFIX="${REGISTRY%/}/"

# ---------------------------------------------------------------------------
# Steps 1–3: produce the artifacts the api/web Dockerfiles copy. Order matters.
# ---------------------------------------------------------------------------
if [[ "$SKIP_ARTIFACTS" -eq 0 ]]; then
  log "1/4 npm ci (full install — the builds below need the dev dependencies)"
  npm ci

  log "2/4 building artifacts: apps/api/dist-bundle + apps/web/dist + services/engine/dist-bundle"
  npm run bundle --workspace=@freechesscoach/api
  npm run build --workspace=@freechesscoach/web
  node services/engine/scripts/bundle.mjs

  log "3/4 pruning node_modules to apps/api's production dependencies"
  # This must happen after all runner-side builds: esbuild is needed to bundle
  # the engine, but its platform-specific binary must not enter the API image.
  npm ci --omit=dev --workspace=@freechesscoach/api --include-workspace-root
else
  log "1-3/4 skipped (--skip-artifacts)"
fi

[[ -f apps/api/dist-bundle/server.mjs ]] || die "apps/api/dist-bundle/server.mjs missing — run without --skip-artifacts"
[[ -f apps/web/dist/index.html ]] || die "apps/web/dist/index.html missing — run without --skip-artifacts"
[[ -f services/engine/dist-bundle/server.mjs ]] || die "services/engine/dist-bundle/server.mjs missing — run without --skip-artifacts"

restore_dev_deps() {
  if [[ "$RESTORE_DEV_DEPS" -eq 1 ]]; then
    log "restoring dev dependencies (npm ci)"
    npm ci
  else
    log "NOTE: node_modules is pruned to production deps. Run 'npm ci' before developing or testing."
  fi
}

if [[ "$ARTIFACTS_ONLY" -eq 1 ]]; then
  log "artifacts built (--artifacts-only); skipping image builds"
  restore_dev_deps
  exit 0
fi

# ---------------------------------------------------------------------------
# Step 4: the images. buildx is required — see docs/deploy-build.md for the
# builder/QEMU prerequisites when PLATFORM differs from the host architecture.
# ---------------------------------------------------------------------------
docker buildx version >/dev/null 2>&1 || die "docker buildx is not available (see docs/deploy-build.md)"

BUILD_ARGS=()
[[ -n "$PLATFORM" ]] && BUILD_ARGS+=(--platform "$PLATFORM")
# buildx discards the result unless an output is requested: --push or --load.
if [[ "$PUSH" -eq 1 ]]; then
  BUILD_ARGS+=(--push)
  OUTPUT_VERB="pushed"
else
  BUILD_ARGS+=(--load)
  OUTPUT_VERB="loaded into the local docker daemon"
fi

# The published-tag report, as Markdown. Without --summary-file the only record
# of what a run created is a line somewhere in a twenty-minute build log; CI
# points this at $GITHUB_STEP_SUMMARY so the tags land on the run page itself.
write_summary() {
  [[ -n "$SUMMARY_FILE" ]] || return 0
  {
    echo "### Images ${OUTPUT_VERB}${REGISTRY:+ to \`${REGISTRY%/}\`}"
    echo
    [[ -n "$PLATFORM" ]] && printf 'Platforms: `%s`\n\n' "$PLATFORM"
    echo '```'
    printf '%s\n' "${BUILT_REFS[@]}"
    echo '```'
  } >> "$SUMMARY_FILE" || log "NOTE: could not append the image summary to $SUMMARY_FILE"
}

for COMPONENT in api web engine; do
  # Every tag is passed to the same build, so they all name one digest — the
  # only way "latest" and the version tag cannot drift apart.
  TAG_ARGS=()
  for TAG in "${TAGS[@]}"; do
    BUILT_REFS+=("${PREFIX}freechesscoach:${COMPONENT}-${TAG}")
    TAG_ARGS+=(-t "${PREFIX}freechesscoach:${COMPONENT}-${TAG}")
  done
  log "4/4 building ${PREFIX}freechesscoach:${COMPONENT}-{$(joined_tags)}${PLATFORM:+ ($PLATFORM)}"
  docker buildx build "${BUILD_ARGS[@]}" \
    -f "docker/Dockerfile.${COMPONENT}" \
    "${TAG_ARGS[@]}" \
    .
done

# Spelled out rather than brace-abbreviated: this is the line a human reads to
# learn which tags now exist, and it is what they paste into docker/helm next.
log "done — ${OUTPUT_VERB}:"
for REF in "${BUILT_REFS[@]}"; do log "  $REF"; done
write_summary
restore_dev_deps
