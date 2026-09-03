# Lichess evaluation index

This directory is where `scripts/build-lichess-eval-index.mjs` writes its
output (`lichess-eval-index.bin`) by default. Nothing here is committed to
git (see `.gitignore`) — the file is a multi-GB, read-only data asset,
rebuilt and refreshed by hand, not source code.

## What it is

A pre-built, sorted, fixed-width binary index over the public Lichess
evaluation dataset (~394M positions the chess community has already
analyzed), so the API can look up a position's evaluation with a plain
binary search instead of always paying for a live engine call. See
`src/services/engine/lichess-eval-index.ts` for the reader and
`docs/architecture.md` for the design rationale (why this is a flat file and
not a second database).

## Format version

**v3** (current, Phase 49): widens each of the up-to-`ENGINE_MULTI_PV` (5)
lines per position from a single move to a real multi-ply continuation —
`scanDepthForRank(rank)` UCI moves per line, tapering from 7 plies at rank 0
down to 1 at the bottom ranks (`packages/chess-analysis/src/prevention-
scan-schedule.ts`), so `scanAvailableMotifs`' graduated tactic scan can walk
a genuine deep PV for a position served from this index, not just ply 1. See
`packages/chess-analysis/src/lichess-eval-index-format.ts` for the record
layout. Records are 123 bytes (was 63 in v2, which kept only each line's
first move), so a full rebuild is roughly 1.95x v2's size — expect ~49GB
where v2 was ~25GB. v3 files start with the same style of 8-byte magic
header (`LICHESS_EVAL_MAGIC`, now `LCEVAL03`) v2 introduced, bumped so the
reader can tell the two apart.

**Rollout order matters**: `LichessEvalIndex.open` treats a stale v1/v2 file
(not starting with the current magic header) the same as a missing file —
it logs a warning and `openLichessEvalIndexFromEnv` returns `null`, skipping
the tier rather than crash-looping. That means it's safe to deploy this
code *before* rebuilding and redeploying the index onto the PVC (the tier
is just unavailable in the meantime); deploying an old v1/v2-reading
version of this code against a v3 file is untested and not a supported
direction. When in doubt: ship code first, rebuild+redeploy the `.bin` file
second, and resize the PVC (`lichessEvalIndex.size` in
`deploy/helm/freechesscoach/values.yaml`, now `64Gi`) before that rebuild
lands.

## Building it

One command checks dependencies, downloads the latest official dataset
(`https://database.lichess.org/lichess_db_eval.jsonl.zst` — a single stable
filename Lichess updates in place, not a dated release), and builds the
index:

```sh
npm run fetch-and-build-eval
```

(`apps/api/scripts/fetch-and-build-lichess-eval-index.sh` — requires `curl`,
`zstd`, and `npm`/Node on your machine; the download is resumable if
interrupted, and the raw `.jsonl.zst` is retained for subsequent rebuilds.) Writes to
`apps/api/data/lichess-eval-index.bin`; pass `-- --output <path>` to write
somewhere else.

Already have a dataset file downloaded (or the Parquet mirror at
https://huggingface.co/datasets/Lichess/chess-position-evaluations, converted
to JSONL first)? Skip straight to the build step. If the standard source file
is already present in `apps/api/data/`, the path can be omitted:

```sh
npm run build-eval
# or, for a file elsewhere:
npm run build-eval -- /path/to/lichess_db_eval.jsonl.zst
```

The build uses all but one available CPU core by default for bucket sorting.
Set `LICHESS_EVAL_BUILD_WORKERS` to tune the worker count when sharing
the machine with other work.

Run this by hand, roughly matching the upstream dataset's own monthly
refresh cadence — there is deliberately no automation for it: no GitHub
Actions workflow, nothing wired into `npm run build:images` or the Helm
migrate-job, and the output is never committed to git or uploaded anywhere
as part of shipping a normal app change. A dataset refresh and an app
deploy are two completely independent events.

Version pin: not yet built from a real snapshot. When you do the first real
build, record the source dataset's stated last-updated date here.

## Getting it onto the cluster

There's no object storage in this deployment (see `docs/architecture.md`),
so the built file goes straight onto the `PersistentVolumeClaim` the Helm
chart provisions when `lichessEvalIndex.enabled: true`
(`deploy/helm/freechesscoach/values.yaml`) — once, via `kubectl cp`, not on
every deploy.

First enable the feature in `../kube/gitops/freechesscoach/values.yaml`
(`lichessEvalIndex.enabled: true`) and let ArgoCD sync, so the PVC exists —
api/worker will log a warning and simply skip this tier until the file shows
up (`openLichessEvalIndexFromEnv` in `apps/api/src/bootstrap.ts`), so it's
safe to apply before the file is copied in. Then:

```sh
npm run deploy-eval -- freechesscoach
```

(`apps/api/scripts/deploy-lichess-eval-index.sh <namespace> [file] [pvc-name]`
— requires `kubectl` pointed at the right cluster context. Defaults: file
`apps/api/data/lichess-eval-index.bin`, PVC `freechesscoach-lichess-eval-index`.)
It spins up a throwaway pod that mounts the PVC, `kubectl cp`s the file onto
it, and tears the pod down again.

`api`/`worker` pick the file up on their next restart (they're likely
already restart-looping on the warning above with backoff, so this can
happen on its own — otherwise
`kubectl rollout restart deployment/freechesscoach-api deployment/freechesscoach-worker -n freechesscoach`).

A later refresh is just `npm run deploy-eval -- freechesscoach` again — the
PVC and `enabled: true` stay as they are, and ordinary app deploys (new
`api`/`worker` image tags via ArgoCD) never touch this volume at all.

## Exercising it locally

`docker-compose.yml`'s `api`/`worker` already bind-mount the whole repo
(`.:/app`), which plays the same role locally as the PVC does in prod: a
persistent path that's populated out-of-band, never fetched on container
start. Build a small fixture index (a sample, not the full dataset — see
above) into `apps/api/data/`, then set in a `.env` file:

```
LICHESS_EVAL_INDEX_PATH=/app/apps/api/data/lichess-eval-index.bin
```

and restart `api`/`worker`. Unset (the default), the feature is skipped and
behavior is unchanged.

# Puzzle pool

`scripts/build-puzzle-pool.mjs` writes its output (`puzzle-pool.bin`) here
by default. Not committed to git (see `.gitignore`), same as the eval index
above, though for a different reason: this one is small (megabytes, not
GB), but it's a downstream data snapshot of an external dataset, not source
code, and refreshing it shouldn't need a code change.

## What it is

A rating-spread sample of real Lichess puzzles (see
[`database.lichess.org/#puzzles`](https://database.lichess.org/#puzzles))
across the themes `packages/chess-analysis/src/puzzle-selection.ts`'s
`DIAGNOSIS_CODE_PUZZLE_THEMES` maps our diagnosis codes to — this is the
pool `selectPuzzles()` picks a student's homework puzzles from (`docs/
plan.md` Task 59.1). See `packages/chess-analysis/src/puzzle-pool-
format.ts` for the record layout and `src/services/puzzle-pool.ts` for the
reader.

Unlike the eval index above, this is a **whole-file, in-memory** format,
not disk-backed binary search: at a few tens of thousands of puzzles
(megabytes, not tens of GB), there's no memory pressure to page it in a
piece at a time, so the reader just decodes the whole file once at process
start and holds a plain array. It still lives on the *same* PVC the eval
index uses (see "Getting it onto the cluster" below) — a second small file
alongside a much bigger one, not a second volume.

## Building it

```sh
curl -o /tmp/lichess_db_puzzle.csv.zst https://database.lichess.org/lichess_db_puzzle.csv.zst
unzstd /tmp/lichess_db_puzzle.csv.zst
npm run build-puzzle-pool -- /tmp/lichess_db_puzzle.csv
```

(`apps/api/scripts/build-puzzle-pool.mjs` — requires `curl`, `zstd`, and
`npm`/Node; the full source CSV is ~290MB compressed / ~1.1GB decompressed,
not committed, download it fresh.) Writes to `apps/api/data/puzzle-
pool.bin`.

Run this by hand, no fixed cadence — there's a second, much smaller sample
of the same source dataset (`packages/chess-analysis/data/lichess-puzzle-
motifs.csv`), committed to git, that exists only to validate
`classifyTacticMotif` and is unrelated to this one; don't confuse the two.

Version pin: not yet built from a real snapshot. When you do the first real
build, record the source dataset's stated last-updated date here.

## Getting it onto the cluster

Same PVC the eval index uses (`lichessEvalIndex.enabled: true` in the Helm
chart — no separate volume to provision for this), a second file copied on
alongside `lichess-eval-index.bin`:

```sh
npm run deploy-puzzle-pool -- freechesscoach
```

(`apps/api/scripts/deploy-puzzle-pool.sh <namespace> [file] [pvc-name]` —
same throwaway-pod `kubectl cp` approach as `deploy-lichess-eval-index.sh`.)
`api`/`worker` pick it up on their next restart, same as the eval index.

## Exercising it locally

Same bind-mount story as the eval index: build a `puzzle-pool.bin` (a
smaller CSV sample is fine for local testing) into `apps/api/data/`, then
set in a `.env` file:

```
PUZZLE_POOL_PATH=/app/apps/api/data/puzzle-pool.bin
```

and restart `api`/`worker`. Unset (the default), puzzle assignment is
skipped and behavior is unchanged.
