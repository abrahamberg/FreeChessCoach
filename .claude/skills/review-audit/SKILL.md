---
name: review-audit
description: The daily loop that makes Game Review's move notes and the course dossier correct — run real games through the app's code, check every sentence against the board and Stockfish, have review-judge agents label a sample, have review-fixer agents fix the biggest cluster of wrong sentences, and log accuracy until held-out accuracy is at least 98%. Use when the owner says "run the review audit", "daily audit", reports a wrong review sentence, or asks how accurate the review text is.
---

# Review audit — the daily loop

Goal: at least **98% of the sentences** Game Review shows (surface `review`) and
the course dossier hands a model (surface `dossier`) are correct, measured
on the **holdout** split with at least 300 judged sentences per surface. It
is a long process, not a one-time fix: every day grows the corpus, labels a
sample, fixes the biggest cluster, and logs the numbers.

The tool is `npm run review:audit -w apps/api -- <command>` (code in
`apps/api/scripts/review-audit/`, how it works at the top of `cli.ts`). Its
workspace is `apps/api/.review-audit/` (git ignores it; `labels.jsonl` is the
valuable part — it holds every judge's verdict). The plan behind it, and
the known gaps, is `docs/plan.md` (Phase 120 onward).

## Before starting

- The dev stack's engine must answer: `curl -s localhost:8081/health`. If not,
  ask the owner to start the stack (`npm run dev`); never run `npm ci`.
- Work on a branch: `git checkout -b claude/review-audit-$(date +%F)` from
  `main` (or continue today's).

## 1. Owner reports first

If the owner reported a wrong sentence (a screenshot, a move), make it a
seed so it is checked forever:

    npm run review:audit -w apps/api -- seed --game <db game id> --note "<move and sentence, and why it is wrong>"
    npm run review:audit -w apps/api -- corpus --per-band 0
    npm run review:audit -w apps/api -- run --only seed:

Find the game id with `docker exec chess-ai-coach-postgres-1 psql -U chess_coach -d chess_coach -Atc "select id, pgn from games"`.
Check `show seed:<id> --where p<ply>`: if no code check fails on the
reported sentence, a check is missing — adding it is today's first fix
(see step 5, "fix the audit").

## 2. Grow the corpus (once a week, or when the corpus is under the plan's target)

    npm run review:audit -w apps/api -- corpus --per-band <n> --stream 300000 --dump 400000

`--per-band` is games per rating band (`<1000` … `2200+`); raise it week by
week (the plan says to what). `--stream` is rows of the Lichess puzzle DB
(games with a tactic, none rated under 1400); `--dump` is PGN lines of the
newest Lichess monthly dump (any game, every band, about 20 lines a game).
With both, puzzle games fill at most half a band. If a band stays short,
raise `--dump`. New games are hashed into dev (80%) or holdout
(20%) by id, so the split never changes for a game.

## 3. Run and report

    npm run review:audit -w apps/api -- run
    npm run review:audit -w apps/api -- report --log

The first run of new games searches with Stockfish (under a minute a game
on the dev engine); later runs answer from the engine cache, and then the
app's own analysis is the cost: about 15 seconds of CPU a game, dealt to
six processes (`--procs`), so the dev split re-runs in about ten minutes.
After a change to a check only (nothing in the app's code),
`recheck` runs the checks again over the stored sentences in seconds. `report` prints the accuracy table, the code-check failures over every
sentence, and the judged errors by tag; `--log` adds today's line to
`history.md`.

## 4. Judge a sample

    npm run review:audit -w apps/api -- batch --split dev --positions 12 --count 4
    npm run review:audit -w apps/api -- batch --split holdout --positions 12 --count 2

Spawn one `review-judge` agent per printed batch file, all in parallel, with
the prompt: `Judge the batch <path>.` When all have answered:

    npm run review:audit -w apps/api -- ingest

and read what it prints (ids that matched nothing mean a judge mistyped).
Then `report` again. Keep judging on later days until each split/surface has
at least 300 judged sentences; after that, judge only what changed (a fix
changes a sentence's text, which needs a new label) plus new games.

**Calibration (the owner, weekly):** pick 10 random labels from
`labels.jsonl` and show them to the owner with `show <game> --where <p..>`.
If the owner disagrees with more than one, fix `judge-instructions.md`
before trusting the numbers again.

## 5. Fix the biggest cluster

Pick from the report, in this order:
1. a source with code-check failures (the check already proves them wrong);
2. the largest judged-error tag (`absent-piece`, `not-winnable`, …);
3. `audit-bug:` notes from judges: the audit's own checks are wrong — fix
   `apps/api/scripts/review-audit/` first, since a wrong check hides or
   invents errors everywhere.

Spawn one `review-fixer` agent per cluster, **one at a time** (they edit the
same files), with the source, the failing check or tag, and 3 example ids
from `failures --source <source>`. Its checks (verify, corpus, golden) are
in its instructions. After each fix: `run --split dev`, `report`, and confirm
the cluster's count fell and nothing else rose. Two or three clusters a day
is plenty.

Fixing the audit itself (a missing check, a check that misfires): add an
invariant test in `apps/api/scripts/review-audit/oracle.test.ts` for the
position that exposed it, then the check.

## 6. End of day

- `report --log` so the day's numbers are in `history.md`.
- Commit (one per fix, conventional messages), push the branch, open a PR
  whose body lists each cluster fixed with before/after counts and the
  history line.
- Tell the owner: today's accuracy per split/surface, the clusters fixed,
  what is next, and anything that needs their decision.

## Done means

Holdout review and dossier each at ≥ 98% with ≥ 300 judged sentences, no
dev code-check failures left in a source the plan marks as fixed, and the
owner's last calibration agreed. Then drop to weekly: fresh games only, to
catch regressions.

## Never

- Never read holdout failures while fixing (`failures` shows dev unless
  asked); the holdout is what proves a fix generalises.
- Never make a sentence pass by editing the check to fit it, unless a judge
  and the probe both show the check was wrong.
- Never re-record the golden snapshot without explaining each changed line.
