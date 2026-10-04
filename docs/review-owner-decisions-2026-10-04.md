<!-- Written 2026-10-04 by an Opus proxy reviewer the owner delegated these decisions to; each factual claim was spot-checked in code before use. Status of each item is in docs/review-open-ideas.md. -->
# Owner decisions for Game Review (proxy reviewer, 2026-10-04)

No repository file was edited. Every number below was measured read-only on the
data already in the repo (`apps/api/.review-audit/run/*.jsonl`, the 2026-10-02
run: 220 dev games, 163 of them Lichess), or with Stockfish 15.1 started on its
own inside the dev engine container (one thread, Hash 16, the app's binary).
The scripts and their raw output are in this scratchpad folder (`sf.mjs`,
`game-timing.mjs`, `deep-gap.mjs`, `named-gap.mjs`, `good-gaps.mjs`,
`clutter2.mjs`, `kick.mjs`, `only.mjs`, `mates.mjs`, `*.jsonl`).

## Before anything else: three facts that change how to read earlier numbers

1. **The probe's "depth 22" is not depth 22.** `probe.ts` goes through the
   engine server, which stops every search after `ENGINE_MOVE_TIMEOUT_MS`
   (5 s by default, `services/engine/src/uci.ts:12`). `analyze.ts` then
   reports the depth that was asked for, not the depth it reached. Test: a
   probe at `--depth 22` of d690's ply-59 position came back in 6.3 s of wall
   time showing +15.40 / +17.06 / +18.49. A real depth-22 search of the same
   position took 15.2 s and showed +16.28 / +19.93 / +26.44. The "depth 22"
   numbers in `docs/review-open-ideas.md` (and the agents' "4 of 30 best moves
   were not best") come from searches of about depth 19–20. They still point
   the same way, but they are weaker evidence than they say. Fix the
   instrument first: the probe should print the depth it reached and take a
   longer timeout. That is an audit-only change, and the app is not affected.
2. **Prod's native engine is probably not searching at depth 12.**
   `NativeEngineBackend.analyzeGame` sends no depth, so the engine server
   uses its `ENGINE_DEFAULT_DEPTH` env. The chart sets that to
   `engine.defaultDepth: 18`, with `moveTimeoutMs: 3000`
   (`deploy/helm/freechesscoach/values.yaml:111-114`). At depth 18 with 5
   lines, 9 of 40, 10 of 57 and 37 of 60 positions took longer than 3 s, so
   prod cuts them off early and still stores them as "depth 18". Chess-api
   and browser modes send 12 (`ENGINE_DEFAULT_DEPTH`). Check
   `gitops/freechesscoach/values.yaml` in the private kube repo, or run
   `select e->>'depth', count(*)` over prod `engine_evals`. If prod really
   is at 18, set the chart to 12 to match the owner's 2026-09-22 change
   (`ac0b2e5`, "reduced the engine depth for speed").
3. **Depth-12 gaps under about 60 cp are mostly search noise.** Searching
   the same move again at depth 12, with a fresh hash and one line, puts it
   in the same label tier only 35 times in 60. Going from a fresh depth 12
   to depth 18 keeps the tier 40 times in 60. Most label changes come from
   searching again at all, not from searching deeper.

## 1. Depth: a narrow deep check that can only remove a sentence

**Decision.** Leave the analysis depth and every label as they are. Add one
optional pass that uses only the native engine. It re-checks the plies where
the review is about to print a sentence that names a better move. If the
deeper search does not confirm that move, the sentence is dropped. The deeper
numbers never create a sentence, never pick a different move to name, and
never change a label, badge, accuracy score or mate count.

- **Which plies.** The pass covers a not-best move with a sentence that
  names or explains another move: `better-was`, `better-move`,
  `principle-reasons` "X was better: it …", the why-rules (cut-off, piles
  on, checks, centre, frees) and `missed-capture`. Three more conditions:
  - Neither position is decided: |eval| < 500 cp before and after, and no
    mate score in either.
  - The depth-12 gap is between 30 and 200 cp.
  - The ply is the reader's move.

  That comes to about 9 plies per Lichess dev game (11.5 if every not-best
  move with a gap of 20–150 cp counts). Best moves are not re-checked: their
  notes describe what the move does, which is true at any depth.
- **The search.** Depth 18 with one line, run on the position after the
  named move and the position after the played move (each to depth 17). The
  sentence stays if the named move is still at least 30 cp better for the
  mover. Otherwise only that sentence goes, and the label stays.
- **Budget.** At most 12 plies and 20 s of engine time per game, at
  background priority. Plies past the cap keep today's behaviour.
- **Where the results live.** Store them with the analysis (for example
  `analyses.deep_checks`), so that stored text replays exactly and the audit
  can read them.
- **Mate against mate.** No re-search. The decided-game rule already treats
  it as no fault.

**Evidence.**

| measured (true reference = depth 22, fresh hash, no timeout) | depth 12 alone | with the depth-18 check |
|---|---|---|
| Not-best moves (mostly inaccuracies and mistakes, n=49): named move really ≥30 cp better | 42 / 49 (86%) | keeps 41, of which 39 are right (95%); drops 3 right ones |
| …by stored gap: 60–99 / 100–199 / ≥200 cp | 11/13, 18/21, 12/12 | |
| "Good" moves with a gap of 30–59 cp (n=53): same best move, ≥30 cp better | 21 / 53 (40%) | keeps 23, of which 16 are right (70%) |
| Depth-18 best move is the stored best move (random sample, n=60) | 44 / 60 | |

Cost per position (single thread, 5 lines; 3 beginner games, 40/57/60
positions):

| depth | mean per position | whole game | × depth 12 |
|---|---|---|---|
| 12 | 0.17–0.22 s | 6.7–13.3 s | 1 |
| 16 | 1.1–1.8 s | 46–108 s | ~7 |
| 18 | 2.4–4.2 s | 100–254 s | ~15–19 |
| 20 | 4.6–5.2 s | 210–263 s | ~27–31 |

(The third game's depth-18 run shared the CPU with another search, so its
numbers may be high.)

The check itself costs about 1.1–1.6 s per ply, because it searches 2–3
positions at depth 17–18 with one line each. For about 9–12 plies that is
11–16 s of engine time per game, roughly doubling today's engine time. Moving
the whole game to depth 18 would cost 15–19 times as much. External engines
cannot do this pass: chess-api caps the depth, and the browser's WASM build
takes 10–16 s per position at depth 16. So it runs on the server engine only.

**Why not raise the whole depth.** It costs 15–30 times more, external
engines cannot follow, and it would change every stored label. It would not
fix the main source of label disagreement either, which is searching again
at all (fact 3). The stated reason for the owner's standing "no deeper than
12" decision is cost and external engines. This pass respects both. It is
still a narrow exception to that decision, so it is flagged here.

**Risk.**
- Up to about 10% more engine time per game at prod peak, on a pool of 2
  engines per pod.
- About 1 right sentence in 13 is dropped, a little less text. Note that
  silence is also what the owner prefers to a wrong "X was better".
- Results depend on Stockfish being nondeterministic, which is why they are
  stored.

**Rollout, reversible.**
1. Add `CONFIG.review.deepCheck = { enabled: false, depth: 18, keepGapCp: 30,
   maxPlies: 12, budgetMs: 20000 }`. With it off, the app behaves exactly as
   today.
2. Turn it on in dev, run `run` over the dev games, and judge 30 sentences
   from the affected sources with it on and off.
3. Turn it on in prod. To roll back, set `enabled: false`; stored checks are
   simply ignored.

## 2. Mate counts: no change, and the count-free wording is already right

**Decision.** Keep the wording the app already uses when it cannot stand
behind a count: "You let them force mate with Rh6." / "They let you force
mate with Rh6." and "Missed a forced mate starting with Qd8+". These name the
first move, which is what a 500–1200 player can look at and replay. A number
they cannot check adds nothing, and the owner caps counts at 7 anyway. Do not
add a deeper search to find mates. Do not add words like "a long mate".

**Evidence.**
- Allowed mates on dev, at the depth stored, where the move created a mate
  that was not there before:
  - mate in 1–3: 72 of 76 positions mention the mate;
  - mate in 4–7: 38 of 43;
  - mate in 8+: 26 of 30.
- 13 of the 149 get no mate sentence. 11 of those were already lost, at
  −644 to −2604, and are mostly "excellent" moves in endings that were
  being mated anyway.
- The d690 case (30…c4) is not a wording problem. At depth 12 there is no
  mate at all: +14.21 after the move, then +21.83 at depth 20, mate in 7 at
  depth 22 and mate in 6 at depth 24. Black was already lost before c4
  (−10.17 at depth 12, −16 to −35 deeper; two rooks down). No rule at depth
  12 can say "mate" there, and in a position this decided a note would be
  the clutter the owner marks down. Silence is the right answer for it.

**Side finding to check.** Two golden trap plies in the 10-02 run allow a
quick mate and carry no sentence at all: `golden:t…` 5…Bxd1 (mate in 2) and
3…Nf6 (mate in 1, labelled blunder). Rerun `show` on them. If a sentence is
really missing, it is a bug.

**Risk.** None, since nothing changes.

## 3. Clutter on blunders: drop minor notes next to a decisive one

**Decision.**

*When it applies.* A move is decisive when it is labelled mistake, blunder
or miss **and** it carries a decisive note. A decisive note is one of:
- the move allows a forced mate (any "let them force mate / deliver
  checkmate" card);
- an allowed tactic card whose prize, after Task 127.1, is a knight, bishop,
  rook or queen;
- a loose-piece note on a rook or queen.

*What is kept:*
- the decisive note;
- a "stopped guarding X" note where X is the decisive square (it is the
  cause);
- a "Y keeps the [decisive piece] safe" note on the decisive piece or square
  (it is the fix);
- the "Won a pawn, but it cost the rook" summary.

*What is dropped:*
- loose, winnable and "keeps … safe" notes about any other target (the pawn
  on h7 next to a lost queen);
- positional notes: mobility, centre, passed pawn, open file, kick, pin,
  development;
- a loose note that repeats the decisive piece ("Leaves the rook on f8 where
  it can be won" next to "You let them win a rook … captures the rook on
  f8").

**Evidence (dev, 1,430 mistake/blunder/miss moves, 331 with a decisive note).**

| next to the decisive note | count | action |
|---|---|---|
| pawn notes about another square | 32 | drop |
| positional notes | 8 | drop |
| loose notes on the same piece (repeats) | 49 | drop |
| "keeps the [same piece] safe" | 20 | keep |
| "stopped guarding [the decisive square]" | 11 | keep |
| pawn note on the decisive square (e.g. the pawn the mating rook takes) | 10 | drop (the mate note says it) |

That drops about 99 sentences in 73 of 220 games (one game in three). The
owner's calibration already marked down both kinds being dropped: "redundant"
notes and "a small positional note when the main thing is elsewhere".

**Risk.** A pawn note on another square could be the real second point,
for example a fork that also takes a pawn. The rule only drops notes next to
a piece-or-mate note, so the larger loss always stays.

**Rollout.**
1. Add one filter at the end of `move-reasons.ts`, beside
   `cardReplaceableNote`, behind a config flag.
2. Check it against the golden courses first.
3. Do a dev re-run and confirm that no move ends up with zero sentences.
4. Judge 30 of the affected moves, showing every sentence of each move.

## 4. "Good" moves: no "X was better" comparison, at any threshold

**Decision.** Turn off `goodMoveComparison`
(`principle-reasons.ts`, `GOOD_MOVE_MIN_GAP_CP = 30`, built in `6e0f3db`
before the owner had answered). Do not move it to 40 cp, and do not run it
behind the depth-18 check. A move labelled "good" keeps the notes about what
the move itself did.

**Evidence.**
- 188 good moves on dev have a depth-12 gap of 30 cp or more (0.85 a game).
  81 of them are in positions already at |eval| ≥ 300, where centipawn gaps
  say little.
- Of the 53 undecided ones re-searched at true depth 22, the same better
  move is still ≥30 cp better in 21 (40%). Counting any better move, it is
  29 (55%).
- By stored gap: 7 of 25 at 30–39 cp, and 14 of 28 at 40–59 cp.
- Of 15 control moves at 15–29 cp, none reaches 30 at depth 22.
- With the depth-18 check the comparison is still right only 16 times in 23
  (70%).

The target is 98%. A badge that says "good" next to a sentence saying
another move was better also reads as a contradiction to a beginner.

**Two code points to fix if it is ever turned back on.**
- The gate uses `Math.abs(bestCp - playedCp)`, so a played move that scores
  *better* also passes.
- It has no decided-position guard.

**Rollout.** Remove the `goodMoveComparison` call, or put it behind a flag
set to off. Its tests change with it. The `review-open-ideas.md` rows
"Rfe1 was better on a good move" and "Open file taken first" move to
Dropped, with these numbers as the reason.

**When to revisit.** Only once the deep check exists, and a dev sample of at
least 50 good moves shows 90% or more at some threshold.

## 5. The rest of "Waiting on the owner"

**Kick notes: keep them all, not only the 23–29 that name a pin.**
- They appear 1.2 times a game, at most 6 in one game, in 128 of 220 dev
  games.
- They are said only on moves that cost nothing: 137 best, 41 excellent,
  77 good, 2 great.
- In 206 of 257 (80%), the engine's best reply moves the attacked piece. The
  pawn really gained a tempo, which is one of the first ideas a beginner
  needs.
- Judges have checked 6 kick notes and found all 6 correct.
- Keeping only the pin kicks would cut 91% of them. Among the 20% where the
  piece does not move are golden trap lessons, such as the Fishing Pole's
  5.h3, where the knight staying is the point. So a "the reply moves the
  piece" filter would also break golden courses.
- If the 30 judged labels in Task 126.3 come back "irrelevant", the next
  step is a cap of 3 a game, not pins only.

**"The only move that holds": say it once per run of 3 or more identical
notes by the same player.** Keep the first note. Every move keeps its
"great" badge.
- On dev, 142 notes on moves the reader played fall into 106 single notes,
  10 pairs and 3 runs of 3 or more:
  - 7 in a row in `tod9P6y4`, a 2200+ drawn ending;
  - 6 in the golden opposition drill;
  - 3 in a golden puzzle.
- On holdout there is one run of 3 with different wordings, which is left
  alone.
- The rule drops 13 notes on dev. Pairs stay, because two in a row read
  fine.
- **Risk.** The golden opposition drill loses 5 expected lines. Those lines
  were written from the app's own output when the note was built, not as
  independent truth. The badge still marks every move. Update that golden
  file in the same commit.

**`seeds/d9716668.evals.json` at 56.7 KB: allow it as an exception. Do not
trim it.**
- Trimming does get it under the limit: lines of 6 moves give 48.2 KB, and
  dropping `moveUci` gives 50.2 KB.
- But the seed has to replay the owner's game from the exact stored evals.
  The review rules read the lines (`walkLineValue`, the why-rules), so
  trimming changes what the seed checks.
- Add one line under the 50 KB rule in AGENTS.md: "review-audit seed evals
  may be up to 100 KB".

**`dev@local.test` course-creation grant: keep it.**
- It exists only in the local dev database.
- The course feature is unreleased, and course data is test data.
- The dev stack needs it to create courses.
- Revoke it only if courses ship with prod-like permissions tests.

**Queen-against-pawn course rule: not answerable from the evidence.**
- `docs/plan.md` mentions it only in the list itself.
- The git history has nothing more.
- It needs the owner's original note on what the rule is.

## Order to do it in

1. Fix the probe so it reports the depth it reached (audit only). Check
   prod's engine depth.
2. Q4: turn off the good-move comparison (smallest change, and it removes
   sentences that are wrong 45–60% of the time).
3. Q3: the clutter filter, then Q5's once-per-run rule.
4. Q1: the deep check behind its flag, measured in dev before prod.
5. Q2: nothing to build.
