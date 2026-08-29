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
interrupted, and the raw `.jsonl.zst` is deleted after a successful build
unless you pass `-- --keep-download`.) Writes to
`apps/api/data/lichess-eval-index.bin`; pass `-- --output <path>` to write
somewhere else.

Already have a dataset file downloaded (or the Parquet mirror at
https://huggingface.co/datasets/Lichess/chess-position-evaluations, converted
to JSONL first)? Skip straight to the build step:

```sh
npm run build-eval -- /path/to/lichess_db_eval.jsonl.zst
```

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
