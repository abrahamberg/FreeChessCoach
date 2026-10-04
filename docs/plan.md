# FreeChessCoach — Review text you can trust: the review audit (Phases 120–127)

Written 2026-10-01, after the owner reported four wrong sentences in one
reviewed game. The code of Phases 110–119 (the courses merge, board facts
for review, coach and stats, test tiers) is on `main` (PRs #41, #43–#49);
their task log is in git history: `git show 82c5a8a:docs/plan.md`. That
log left many boxes unticked although the work was merged; the end of this
file says what was checked against `main`, the owner steps that really are
still open, and the two lists that were never started.

**The goal:** at least 98% of the sentences Game Review shows, and of the
facts the course dossier hands a model, are correct, measured on held-out
games. This is a long-running process, not one fix: the daily loop is
`.claude/skills/review-audit/SKILL.md`; this plan is the work that makes
the loop better, in order.

## Where it stands, and what the next session does (written 2026-10-02)

**Start here.** Two days of the loop are on `main` (PR #50). Run the skill
`.claude/skills/review-audit/SKILL.md` on a new branch from `main`; this
section is its "what is next".

**Numbers at the end of 2026-10-02** (268 games: 220 dev, 48 holdout;
1,343 labels in `apps/api/.review-audit/labels.jsonl`):

| split / surface | judged | accuracy | to do |
|---|---|---|---|
| dev review | 150 | 71.7% | 150 more judged |
| dev dossier | 774 | 93.8% | below 98% |
| holdout review | 58 | 64.3% | 242 more judged; only about 170 sampled sentences exist, so the corpus must grow (Task 123.1) |
| holdout dossier | 303 | 93.1% | below 98% |

Dev code-check failures: 63 of 53,639 sentences, all in Phase 127's first
task.

**Unexplained or generic move notes** (positional "why"): the method is the
skill `.claude/skills/review-why-pass/SKILL.md` (Opus `review-why-analyst`
agents compare the played and best positions); what is built, dropped and
still unsure, with example counts, is `docs/review-open-ideas.md`. Add to it
after every pass.

**Next, in this order:**

1. **Phase 127** below (three clusters, biggest first). One `review-fixer`
   at a time.
2. **Judge rounds** until dev review and holdout review have 300: `batch`
   (4 dev + 2 holdout), six `review-judge` agents, `ingest`, `report --log`.
   The new notes (`review:reason:pin`, `kick`, `only-move`, the trade's
   "only developed piece") have one or two labels each; Tasks 126.2, 126.3
   and 121.3 each say what to do if judges mark them `irrelevant`.
3. **Grow the corpus** (Task 123.1) so holdout review can reach 300, then
   the long engine run in the background.
4. **A second calibration** for the owner (`calibrate`), a week after the
   first (2026-10-01).
5. Open boxes left in Phases 121–126: 126.2 step two (other pins, after a
   judged sample), 125.4 (a mistake's note says what is lost), 122.x (the
   audit's blind spots), `mobilityDelta` itself (Task 126.7, left over),
   the king-in-check shape in `pinShapes()` (Task 126.0, left over).

**Waiting on the owner** (do not build before they answer):

- Kick notes are 1.2 a game on dev. Keep all, or only the 29 that name a
  pin?
- One dev game has nine "The only move that holds" in a row. Say it once
  per run of only moves?
- The `dev@local.test` course-creation grant (revoke with `npx tsx
  apps/api/scripts/course-creator.ts revoke dev@local.test`); the
  queen-against-pawn course rule; `seeds/d9716668.evals.json` is 56.7 KB,
  over the 50 KB rule in AGENTS.md.
- Standing decisions (2026-10-02): no engine search deeper than depth 12
  in the app, and no mate count past 7 moves.

**What cost time, so the next session does not pay again:**

- The dev engine container runs `tsx watch` and restarts on any edit under
  `packages/`. A `run`, a judge's `probe` or a fixer's test in flight then
  fails; `run` retries a game once and after that drops it without an
  error. Do not edit `packages/` while a run or the judges are going.
  Write and test the next fix in a git worktree meanwhile (package tests
  with relative imports work there; `test:golden` and the audit do not,
  they resolve `@freechesscoach/*` to the main checkout).
- A dev `run` takes 20 to 40 minutes of CPU even with every engine answer
  cached. One run can measure several fixes when their sources differ.
- After a check-only change, `recheck` (seconds). After editing
  `seeds.json`, `corpus --per-band 0` before `run --only seed:`.
- New wording is tested against the golden courses before anything else:
  they vetoed "it has to move" (three trap courses), a one-pawn tolerance
  for "trade" (a rook for a bishop and a pawn), and "the only good move"
  for a slower win.
- A note that a tactic card may replace goes through
  `cardReplaceableNote` in `move-reasons.ts` (a free slot only), with its
  `withoutCarded…` filter in `report-tactic-verdicts.ts`, its template in
  the audit's `sources.ts` and its check in `check-review.ts`.

## Phase 127 — The three clusters left after 2026-10-02

### Task 127.1 — A tactic card names a prize the line really nets

**Findings (2026-10-02, dev):** all 63 code-check failures are tactic
cards failing `material-in-line` (59) or `mate-in-line` (3), plus one
`engine-line`. By card: allowed `freePiece` 17, found `fork` 9, allowed
`fork` 9, found `freePiece` 7, found/allowed `brilliantSacrifice` 5,
`skewer` 7, missed `fork`/`freePiece` 4, `weakBackRank` 3 (those three are
Task 121.1's). Two shapes, read off the failures:

- **The prize is taken, but not for free.** "You won a queen through a
  fork two moves away" (13.Nxe6+ in `pt1Hetf0`): Nxe6+ Kg8 Nxd8 Rxe4+, a
  queen for a knight and more, net 4. "win a rook through a skewer" where
  Bd3 Qf2 Bxf1 Qxf1 is a rook for a bishop, net 2. The card's `prize` is
  the claim's piece (`game-tactic-motifs.ts:190`, `reasons/
  defused-threat.ts:48`), while `materialAgrees`
  (`move-verdict/reasons/confirmed.ts`) only asks the walked line for net
  ≥ 1.
- **Nothing is won at all.** "You let them win a pawn through a free piece
  with exd4" (15…Nb4 in `kOZf0MOz`): exd4 Qxd4 is a pawn trade, net 0. The
  allowed card is read off the reply's pre-gate chance
  (`tactic-allowed.ts` `computeTacticAllowed`, `allowedCardOf`) and is
  **not verified to walk a line** in what was read; reproduce first.

**Read:** `move-verdict/reasons/confirmed.ts`, `move-verdict/line-value.ts`
(`walkLineValue`, `netPawns`), `tactic-allowed.ts`, `tactic-gain-clause.ts`
(`materialPrize`), `game-tactic-motifs.ts` around line 190, the audit's
`gainChecks` in `apps/api/scripts/review-audit/check-review.ts` and
`settledGain` / `prizeWon` in `oracle.ts`.

- [ ] `failures --source review:tactic-allowed:freePiece --check
  material-in-line` (dev): sort the 62 into the two shapes above and any
  third; write the counts here.
- [ ] A card keeps its `prize` only when the line nets that piece, give or
  take a pawn (the audit's `prizeWon` is the same idea; the app must not
  import it). Otherwise the gain is worded from the net: "won material"
  today (`materialPrize` with no prize), or a new wording the owner
  approves ("won the queen for a rook").
- [ ] An allowed card whose reply nets nothing on its own line is not
  shown.
- [ ] `test:corpus` (floors must hold), `test:golden` with each line
  explained, dev re-run: the 63 fall, nothing else rises.

**Commit:** `fix(review): a tactic card names only what the line nets`

### Task 127.2 — "Hanging" means it can be taken and kept

**Findings:** the largest judged tag on dev is `not-winnable` (24).
`dossier:why-better:leavesHanging` 11 wrong of 19 judged,
`dossier:board:leavesHanging` 9 of 43, `review:reason:loose-free` 6 of 15,
`review:reason:loose-winnable` 2 of 4. The judges' notes: the piece is
attacked, but taking it loses to a tactic or only trades ("Bc5 is attacked
by d4 but dxc5 dxc4 just trades bishops"; "after Qd4, Qxh2 runs into Nf6+
and mate"). The code checks pass, because the exchange on the square is
won statically. Not yet reproduced in code.

**Read:** `board-facts/loose-pieces.ts`, `board-facts/move-facts.ts`
(where the `leavesHanging` fact is built), `move-reasons.ts`
(`looseReasons`), the audit's `oracle.ts` (`exchangeGain`,
`moveIsSound`).

- [ ] Reproduce three judged examples (`failures --source
  dossier:why-better:leavesHanging`, dev).
- [ ] A piece is said to hang only when taking it is a move the engine
  would play (`evalAfter`'s lines hold it: the capture is among them and
  within a pawn of the best). No engine line for the capture: the row is
  not said. A check for it in the audit (`named-move-sound` exists).
- [ ] Golden, dev re-run, the four sources judged again.

**Commit:** `fix(analysis): a piece hangs only when taking it is a real move`

### Task 127.3 — "Won the queen, giving back a rook" from a line nobody played

**Findings:** `review:reason:other` is 11 wrong of 15 judged, tag
`hypothetical-line`: the card's detail line ("Won the queen, giving back a
rook.", "Won a knight, but it allowed mate.") is read off the engine's
line, not off what was played ("34…Kc6 captures nothing"). The sentence is
built by `verdictDetail` (`move-verdict/detail.ts`) from the verdict's
`LineValue` and printed by `report-tactic-verdicts.ts`.

**Read:** `move-verdict/detail.ts`, `move-verdict/index.ts` (line 115,
where it is attached), `move-verdict/line-value.ts`,
`report-tactic-verdicts.ts`.

- [ ] Give the sentence its own source in the audit's `sources.ts` (it is
  `other` today) and a check: every piece it names was captured by the
  move itself or its named reply.
- [ ] Say it only of material that changed hands on the board the reader
  sees, or name the line it comes from.

**Commit:** `fix(review): a card's detail speaks of the moves on the board`

## How to work through this plan

- The **daily loop** (run, judge, fix the biggest cluster, log) is the skill
  above, with two agents: `.claude/agents/review-judge.md` labels a batch,
  `.claude/agents/review-fixer.md` fixes one cluster. Phases 121–123 are
  tasks the loop will not reach by itself: known root causes, the audit's
  blind spots, scale.
- Work one task at a time and read only its **Read** list. The findings
  (F1–F6) are the evidence; a task cites the ones it needs.
- Layering as always: `packages/chess-analysis` is pure (no I/O); the audit
  lives in `apps/api/scripts/review-audit/` and may read the app's services,
  never the other way round. The audit's checks (`oracle.ts`, `check-*.ts`)
  must **not** import the analysis package's `see`, `loosePieces` or
  `forks`: a check built on the code it checks agrees with it by
  construction.
- A fix is never "make the sentence pass the check": it removes the false
  claim at its source, or drops the sentence. A silent move is fine, a wrong
  sentence is not.
- Course facts changes: `npm run test:golden`; re-record
  (`GOLDEN_UPDATE=1`) only with every changed line explained in the commit
  body. Tactic cards and detectors: `npm run test:corpus`; precision
  ceilings only go down, recall floors only up; if a floor would drop, stop
  and ask the owner (write `Blocked:` under the task).
- Checks: `npm run verify:changed` after each task. The api db tests need
  Docker; without it say "api db tests not run" in the Status line.
- When a task is done: tick its boxes, add `Status: done YYYY-MM-DD — <what
  was verified, with the audit's before/after numbers>`, one conventional
  commit per task.
- **No backward compatibility** (the owner's rule): reshape and delete
  directly, update every caller in the same commit. Stored game reports keep
  their old sentences until a game is analysed again; say so in the PR.

## What already exists (verified in code, 2026-10-01)

- **The tool**, `npm run review:audit -w apps/api -- <command>`
  (`apps/api/scripts/review-audit/cli.ts`, commands listed at its top):
  - `corpus` (`corpus.ts`): real Lichess games found through the puzzle
    database (`packages/chess-analysis/data/lichess-puzzle-motifs.csv`, or
    `--stream N` rows of the full puzzle DB) and, with `--dump N`, the head
    of the newest monthly dump (any game), bucketed by the players'
    average rating into five bands; the 66 golden courses
    (`apps/api/test/fixtures/courses/`); the owner's seeds (`seeds.json`).
    Each game is hashed into `dev` (80%) or `holdout` (20%) by id.
  - `run` (`run.ts`, `analyze.ts`): each game through the worker's own path
    (`engine.analyzeGame(fens)` with no options, then `runAnalysisSteps`)
    and through `buildCourseDossierFromEngine` as a one-line `master_game`
    course. Engine answers are cached in the workspace
    (`GoldenEngineCache`), so a re-run after a code change needs no engine.
    A game with an `evalsFile` is replayed from those evals
    (`stored-engine.ts`). A game whose analysis fails is tried once more.
    The dev engine restarts when a file under `packages/` or
    `services/engine/` changes (`tsx watch`): do not edit those during a
    run, the requests in flight fail and their games drop out of the run.
  - Sentences (`items.ts`): for the review, exactly what the note card
    shows, from `reviewMoveTexts` (`packages/chess-analysis/src/review-move-texts.ts`,
    which `apps/web/src/features/board/TacticReasonList.tsx` and
    `MoveNoteContent.tsx` now use too: one copy). For the dossier, every
    row of `renderCourseDossier` for the nodes it shows in full, with the
    `BoardFact` behind it.
  - Code checks (`checks.ts`, `check-review.ts`, `check-dossier.ts`, on
    `oracle.ts`): `named-pieces` (every "the rook on d1" stands there before
    the move, after it, or along a move the sentence names); `named-move` /
    `named-line` (legal); `material-in-line` and `mate-in-line` (the
    engine's own line for the named move delivers what a card promises,
    and a mate in as many moves as the card counts); `mate-count` (a
    forced mate gives its number of moves exactly when it is short and the
    search covers it) and `mate-count-exact` (no count said is longer than
    the audit's own depth-40 search of that board finds, `mate-probe.ts`);
    `can-be-taken`, `undefended`, `can-be-won` (an exchange search over real
    legal captures, `exchangeGain`); `fork-geometry`, `pin-geometry`,
    `guard-lost`, `passed-pawn`, `balance`; and per `BoardFact` kind: moved,
    castles, promotes, captures, gives, blocksCheck, discovered/double
    check, checkAnswers, back-rank mate, opposition.
  - `batch` / `ingest` (`batch.ts`, `labels.ts`, `judge-instructions.md`):
    packets for judges and the label ledger (`labels.jsonl`, keyed by a hash
    of surface, position, move and text: a changed sentence needs a new
    label, an unchanged one keeps its).
  - `report` (`report.ts`): accuracy of the scored sample per split and
    surface with a 95% lower bound, code-check failures over every dev
    sentence by source, judged errors by tag; `--log` appends to
    `history.md`. `failures`, `show`, `probe` (a judge's calculator:
    attackers, defenders, exchange value, engine lines) and `seed` (a game
    from the dev DB with the evals it was analysed with).
  - Tests: `apps/api/scripts/review-audit/oracle.test.ts` (5, pass),
    `packages/chess-analysis/src/review-move-texts.test.ts` (2, pass).
- **The seed**, `seed:chesscom-184514899210` (`seeds.json`,
  `seeds/chesscom-184514899210.evals.json`): the owner's game with its
  stored evals. A run of it (2026-10-01) flags all four reported sentences
  by code alone: 12.Bxc5 and 15.Nxe5 and 25.Qxc7 fail `named-pieces`,
  13…Bd3 fails `can-be-won`.
- **Not done yet:** no Lichess game has been fetched or run, and no sentence
  has been judged. There is no accuracy number yet. Phase 120 is that.

## Findings (verified 2026-10-01 on the seed game)

**F1 — Prevention cards describe a board nobody sees.** Three of the four
reports. `move-verdict/reasons/defused-threat.ts:34` copies `claim.detail`
from the threat's sighting onto `tacticPrevention`; that detail is written
for the position after the threat move (`sighting.moveSan` played from
`sighting.fenBefore`), and `tacticPreventionReason`
(`tactic-reason-text.ts:127`) prints it without the move and with no
confidence gate (it passes `'medium'` to `gainClause` but always appends
the detail). So 15.Nxe5 reads "rook on d5 forks the bishop on c5 and the
knight on e5" with the rook on d8. Two of the three are also false as
threats: …Rd1+ at move 12 is met by Rxd1 (no back-rank mate), and at move
25 there is no rook on d1 or queen on d6 in any line the reader could
follow.

**F2 — "Where it can be won" on an even trade.** 13…Bd3: the rook on d8
defends d3, so Nxd3 Rxd3 wins nothing (the audit's `exchangeGain` says 0;
`oracle.test.ts` pins it). `loosePieces` (`board-facts/loose-pieces.ts:33`)
kept the bishop because `see(seat, 'd3', 'w') > 0`. Which of `see`, the
seat (`flipActiveColorFen`) or the "new since before" filter in
`move-reasons.ts` `looseReasons` is wrong is **not yet verified**: the task
reproduces it first.

**F3 — The real reason goes unsaid.** 25.Qxc7 was the only move that keeps
the queen (the owner's words). With fresh evals the card is "You won a pawn
through an eventual fork." `isOnlyMove` (`board-facts/only-move.ts:10`)
exists and the dossier uses it (`quizEligible`), but no review reason does.

**F4 — The text depends on which engine answers it got.** The seed's
stored evals have Bb4 best at ply 49 (+39.9) and Qxc7 second; a fresh
search on the dev engine has Qxc7 best. Same depth (12), same code, and
three of the four reported sentences appear only with the stored evals.
Stockfish with more than one thread is not deterministic, and users also
analyse with the browser engine and the Lichess eval index. A corpus run
with one engine setting under-reports.

**F5 — What the audit cannot check yet.** No code check for: dossier
`verdict` and `alternative` words against the eval; `trapped`; `keepsSafe`
and `takesOutOfDanger` (only "the piece exists"); whether a `tempting`
refutation really refutes; the motif of an `allowed` / `opportunity` card
(only its material or mate); "Recaptures" (needs the previous move);
`dossier:tactics` (the node stores only strings, `CourseNodeFacts.tactics:
string[]`, so there is no card data to check); the quality badge itself
(Brilliant, Great, Miss). These all go to judges today.

**F6 — Only tactical games.** Every Lichess corpus game comes from a
puzzle, so each has a tactic. Quiet games (the notes "Concedes the centre",
"Costs N squares of piece mobility", trades) are under-sampled.

## Phase 120 — Put the audit to work

### Task 120.1 — The first full run and the baseline

**Depends on:** nothing. **Read:** the skill; `cli.ts`'s header.
**Files:** none (workspace only).

- [x] `corpus --per-band 40 --stream 150000 --dump 400000` (200 Lichess
  games, plus the golden courses and the seed). Done 2026-10-01: 267 games.
  Puzzle games are never rated under 1400, so `--stream` alone left two
  bands empty; `--dump` (the head of the monthly dump) fills them, and gives
  the quiet games of Task 122.5. If a band stays short, raise `--dump`.
- [x] `run` (the first run searches: about 48 seconds a game on the dev
  engine's pool of 2, 90 minutes for the 267), then `report --log`.
- [x] Read the code-check failures table. For the five sources with the
  most failures, open 5 each with `failures --source <s> --limit 5` and the
  probe: is the check right? A check that misfires is fixed now, with its
  position added to `oracle.test.ts`, before any number is trusted.
- [x] Write the baseline under this task: sentences per surface, the share
  failing a check, the top five sources.

**Baseline (2026-10-01, 267 games: 220 dev, 47 holdout).** 65,625
sentences: 10,293 Game Review, 55,332 dossier. 588 failed a check as first
written (530 review, 58 dossier); on dev 489 of 53,854. The top five dev
sources and what reading them showed:

| source | failing | verdict on the check |
|---|---|---|
| `review:reason:missed-capture` (`material-in-line`) | 126 of 503 | right on even trades, wrong when the engine line's last ply gives a pawn back or a pawn queens anyway: now `settledGain`, 50 left |
| `review:tactic-prevention:stopped:freePiece` (`named-pieces`) | 62 of 104 | right: "captures the queen on c3" with no queens on the board (F1) |
| `dossier:board:checkAnswers` (`check-answers`) | 50 of 488 | wrong: the fact counts the king taking the checker as a capture, on purpose; 0 left |
| `review:tactic-prevention:stopped:fork` (`named-pieces`) | 38 of 120 | right (F1) |
| `review:tactic-allowed:freePiece` (`material-in-line`) | 30 of 259 | half horizon (a queen trade cut at the line's last ply): `settledGain`; a named move the engine would not play is now `named-move-sound` |

After the checks were corrected: 303 dev failures. Found on the way: two
of the 200 Lichess games failed the app's analysis (two comments after one
move; fixed in `annotated-pgn.ts`), a re-run with every engine answer
cached costs 15 seconds of CPU a game (`loosePieces` → `see` is 43% of it;
the worker pays this too), so `run` uses six processes and `recheck`
re-runs the checks alone.

**Commit:** `chore(audit): first run; checks corrected against the corpus`

### Task 120.2 — The first judging round and the owner's calibration

**Depends on:** 120.1. **Read:** `judge-instructions.md`, the skill §4.

- [ ] Batches until dev has at least 300 judged sentences per surface, then
  the same for holdout (12 positions per batch, 4–6 `review-judge` agents
  at a time). 2026-10-01, two rounds (12 batches, 901 labels): dev dossier
  523 judged; dev review 110, holdout dossier 246, holdout review 39.
  Holdout review has only about 150 sampled sentences in 47 games: the gate
  needs the week-2 corpus or a higher sample rate there (owner's call).
- [ ] Calibration: 20 random labels shown to the owner (`show`), their
  verdicts compared. More than 2 disagreements: rewrite the unclear part of
  `judge-instructions.md` and re-judge that tag. The first 10 were read on
  2026-10-01: see Phase 125. Ten more with `calibrate`, after 125.1–125.2.
- [x] Every `audit-bug:` note from a judge becomes a check fix with a test.
  One so far: `material-in-line` failed "wins the queen" when the line
  gives a knight for it (net 6, claimed 9). `prizeWon`: more than half the
  prize.
- [x] `report --log`: this is the first real accuracy number. Write it here.

**First numbers (2026-10-01, after the three fixes of Phase 121 and the
passed-pawn fix; an estimate while under 300 judged).** dev review 71.0%
(n=110), dev dossier 92.5% (n=523), holdout review 57.6% (n=39), holdout
dossier 91.9% (n=246). Dev code-check failures 134 of 54,131 (489 at the
first run). The estimate weighs check-failing and check-passing sentences
by their share of the sample (`report.ts` `estimate`).

**Clusters seen, biggest first (dev), for the next days:**
1. `review:reason:missed-capture`, `material-in-line`: 50 code failures,
   7 of 16 judged wrong ("Missed Bxd5, winning material on d5" on an even
   trade). Likely `missedCaptureReason` reading `see > 0` (see 121.2).
2. Tactic cards whose engine line does not win the prize
   (`review:tactic-allowed:*`, `tactic-opportunity:*`,
   `material-in-line`): about 75 code failures; `dossier:tactics` 8 of 22
   judged wrong (the same cards in the dossier).
3. `review:reason:other` ("Won the queen, giving back a rook"): 7 of 11
   judged wrong, tag `hypothetical-line`: the material is from an engine
   line, not from what was played.
4. `dossier:*:leavesHanging` / `review:reason:loose-free`: 15 of 41 judged
   wrong, tag `not-winnable`: "hanging" when taking it loses to a tactic.
   No code check yet (needs the engine's reply to the capture).
5. `dossier:tempting:check`: 4 of 4 wrong, the mate count is from the
   wrong ply. `dossier:verdict` / `alternative`: 9 of 243, eval words one
   band off at depth 20+ (Task 122.1).
6. `review:reason:mobility` ("Costs 9 squares of piece mobility"): judges
   say it compares one side's moves before with the other's after. Two
   seen, both wrong; no check yet.
7. Left by today's fixers: "Trades pawns on g6" on a mating en passant
   (`describeTrade`); the `pawnBreakthrough` detector compares passed pawns
   by square as `passedPawnReasons` did; a found back-rank mate card paid
   in material (`verify-tactic-line.ts`); "winning a rook" for rook against
   knight (`materialPrize`).

**Commit:** `chore(audit): judge instructions calibrated with the owner`

## Phase 121 — The owner's four, at the root

Each task: the failing test first (the seed positions are in
`seeds.json`), then the fix, then `run --split dev` and the before/after
failure counts in the Status line.

### Task 121.1 — A prevention card never describes an unseen board

**Findings:** F1. **Read:** `docs/tactics-rework.md` §9,
`move-verdict/reasons/defused-threat.ts`, `tactic-reason-text.ts`
(`tacticPreventionReason`), `available-motifs-scan.ts` (`PvMotifSighting`).
**Files:** those, `packages/shared/src/analysis.ts` (`tacticPrevention`).

- [x] Test (in `tactic-reason-text` or `defused-threat` tests): for the
  seed's plies 23, 29 and 49 with the stored evals, every piece the
  prevention sentence names stands on its square before the move, after it,
  or after the one threat move the sentence names.
  (`move-verdict/reasons/defused-threat.test.ts`, the stored lines in
  `move-verdict/owner-seed-fixture.ts`.)
- [x] Carry the threat's move on the card (`threatSan`), and write the
  sentence around it: "You stopped them winning a rook through a free piece
  with Qxe8+ — captures the rook on e8." When the threat move is not the
  opponent's legal next move in the position before this move, there is no
  card at all: the threat is classified again on that board
  (`standing-threat.ts`) and the card's detail, prize and arrows come from
  there. A stored card with no `threatSan` prints no detail.
- [x] The threat must be real: drop the card when the engine's line after
  the threat move (from the prevention scan) does not win what the card
  says. 12.Bxc5 (…Rd1+ Rxd1) must produce no card. The cause of the false
  mate: the scan's claims were never checked on a line (the comment in
  `defused-threat.ts` said they were); each sighting now carries the line
  (`lineSan`) and the check walks it.
- [x] `test:corpus`: passes, no detector or classification changed.
  `test:golden`: **there is a diff**, re-recorded. The snapshot's REVIEW
  NOTES print every review reason, prevention sentences included: 34
  prevention lines are gone and one names its move (Game of the Century
  18…Bxc4+, "with Qxc3"). On 8 moves the verdict falls through to the next
  confirmed reason, which the dossier prints as a `tactics:` row: Saavedra
  6…Rc4+ (brilliant sacrifice), Immortal 17…Qxb2 (fork; the node is now
  shown in full), Opera 14.Rd1 (counterattack), fork trick 5…d5 (the fork),
  Elephant 7…Bb4+ (in-between move) and 9…Kxd8 (free piece), Englund 6…Bb4
  and Noah's Ark 9…Be6 (saved a hanging piece). The Englund diagnosis-code
  test lists `Bb4:defendsHangingPiece` too; its codes are unchanged.

Status: done 2026-10-01 — dev split (220 games): prevention sentences 438 →
20, failing `named-pieces` 170 → 0; all dev code-check failures 303 → 134.
One other source rose by one: `review:tactic-opportunity:found:weakBackRank`
0 → 1 (`mate-in-line`, x2KnTpLY 17.Qxb8+ "You forced mate through a
back-rank tactic two moves away"), a found card the false prevention card
used to outrank; it is the same fault as the two `weakBackRank`
`mate-in-line` failures already on the allowed and missed cards (a mate
claim that `verify-tactic-line.ts` accepts on material). About 130
positional found cards (saved a hanging piece, moved the target, blocked the
threat) and 144 `dossier:tactics` rows now show on moves the prevention card
held; none fails a check, none has been judged. Stored game reports keep
their prevention cards until analysed again, printed without the detail.
`verify:changed` passes with the api db tests (their defused-fork fixture
now gives the fork an engine line: a threat with no line behind it is no
card).

**Commit:** `fix(review): a stopped threat names its move, and only when it was real`

### Task 121.2 — "Can be won" only when the exchange wins

**Findings:** F2. **Read:** `board-facts/loose-pieces.ts`, `see.ts`,
`move-reasons.ts` (`looseReasons`), `null-move-fen.ts`.

- [x] Reproduce first: a wip test calling `loosePieces` on the seed's
  position after 13…Bd3 (`r2r2k1/p1p2ppp/2n5/1pB1N3/8/2Pb1N2/PP3PPP/R4RK1 w - - 1 14`).
  Find which step says the bishop is winnable, and write the cause here.
  **Cause (2026-10-01):** neither the seat nor the "new since before"
  filter. It is White's turn, so `flipActiveColorFen` is not called; the
  bishop was on f5 before, so the filter has nothing to remove. `see`
  counts the exchange correctly (Nxd3 Rxd3) but its table has the bishop at
  330 and the knight at 320 (`docs/algorith.md` line 79), so the answer is
  +10, and `loosePieces` kept anything with `see > 0`. A knight taking a
  defended bishop was always "winnable"; a bishop taking a defended knight
  (-10) never was.
- [x] Fix it at that step; keep one regression test on the smallest
  position (a bishop attacked once by a knight, defended once by a rook).
  `loosePieces` now needs the exchange to win a pawn
  (`CONFIG.evalWitness.minThreatSeeCp`, the bar the diagnostics already use
  for "statically winnable"). `see`'s table is the Game Report's spec and
  is not changed. The same second example in the first run, 8.Bg3 in
  `bXetM8S2` (…Nxg3 hxg3), has the same cause.
- [x] `test:golden`: the dossier's `leavesHanging` uses the same list, so
  lines may drop; explain each. Stats (`diagnostics/`, Phase 117) read
  `loosePieces` too: say in the PR that counts can fall. One line drops, in
  `master_game-gold-coins`: "n23 12.Bg4: Leaves the bishop on g4 where it
  can be won" (…Nxg4 Qxg4 is a knight for a bishop; Black's 12…Qd6, not
  taking, is graded good). No `leavesHanging` line moves: the dossier
  prints the `free` tier only. The stats that count the `winnable` tier are
  BV-22 and MS-14; theirs can fall. Re-recorded with that one line.
- **Left over:** other code reads `see > 0`, `>= 0` or `=== 0` as won,
  safe or even, and gets the same 10 centipawns: `missedCaptureReason`
  (`move-reasons.ts`, "Missed Nxd3, winning material on d3"),
  `isEvenExchange` (`trade-description.ts`: a bishop for a knight is never
  "Trades the bishop for the knight"), `board-facts/safety.ts`, and the
  tactic gates (`isProfitableCaptureOn`, `verify-tactic-claims.ts`,
  `tactic-trapped.ts`, `tactic-detectors/`). Each is its own cluster with
  its own measured change (`test:corpus` for the tactic gates); none is
  touched here.

**Commit:** `fix(analysis): a piece defended through an even trade is not loose`

### Task 121.3 — The only move is said

**Findings:** F3. **Read:** `board-facts/only-move.ts`, `move-reasons.ts`,
`board-facts/material.ts` (`settledLine`, `lineBalance`),
`move-verdict/` (how one card is chosen).

- [x] A review reason for a played only move (`only-move-reason.ts`, on
  `isOnlyMove`, the test the course quiz and the "only moves found" stat
  use): "The only winning move", "The only move that holds" or "The only
  good move", by where the engine's first two lines stand for the mover
  (winning against not; holding against losing; far apart in between).
  When the board shows what the second line costs: "…: the next best,
  Kd7, loses the queen" (a piece the other side takes for nothing before
  the line goes quiet) or "…, gets mated". The plan's "anything else
  loses the queen" is not said: only the second line is known.
- [x] The move that missed it (Task 125.5): "Missed the only winning
  move, dxe6", unless a sharper note already names that move.
- [x] Silent when the game is decided either way (the second move still
  wins, or the first already loses), on a mate (the mate notes say it),
  and on a recapture. The first version said "The only good move" for
  9.0 against 5.0: a slower win is not a bad move.
- [x] Beside a tactic card for the chance the move took or missed, the
  note is dropped (`withoutCardedOnlyMove`): the card names the same move
  with what it wins. The plan's "a card that explains less is not shown
  beside it" is not built; it needs the card's share of the eval gap.
- [x] **A note a card may replace only fills a free slot.** The only
  move, the pin and the kick are one family (`cardReplaceableNote`, one
  a move, in that order), added after the two reasons that stay whatever
  the card says. Found on the golden files: placed among the reasons, the
  note pushed "Trades pawns on f2" out of 6…exf2+ and was then dropped
  beside the card, so the trade was lost for nothing.
- [x] Tests: the three wordings, the two costs, the missed move, the
  silences. Not the seed's ply 49: with its stored evals Qxc7 is the
  engine's second move (finding F4).
- [x] The audit checks the sentence against the engine's first two lines
  (`only-move`: the move named is the first, the gap, the wording's band,
  the cost named).
- [x] Golden, 27 new lines in 12 courses, nearly all endgame drills and
  studies where it is the lesson: King and pawn 3.e7 and 4.Kf7, the
  opposition draw's six king moves, Philidor 4…Rd1+, the knight against
  the pawn, the square rule, the perpetual's three checks; in master
  games 17…Be6, 18…Bxc4+ and 19…Ne2+ of the Game of the Century and
  12…Qg6 and 19…Qxa1+ of the Immortal Game; Englund 6.Bc3 "Missed the
  only good move, Nc3".
- [x] Dev re-run: **189 notes in 96 of 220 games (0.9 a game)**: 77 "the
  only move that holds", 38 "winning", 27 "good", 47 missed; 31 name a
  cost. Among the Lichess games, 40 have one, 24 two, 12 three; one has
  eleven (`tod9P6y4`: nine king moves in a row in a drawn ending, each
  "The only move that holds", each already badged `great`). 188 of 189
  passed the check; the one that failed was wrong, 34.Qd1 "the next best,
  f6, loses the queen", where the queen goes for a rook and a pawn. A
  piece is now named only when it goes for next to nothing.
- [ ] 30 judged. Watch the run of identical notes in one ending: if
  judges mark them `irrelevant`, say it once per run of only moves.

**Commit:** `feat(review): the only move, and what the others lose`

### Task 121.4 — The corpus sees more than one engine

**Findings:** F4. **Files:** `apps/api/scripts/review-audit/corpus.ts`,
`run.ts`, `cli.ts`.

- [ ] `run --depth <n>`: the same games searched at another depth, kept as
  their own games (`<id>@d8`) so their sentences are separate items. Dev
  games at depth 8 and 12 by default.
- [ ] `corpus --from-db --email <e>`: the owner's analysed games from the
  dev DB with their stored evals (through the repositories, as `seed.ts`
  does), as source `db`.
- [ ] Report the share of sentences that differ between the two depths of
  one game: a high share in a source means that source is fragile.

**Commit:** `feat(audit): each game under two engine settings; games from the dev DB`

## Phase 122 — Close the audit's blind spots

**Findings:** F5, F6. One task per check; each adds an invariant test in
`oracle.test.ts` (or a `check-*.test.ts` beside it) on a real position.

### Task 122.1 — Verdict words and alternatives against the eval

- [ ] `dossier:verdict` and `dossier:alternative`: "White is better" needs
  a White-positive eval of that position, "roughly equal" a small one,
  "forced mate in N" the engine's mate. The thresholds are the audit's own
  (loose bands), not `verdict-words.ts`'s.

### Task 122.2 — The card's motif, not only its prize

- [ ] For `fork`, `pin`, `skewer`, `discoveredAttack`, `discoveredCheck`,
  `weakBackRank`, `trappedPiece`, `freePiece`: geometry checks on the
  position after the named move (the forker hits both; the pin's three
  pieces are in line; the back-rank check has no capture or block).
- [ ] `dossier:tactics` carries the card data: `CourseNodeFacts.tactics`
  becomes `{ text, card }[]` (reshape; the dossier is rebuilt, course data
  is test data). Re-record allowed: the rendered text must not change.

### Task 122.3 — Trapped, kept safe, out of danger, tempting

- [ ] `trapped`: every square the piece can reach loses it
  (`exchangeGain > 0` there), or it cannot move.
- [ ] `keepsSafe` / `takesOutOfDanger`: the piece was winnable before the
  better move and is not after it.
- [ ] `tempting`: after the tempting move and the refutation, the engine's
  eval (the probe's search, cached) is worse for the mover than after the
  answer move by a real margin.

### Task 122.4 — Recaptures, and the badge

- [ ] `AuditPosition` carries the previous move; "Recaptures" needs a
  capture on that square one ply earlier.
- [ ] The quality badge as a sentence (`review:quality:brilliant|great|miss`):
  judged only, sampled at a lower rate. The owner decides whether it counts
  toward the 98%.

### Task 122.5 — Quiet games

- [x] Games not tied to a puzzle, half of each band: `corpus --dump <lines>`
  (2026-10-01, `corpus.ts` `dumpGames`) reads the head of the newest Lichess
  monthly dump instead of the user API: one stream, every band, no bullet.
- [ ] The report splits accuracy by puzzle game / dump game (`focusPly`
  null or not), to show whether quiet games read worse.

**Commit (each):** `feat(audit): check <what>`

## Phase 123 — Scale and cadence

### Task 123.1 — The corpus grows on a schedule

- [ ] Week 1: 40 per band. Week 2: 100. Week 4: 200 (1,000 games). Each
  step: `corpus`, `run`, judge only the new sample. The engine cache file
  is one JSON document: past about 300 MB, split it per game
  (`engine-cache/<id>.json`).
- [ ] A second engine container with a bigger pool for the audit
  (`--engine-url`), so a 1,000-game first run is hours, not days.

### Task 123.2 — Every day without being asked

- [ ] The owner picks: a scheduled Claude Code routine that runs the
  `review-audit` skill each morning, or a local cron
  (`claude -p "/review-audit"`). The run ends with the PR and the history
  line; the owner merges.
- [ ] The label ledger is backed up: `labels.jsonl` copied weekly to a
  place outside the workspace (the owner says where). Losing it means
  judging everything again.

### Task 123.3 — The owner sees what the judges decided

- [ ] `report --html`: one page with a board per judged sentence, its
  label and note, filter by verdict and tag, so calibration takes minutes.
  Read-only; built from `items.jsonl`, `positions.jsonl`, `labels.jsonl`.

## Phase 124 — The gate, and staying there

### Task 124.1 — Done

- [ ] Holdout `review` and `dossier` each ≥ 98% with ≥ 300 judged, the
  owner's calibration agreed, written into `history.md` and the Status line.
- [ ] The seeds as a test that needs no engine: a `golden`-tier test that
  replays each seed from its stored evals and fails when a review sentence
  fails a code check. Every owner report stays fixed.
- [ ] Drop to weekly: 50 fresh games, judged sample, report. A drop under
  98% reopens the daily loop.

## Phase 125 — Useful, not only true (the owner's calibration, 2026-10-01)

The owner read ten random labels. The judges' facts held (one eval band
aside), but six of the ten sentences were marked down for being clutter or
for not being the point of the move. "Correct" now means true **and** worth
saying. The rules are in `judge-instructions.md` ("Useful, not only true");
three are code checks (`nothing-after-mate`, `decided-trivia`,
`mate-count`), and a `correct` label no longer outvotes a failing check
unless the judge wrote `audit-bug`. With them, on the same labels: dev
dossier 87.3% (was 92.5%), dev review 69.6%.

The first calibration file showed one sentence per move, so three of the
owner's remarks ("the real story is the missed dxe6", "the queen hangs on
f6", "state the exchange") were about moves whose other sentences said
exactly that. `calibrate` now prints every sentence of the move.

### Task 125.1 — Nothing after mate, no clutter in a decided game

**Findings:** items 7, 9, 10. **Read:** `course/dossier-line.ts` (the end
position's rows), where the dossier lists `alternative` moves.

- [x] A move that is checkmate gets no `alternative` rows and its end
  position no structure rows (dev `nothing-after-mate`: 146 and 581
  sentences, now 0 and 0). `dossier-node.ts` (`alternatives`),
  `dossier-line.ts` (`endFeatures`); the mate facts stay.
- [x] A decided end position (a forced mate, or five pawns up on the
  engine's line: `CONFIG.courses.decidedCp`) keeps only the winning side's
  passed pawns (dev `decided-trivia`: 764, now 0; `dossier:line-end` went
  from 1766 rows to 418). The golden endgame courses keep "white has a
  passed pawn on e7" (king and pawn) and "on b7" (Lucena). The builder
  reads the dossier's own eval of the end position (multiPv 3); the audit
  checks the row against the review's eval when the review has the same
  position, and the two can straddle 500 (one dev position: two-examples'
  5.Nc6+, +472 against +516, three rows gone that the check had passed).
- [ ] Not coded, judged: a feature that plays no part in a balanced
  position (item 7, a passed h-pawn at -0.9). Once judges have labelled 100
  `dossier:line-end` rows under the new rule, decide from the share marked
  `irrelevant` whether the rows need a relevance gate or go.

### Task 125.2 — A forced mate says in how many moves

**Findings:** item 4. **Read:** `tactic-reason-text.ts` (`gainClause`).

- [x] "They forced mate." becomes "They forced mate in 5" from the engine
  line the card was verified on; a move that is itself mate says
  "checkmate". Dev: 197 review cards, 208 `dossier:tactics` rows.
  Done 2026-10-01: `gain.mateIn` (the mate distance counting the card's own
  move as the first), set on the verdict's card by
  `move-verdict/mate-distance.ts` and said by `tactic-gain-clause.ts`
  (`gainClause`, split off `tactic-reason-text.ts`;
  `docs/tactics-rework.md` §13). Dev `mate-count`: review cards 197 → 3,
  `dossier:tactics` 208 → 2; no other check moved. The five left are the
  three `weakBackRank` cards of Task 121.1's status (x2KnTpLY 17.Qxb8+,
  T0xu4W75 25…Rxe4 and 26.Rxe4, the last two in the dossier too): their
  engine line has no mate at all, so there is no number to give and
  `mate-in-line` fails them as before. `mate-in-line` now compares the
  card's count with the line (`mateCountAgrees`): 0 of 194 numbered review
  cards differ.
- [x] Was open, the audit not the sentence (closed with 125.6, 2026-10-02:
  a position now carries the review's and the dossier's own search, each
  with its depth; a dossier row is checked against the dossier's, and the
  packet prints both): a main-line position holds the
  review's engine lines, and the dossier searches the same position again
  (multiPv 3). On dev 59 of 206 numbered `dossier:tactics` rows give
  another distance than the lines the packet prints for the judge
  (Lasker–Thomas 11.Qxh7+: "forced mate in 6" in the dossier, mate in 7 in
  the review's line), while agreeing with the dossier's own line (36 of 36
  in the six games with the most differences). Either the position keeps
  the dossier's lines for dossier rows, or judges are told which search a
  row came from. The prevention card keeps "forcing mate" with no number
  (none on dev): its line is the scan's, from another board.

### Task 125.6 — The mate count is the real one

**Finding (2026-10-01, after 125.2):** the number is the engine's at the
depth the game was analysed with (12), and a shallow search reports a
longer mate than there is. The owner's own example, 24…Qxh3, now reads
"They forced mate in 10" in Game Review; the dossier's search and a depth
20 probe both say mate in 5. On dev 59 of 206 dossier mate rows differ
from the review's line for the same move.

- [x] Owner's call (2026-10-02): **no deeper search; the number only when
  the mate is short and the search covers it.** The app does not want an
  engine deeper than 12 (the external engines return 12 whatever is asked),
  and a mate longer than about 7 is not worth a number. One place decides
  for every sentence: `saidMateIn` (`packages/chess-analysis/src/mate-count.ts`,
  `CONFIG.mateCount`), asked by the cards (`mate-distance.ts`), "Missed mate
  in N" (`move-reasons.ts`), the dossier's verdict words and alternatives
  (`verdict-words.ts`) and its tempting rows (`tempting.ts`). Without a
  number the sentence still says the mate: "They forced mate.", "Missed a
  forced mate starting with Qh5", "Black has a forced mate".
- [x] The rule, from the measurement (`docs/tactics-rework.md` §13 has the
  whole table; 869 dev positions with a mate line, each count against the
  depth-34 and depth-40 searches of the same move). By the depth-12 count,
  best line, exact / lines: 1: 300/300, 2: 199/199, 3: 123/138 (89%),
  4: 94/128 (73%), 5: 36/89 (40%), 6: 15/85 (18%), 7: 2/55 (4%), 8+: 2/248.
  "Exact when the depth reaches the mate's 2N - 1 plies" does not hold. By
  length in plies from the searched position it does split cleanly: up to
  five plies (the side to move mates in 1 to 3, or is mated in 1 or 2) 584
  of 584 at depth 12 and 311 of 311 at depth 18; six plies 72% and 90%,
  seven 88% and 94%. At depth 34 every length up to 14 plies is 89% or
  better against depth 40. So: said when the mate is at most 7 moves
  (`maxMoves`) and at most 5 plies from the searched position
  (`provenPlies`), or the eval is at least depth 34 (`deepDepth`, a Lichess
  index hit).
- [x] The audit: `mate-count` now rules both ways with its own copy of the
  rule (a number that is not owed, or none where a short covered mate owes
  one), on the search the sentence came from; `mate-count-exact` compares
  every count said with the audit's own depth-40 search
  (`check-mate-count.ts`, `mate-probe.ts`; measurement only).

Status: done 2026-10-02 — dev split (220 games with the new seed, 53,206
sentences), the old behaviour (every count said) against the rule, both
under the new checks: sentences failing a check 950 → 114; `mate-count`
836 → 0; `mate-count-exact` 393 of 1,387 → 0 of 624; `mate-in-line` 3 → 3
(the weakBackRank cards of Task 121.1); every other check 114 → 114. Of
1,665 forced mates the sentences speak of, 1,660 gave a number before and
730 do now (review 162 of 411, dossier 568 of 1,254); 935 say the mate
without one. 24…Qxh3 reads "They forced mate." Golden facts re-recorded:
135 lines, every one a dropped number. Targeted vitest, `test:golden`,
`test:corpus`, typecheck and lint pass; api db tests not run.

Tried first and dropped on the owner's decision: searching a position with
a mate line again at depth 34 (4.3 extra searches a game on dev, 2.7 s each
against 0.08 s for the usual one, so more than double the engine time of an
average game). It took `mate-count-exact` from 393 to 79 on dev; merging
the two searches by move (a faster mating move the first search had not
listed, a defence the deeper one left out) took the twelve games with the
most failures from 50 to 8, and was not run on the whole split. Searching
in reverse game order did not help.

### Task 125.3 — No "excellent" for a move that gives up a forced mate

**Findings:** item 2 (22…Qc3: mate in 8 given up, still -13.9, badge
"excellent"). `docs/algorith.md` line 103 already says a slow or missed
mate is flagged "via the `Miss` label instead (§5.8)", but §5.8 only
re-labels an inaccuracy, mistake or blunder, and this move loses no
accuracy, so nothing flags it.

- [x] `classify-miss.ts` (`gaveUpShortMate`, rule M0 in
  `docs/algorith.md` §5.8): a move from a position with a forced mate for
  the mover to one without is a `miss`, whatever its tier (the underlying
  severity is kept for the accuracy math). A slower mate stays as it is;
  a played checkmate is never a miss; a position after that was not
  searched claims nothing.
- [x] **Only a mate the review would put a number on** (the owner,
  2026-10-02): `saidMateIn`, the rule of Task 125.6, so at most 7 moves
  and within what the search can stand behind (5 plies at depth 12). A
  depth-12 "mate in 9" given up is not held against the move.
- [ ] The badge as a sentence in the audit (`review:quality:*`, Task
  122.4), with a check for this rule. Not built: the audit does not carry
  badges yet.
- [x] `test:corpus`, `test:golden` (no line changes), §5.8 updated. On
  dev 8 moves change badge: 7 from `excellent` and 1 from `good` to
  `miss` (277 → 285 of the moves that have a note).

**Commit:** `fix(review): a move that gives up a short forced mate is a miss`

### Task 125.4 — A mistake's note says what is lost

**Findings:** item 6 (14…Nb5: "win a knight" / "can be won" when b5 is
attacked three times and defended twice and a pawn goes). With cluster 2
of Task 120.2.

- [ ] A `winnable` piece whose exchange nets less than the piece says what
  goes and the count: "b5 is attacked three times and defended twice: a
  pawn goes". The free-piece card is not used for a defended piece.

### Task 125.5 — The only winning move (with 121.3)

**Findings:** item 5 (29.axb6: dxe6 was the one winning move, +3.7 against
+0.8 for the next). Task 121.3's reason, for a missed only move too.

- [x] Built with Task 121.3: "Missed the only winning move, dxe6".

## Phase 126 — What a quiet move does: the pin, the kick, the trade (owner's report, 2026-10-02)

**The report** (seed `seed:d9716668`, the owner as Black; `show
seed:d9716668 --where p10`): 1.e4 e5 2.f3 Nf6 3.d3 d5 **4.Bg5 h6 5.Bxf6
Qxf6**. Game Review says nothing on 4.Bg5 (pins the knight to the queen),
nothing on 4…h6 (kicks the bishop), nothing on 5.Bxf6 (gives up White's
only developed piece; Black takes back with a developing move). The owner:
pins used to be over-reported (insignificant ones), now none appear; bring
back the ones that matter, judged by what stands behind the pinned piece
and whether the pinned piece had something to do, "without making pins
spammers". The dossier should be able to say the same.

**Verified in code, 2026-10-02:**

- The pin and the kick are both detected and never asked.
  `move-verdict/gate.ts` `frameVerdict` returns `null`, and no detector
  runs, unless the played move lost eval meaningfully or the second line
  is meaningfully worse than the first. A quiet pin (4.Bg5: −0.92 before,
  −1.14 after) and its answer (4…h6, the engine's first line) pass
  neither. `tactic-detectors/pin.ts` + `verifyPin` accept 4.Bg5
  (relative, queen behind, gap 6: confidence 0.45, positional);
  `tactic-detectors/gains-tempo.ts` is written for exactly a pawn hitting
  a piece. `boardFacts` (`board-facts/move-facts.ts`) already says
  "attacks the knight on f6, which is pinned to the queen on d8 by the
  bishop on g5" and "attacks the bishop on g5"; `buildReasons`
  (`move-reasons.ts`) does not read board facts.
- 5.Bxf6 has no trade note because `trade-description.ts` `isEvenExchange`
  asks `see(...) === 0`, and a bishop (330) for a knight (320) is −10.
  Every bishop-for-knight trade is silent, either way round. Same family
  as the "can be won" bug (Task 121.2, `MIN_WON_SEE_CP`).

The gate stays as it is for cards ("Found the pin" is praise, and praise
for a move that changed nothing was the spam). What is missing is a plain
description in the move's reasons, with its own budget.

### Task 126.0 — An exchange offered is not a pin

**Finding (2026-10-02):** of 211 verified pins on the dev games, 39 had a
"pinned" piece that could take its pinner: a rook facing a rook, a bishop
facing a bishop, a queen offered to a queen. Four were priced as winning
the piece (30.Qc3 in `xs9VDfEW`: a queen trade offered, "wins a queen
through a pin"). The dossier's board facts had the same flaw ("attacks the
bishop on e7, which is pinned to the queen on d8 by the bishop on f6"
after 5.Bxf6 in Lasker–Thomas: the bishop on e7 simply takes back).

**The rule (the owner's, 2026-10-02), in `tactic-pins.ts` `pins()`, so the
cards, `breaksPin`, the diagnostics and the board facts all get it:** a
front piece that attacks its pinner and is worth no more than it is an
exchange offered, unless it had something else to do
(`pinnedPieceTask`):

- `capture`: it attacks another enemy piece worth more than it (a pawn one
  step from promoting counts), one nothing defends, or one of its own
  value that is itself attacking something;
- `guard`: it is the only defender of a man of its own that is attacked;
- `block`: it stands in front of a second line as well.

A queen pinned by a bishop or a rook is untouched: taking the pinner costs
the queen.

- [x] Tests first (`tactic-pins.test.ts`, eleven positions): the classic
  4.Bg5 and a queen pinned to the king stay; rook against rook, bishop
  against bishop and queen against queen go; the Englund's 6…Bb4 stays
  (the bishop on c3 can take on b4, but it wants the queen on b2), with
  one position for each other task.
- [x] Measured on dev, every new pin shape whose front piece can take the
  pinner (65, before `verifyPin`): 55 are exchange offers, 10 stay pins
  (5 capture, 3 guard, 2 block). Two looser versions were measured and
  dropped: "a second attacker hits the front piece" kept four plain
  recaptures; "guards any attacked man" kept ten.
- [x] `test:corpus`: the Lichess pin puzzles stay at 27 of 40. The first
  version lost two rook endings (CObOW: the rook holds a pawn on its
  seventh rank; OpBrr: the rook could take a free pawn), which is where
  the promotion and the undefended-man clauses come from.
- [x] Golden: one line. Lasker–Thomas 5.Bxf6 loses ", which is pinned to
  the queen on d8 by the bishop on f6". The Englund's rows are unchanged.
- [x] Dev re-run (220 games, 64,790 sentences): 53 sentences changed, no
  check count moved (114 code-check failures before and after).
  - 51 dossier facts lose the clause ", which is pinned to the king by
    …": 27 `board:attacks`, 11 `why-better:attacks`, 13 inside a
    tempting-move row. Every one is a rook facing a rook, a queen facing
    a queen or a bishop facing a bishop.
  - 2 review cards go, with their 2 dossier copies: "They pinned a piece —
    the queen on e3 is stuck in front of the king" (a queen offered to a
    queen on c5) and "You missed a chance to pin a piece with Rc3" (a rook
    offered to a rook).
  - The re-run also showed two cards that should not have appeared: "You
    tucked the king away" on 12.Kc2 (`x2KnTpLY`) and 38.Kc3 (`lHChXcbH`).
    Cause: `PIECE_VALUES` prices the king at nothing, so a king in check
    with a piece behind it counted as "can take the pinner"; that shape
    used to give a `breaksPin` claim, which outranks `kingSafety` and gets
    no card. `canTakePinner` now leaves a king in front alone (one test);
    both moves are back to what they had. Checked on the two positions,
    not by a second re-run; the next dev run confirms it.
- **Left over:** a king in check is not a pin, and a king stepping out of
  check does not "break a pin". The shape stays in `pinShapes()` only
  because taking it out moves cards (`kingSafety` on forced king moves);
  that is its own task with its own judged sample.

**Commit:** `fix(analysis): an exchange offered is not a pin`

### Task 126.1 — A bishop for a knight is a trade

**Files:** `packages/chess-analysis/src/trade-description.ts` (+ test),
`see.ts` (`BISHOP_KNIGHT_GAP_CP`), the audit's `check-review.ts` (`trade`).

- [x] `isEvenExchange`: level is zero give or take a bishop against a
  knight (`BISHOP_KNIGHT_GAP_CP`, ten points on `see.ts`'s scale), not
  only exactly zero.
- [x] Not a pawn's worth, as first planned
  (`CONFIG.evalWitness.minThreatSeeCp`): the golden files showed that
  calls a rook given for a bishop and a pawn a trade (22…Rxh3 in Gold
  Coins), and 13.Rxd7 in the Opera game "Trades the rook for the knight".
- [x] Unlike pieces are named only when they are a bishop and a knight.
  Any other pair that comes out level did so over a longer exchange and
  the first capture is not what was traded: this also ends "Trades the
  knight for the pawn on d4" (Noah's Ark 6…Nxd4) and "Trades the rook for
  the pawn on b3" on dev, both at exactly zero before.
- [x] Tests first: 5.Bxf6 in the seed reads "Trades the bishop for the
  knight on f6"; a capture that wins or loses a pawn's worth, and
  13.Rxd7, stay silent.
- [x] The audit checks the sentence on the board (`trade`: the piece
  taken, the piece that took, and that a trade can be taken back); it had
  no check.
- [x] Golden, five lines: four new, each a bishop for a knight or the
  reverse (Gold Coins 11.Nxe6 and 15.Bxf6, Lasker–Thomas 5.Bxf6, Opera
  4…Bxf3); one gone (Noah's Ark 6…Nxd4, above).
- [x] Dev re-run: `review:reason:trade` 1,417 → 1,544 sentences (130
  new, each a bishop for a knight or the reverse; 3 gone). Four failed the
  new `trade` check, all en passant. Three were the check's fault (the
  pawn taken does not stand on the square; it now reads what was taken
  from chess.js). One was the app's: 1.fxg6# in the en passant mating
  puzzle read "Trades pawns on g6", because the exchange on an empty
  square is zero. `isEvenEnPassant` reads the exchange after the move:
  a trade only when the pawn can be taken back. One golden line goes
  (that 1.fxg6#). Own commit: `fix(review): en passant that cannot be
  taken back is not a trade`.

**Commit:** `fix(review): a bishop for a knight is a trade`

### Task 126.2 — A pin that matters is said on a quiet move

**Read:** `tactic-detectors/pin.ts`, `tactic-pins.ts`,
`verify-tactic-claims.ts` (`verifyPin`, `winsThePieceBehind`,
`pawnPinDeniesSomething`), `move-verdict/gate.ts`, `move-reasons.ts`,
`docs/tactics-rework.md` (TR-01, TR-05, TR-10: the three pins the rework
was judged on).

- [x] A reason in `buildReasons`, not a card: "Pins the knight on f6 to
  the queen" ("…to the king" for an absolute pin). Built from the pin
  detector's verified claim for the move (the pin is new with this move
  and the pinner is not lost on its square: both already in the detector
  and `verifyPin`).
- [x] **Measured 2026-10-02** on the 220 dev games (12,301 moves), every
  move run through `proposeTacticClaims` + `verifyTacticClaims`, pinned
  pawns left out:

  | Rule | Pins | Per game | Most in one game |
  |---|---|---|---|
  | every verified pin | 211 | 0.96 | 5 |
  | the pinned piece can take the pinner (a trade offer, not a pin) | 39 | 0.18 | 2 |
  | classic: a knight on c3/c6/f3/f6 pinned by a bishop to king or queen (the owner's rule) | 65 | 0.30 | 2 |
  | a knight pinned by a bishop to king or queen, any square | 75 | 0.34 | 2 |
  | "had a job" (guards an attacked man, could take something, or is pressed) | 114 | 0.52 | 4 |
  | job or knight-by-bishop | 142 | 0.65 | 5 |

  What it shows: `verifyPin` already keeps pins under one a game, so the
  old spam (pawns, phantom rays) is gone at that layer. The "job" test
  alone misses 23 of the 65 classic pins, 4.Bg5 of Lasker–Thomas and
  several 3…Bg4 among them, so the owner's rule is needed. The ten
  knight pins off the four squares are as textbook as the rest (9…Bb4
  on a d2 knight, 9.Bg5 on an e7 knight). The 39 where the pinned piece
  can take the pinner (rook against rook, bishop against bishop, a queen
  offered) are not pins anyone names.
- [x] Never said when the pinned piece attacks the pinner: Task 126.0, in
  `pins()` itself.
- [x] Step one, ships on its own (`pin-reason.ts`): a knight pinned by a
  bishop to the king or the queen, on any square. The claim is the pin
  detector's, through `verifyTacticClaims`.
  **On the dev run: 63 notes in 52 of 220 games, at most two in a game**
  (39 to the queen, 24 to the king; 74 over every move, less the book
  moves and the mistakes).
- [x] The audit checks the sentence on the board (`pin`: the piece, the
  line, new with the move, the pinner not lost where it stands), with
  chess.js's attack test and no ray walk. 63 of 63 pass. One failed the
  first version of `pin-new` and the sentence was right: 11.Bg5 in
  `CAGz80hT` steps in front of a queen on h4 that already looked through
  f6 at the queen, and the bishop's pin is the one that wins something.
  `pin-new` now asks for a piece that did not pin before; a pinner
  sliding along its own line still fails it.
- [ ] Step two, only after judges agree: the other pins (rook and queen
  pins on files, a piece pinned to a rook) when the pinned piece had
  something to do: it guards a piece or pawn of its own that the mover
  attacks, or it could take something other than the pinner without
  loss, or it is attacked at least as often as it is defended and more
  than once. 67 on dev. 30 judged, at least 27 `correct` (a judge marks
  an insignificant pin `irrelevant`); if under, tighten this test or
  leave step two out.
- [x] Budget: at most one such reason on a move; never beside a tactic
  card that already names the pin (`withoutCardedPin`, in
  `report-tactic-verdicts.ts`), never on a move that cost something
  (inaccuracy or worse: the fault is the story, and on an inaccuracy with
  nothing else to say the note is "better was …").
- [ ] The answer to a pin: when a move ends a pin on the mover's own
  piece by attacking the pinner, the kick's sentence (126.3) names it;
  `breaks-pin.ts` stays the card's business.
- [x] Tests first: fires on 4.Bg5 of the seed, on TR-01 (4.Bb5) and on a
  knight off the four classic squares; silent on TR-10 (a rook pin: step
  two), on a bishop that is simply taken, and on a pin that stood before
  the move.
- [x] Golden, six new lines, each a bishop pinning a knight to the queen
  or king: Gold Coins 14…Bb4, Lasker–Thomas 4.Bg5, Opera 9.Bg5, King's
  Indian 8.Bg5, Legal's mate 3…Bg4 in two courses.
- [ ] 30 of the 63 judged (`review:reason:pin` is in the scored sample).

**Commit:** `feat(review): a quiet move that pins something says so`

### Task 126.3 — The kick

**Read:** `tactic-detectors/gains-tempo.ts`, `board-facts/move-facts.ts`
(`attacks`).

- [x] A reason for a quiet pawn move that attacks a knight, bishop, rook
  or queen (`kick-reason.ts`): "Attacks the bishop on g5, which pins the
  knight on f6"; without a pin, "Attacks the bishop on a4". Only when no
  pawn attacked the piece before, the pawn can legally take it (a pawn
  pinned to its king attacks nothing), and the pawn is not simply won
  where it stands. A pawn that takes is a capture first and gets no kick
  note. The pin clause names a piece, never a pinned pawn.
- [x] **The sentence says what the pawn does, not what the piece must
  do.** The plan's wording ("it has to move or take") was built and
  dropped: three golden courses turn on its being false. The Fishing
  Pole's knight stays on g4 after 5.h3 (…h5), the Kieninger trap answers
  7.a3 with …Nd3#, and the bishop in Noah's Ark has nowhere to go after
  11…c4.
- [x] Budget: one such reason a move, the pin (126.2) first; not on a
  mistake or worse; not beside a tactic card for what the move itself did
  (a pawn fork already names the piece) or for what it allowed (9…b5
  "attacks the bishop on c4" in a golden course, and Nxb5 wins the pawn):
  `withoutCardedKick`.
- [x] **Measured on every move of the 219 dev games that parse (12,226
  moves): 415 kicks, 1.9 a game, none in 60 games, at most 6 in one.**
  With pawn captures counted it was 458. 29 of the 415 name a pin. This
  is five times the pin note; the per-game number after the book, fault
  and card filters comes from the dev re-run.
- [x] Tests first: 4…h6 of the seed; the Fishing Pole's 5.h3; silent when
  the piece simply takes the pawn, when a pawn already attacked it, on a
  pawn that takes, and on a pawn pinned to its king.
- [x] The audit checks the sentence on the board (`kick`: a quiet pawn
  move, the piece, a new attack, the pawn not won, the pin it names).
- [x] Golden, ten new lines and one gone: the Immortal Game 9…c6, 10.g4
  (which loses "Costs 10 squares of piece mobility": that note is only
  said when there is no other), 12.h4 and 13.h5; King's Indian 8…h6;
  Scotch 8.c4; Fishing Pole 5.h3; Kieninger 7.a3; Noah's Ark 5…b5 and
  11…c4.
- [x] Dev re-run, as first shipped: **324 notes in 138 of 220 games (1.5
  a game), at most 6 in one**; 322 of 324 pass the check. What it showed:
  - 53 inaccuracies lost "inaccuracy: better was X" to a kick note (that
    line is only said when the move has no reason). The pin and kick
    notes are now off every move that cost something (inaccuracy and
    worse), not only mistakes: the fault is the story.
  - The two that failed `pawn-safe` were right to fail: 10.c3 in the
    owner's game "attacks the bishop on d4", and Bxc3+ Nxc3 Qxc3+ wins the
    pawn. The exchange comes out at 90 on `see.ts`'s scale (a bishop for
    a knight and a pawn), under the one-pawn bar. The gate is now "wins
    more than a bishop against a knight" (`BISHOP_KNIGHT_GAP_CP`).
- [x] As it stands after those two changes: **257 kick notes in 128 of
  220 dev games (1.2 a game, at most 6)** and **49 pin notes in 43 games
  (at most 2)**.
- [ ] 30 judged. If judges mark the plain kicks `irrelevant`, keep only
  the ones that name a pin (29).

**Commit:** `feat(review): a pawn that attacks a piece says so`

### Task 126.4 — What a trade gives up

**Finding:** the owner's reading of 5.Bxf6: not a mistake by the engine (−1.14
before with Be3 first and Bxf6 the second line at −1.18; −1.08 after), but
a poor trade for a plain reason: the bishop was White's only developed piece, and
Black recaptures with the queen, which develops it.

- [x] The trade reason gains a clause when it is true on the board
  (`trade-description.ts` `tradeCost`): "…, giving up White's only
  developed piece" (a knight or bishop that was the mover's one minor
  piece off its first square, with at least three minor pieces still on
  the board), and then, when the engine's reply takes back with a queen
  or a minor piece leaving its first rank, "; Black can take back with
  the queen, bringing it out" / "…with the knight, developing it". Board
  facts and the stored reply; no eval claim.
- [x] **Measured, and narrowed.** With the recapture clause said on its
  own, 89 trades on dev carried a clause (0.41 a game), "White can take
  back with the bishop, developing it" at move 27 among them. Said only
  with "the only developed piece" it is 21 (0.10 a game, at most 2), all
  in the opening: 9 with the queen, 1 with a minor piece.
- [x] The dossier gets the same sentence: its REVIEW NOTES rows are the
  review's reasons (golden: Opera 4…Bxf3 now reads "…, giving up Black's
  only developed piece; White can take back with the queen, bringing it
  out"). No second function.
- [x] Tests first on 5.Bxf6 of the seed, the Scotch's 4…Nxd4, a pawn
  taking back, a knight taking back from b1; silent in an endgame and
  when the mover has other pieces out.
- [x] The audit's `trade` check covers both clauses (`only-developed`,
  `takes-back-from-home`).

**Commit:** `feat(review): a trade says what it gives up`

### Task 126.6 — A missed capture wins material in the engine's own line

**Finding:** cluster 1 of the first baseline (`review:reason:missed-capture`,
51 of 516 dev sentences fail `material-in-line`, 8 of 17 judged wrong).
`missedCaptureReason` asked only `see > 0` on the capture's square. Two
causes: a knight for a bishop is +10 on `see.ts`'s scale ("Missed Nxg4,
winning material on g4" for …Nxg4 Qxg4), and the exchange on one square
says nothing of what the opponent takes elsewhere (13…Nxd7 in the Opera
game takes a rook and Bxe7 takes the queen).

**Files:** `move-reasons.ts`, `board-facts/material.ts` (`quietLineGain`),
tests beside each.

- [x] The capture has to win a pawn's worth on its square
  (`CONFIG.evalWitness.minThreatSeeCp`), and the mover has to be ahead
  where the engine's own line first goes quiet (`quietLineGain`: the next
  move takes nothing and its mover is not in check). An eval stored
  without its line keeps the square test alone.
- [x] Tests first: a loose knight is still named; a knight for a bishop
  and the Opera line are not; a pawn given back many moves later does not
  undo a won piece.
- [x] Golden, seven lines, each a "Missed X, winning material" that the
  line gives back: Gold Coins 9…Be6 (Bxc5 Bxf6 Qxf6 Qxd5: level) and
  12…Qd6 (Nxg4 Qxg4: a knight for a bishop), Opera 13…Rxd7, Legal's mate
  5…Bxd1 in two courses (dxe5 Qxg4: a knight for a bishop), Englund
  8.Qxc3 (Nxc3 Qxa1+: a rook goes), Siberian 10.Nxd4 (hxg4 Nxe2+: the
  queen goes).
- [x] Dev re-run: `missed-capture` 516 → 451 sentences, `material-in-line`
  failures 51 → 0. Dev code-check failures over every sentence 114 → 64
  (63 after the en passant fix). 23 of the moves that lost the note now
  read "mistake: better was X" instead, which is what they had to say.

**Commit:** `fix(review): a missed capture has to win material in the engine's line`

### Task 126.7 — Two notes the judges marked wrong (2026-10-02 round)

**Findings:** the day's judge round (442 labels). `review:reason:mobility`
was wrong 6 of 6 times; "Missed a forced mate" was marked misleading on a
move that still mates.

- [x] **"Costs N squares of piece mobility" counted two different
  sides.** `featureDelta.mobilityDelta` is the opponent's legal moves
  after the move less the mover's before it: "Costs 22 squares" was 51
  Black moves against 29 White ones while Black's own went from 51 to 47.
  The note now counts the mover's own legal moves before and after
  (`moverMobilityDelta`, the turn passed back with `flipActiveColorFen`;
  nothing on a move that gives check). Golden: 15 such lines go (the
  Opera game's "Costs 43 squares" on 15.Bxd7+ among them) and 2 appear
  (Petrov 4…Nf6, 8 squares, in two courses).
- [x] **A slower mate is not a missed one.** "Missed a forced mate
  starting with Qd6+" on Rd1+, which mates a move later, hides that the
  win was kept; Lasker–Thomas 14.h4+ read "Missed a forced mate starting
  with f4+; You forced mate." `missedMateReason` is silent when the
  engine's line after the move is still a mate for the mover. Golden: 7
  lines go (Lasker–Thomas 14.h4+ and 16.Be2+ in two courses, the rook
  ladder's 1.Ra7 in two, Game of the Century 37…Bb4+). The commit
  message says 13 and 6; 15 and 7 are the counts.
- **Left over:** `mobilityDelta` itself is still the two-sided number. It
  feeds `quietMoveMobilityDeltas` in the game report and the candidate
  and PV step fields; fixing it there changes stored stats and is its own
  task.

**Commit:** `fix(review): the mobility note counts the mover's own moves; a slower mate is not missed`

### Task 126.5 — A seed says what the owner expected to read

**Files:** `apps/api/scripts/review-audit/seeds.json`, `seed.ts`,
`checks.ts`, `oracle.test.ts`.

- [x] A seed may carry `expect: [{ ply, says }]`: some sentence of the
  review's move at that ply has to contain `says`. An unmet expectation
  becomes an item of source `review:expected` ("nothing on this move says
  …") that fails `expected-point` until the review says it, so a missing
  sentence is counted by code, the way a wrong one is (`items.ts`
  `unmetExpectations`, one test).
- [x] `seed:d9716668`: "Pins the knight on f6" at ply 7, "Attacks the
  bishop on g5" at ply 8, "Trades the bishop for the knight" and "only
  developed piece" at ply 9. All four are met: the three moves read
  "Pins the knight on f6 to the queen", "Attacks the bishop on g5, which
  pins the knight on f6" and "Trades the bishop for the knight on f6,
  giving up White's only developed piece; Black can take back with the
  queen, bringing it out".
- [x] The first seed gets no expectation. "only move" on 25.Qxc7 (ply
  49) was added and taken out again the same day: the seed replays its
  stored evals, and in those Bb4 is best (+39.9) with Qxc7 second
  (+36.7), so no "only move" sentence is owed on that board (finding
  F4). Task 121.3 tests its reason on a position searched fresh.

**Commit:** `feat(audit): a seed's expected sentences are checked`

## Left open from Phases 110–119

The old plan had 51 unticked boxes. Checked against `main` on 2026-10-01
(`git grep` on `main`, `gh` for alerts and runs): every code task is
merged; the boxes were simply not ticked.

| Phase | PR | Checked on `main` |
|---|---|---|
| 110–113 courses merge | #41 (`c4111d8`) | merged; CodeQL: 0 open alerts (`gh api …/code-scanning/alerts?state=open`), so 113.1's "waiting for the re-run" is closed |
| 114 board facts as data | #43 | `board-facts/types.ts`, `loose-pieces.ts`, `forks.ts` |
| 115 review from the facts | #44 | `move-reasons.ts`, `move-reason-better.ts`, `tactic-claim-fit.ts` |
| 116 coach gets the facts | #45 | `toolCallStats` (`session-messages.ts:70`) and `scripts/coach-tool-stats.ts`; `inspect-moves.ts` on the board facts; `currentMoveFacts` and "What the move did" / "Best instead"; `focusFacts`; rule 6 in `coach-method.ts` |
| 117 stats count real loose pieces | #46, #47 | detectors read `looseSquares`; `onlyMoves` in the report and stats; `hangingPieces` / `underDefendedPieces` / `newHangingPieces` appear nowhere in `packages` or `apps` |
| 118 courses know their weakness | #48 | `CourseDocument.diagnosisCodes`; `useCoursesForCode` on `FocusAreaCard` |
| 119 test tiers | #49 | CI's wip-test guard and the `test:corpus` + `test:golden` step (`ci.yml`; manual full runs only since the nightly run was turned off); api `unit` and `db` projects |

Still open, all the owner's:

- [ ] **116.1:** run `npx tsx apps/api/scripts/coach-tool-stats.ts --since
  2026-09-01` on the real database and keep the output: the "before" number
  of coach tool calls per episode.
- [ ] **116.5:** a week after Phase 116 is deployed, run it again and
  compare. If calls per episode did not drop, note which tools remain
  common; the next step would be tempting moves at the coaching plan's
  prepared moments.
- [ ] **114.3 / 118.1:** after deploying, run `npx tsx
  apps/api/scripts/course-dossier-refresh.ts` once per database that holds
  courses (dossiers store facts as data; documents get `diagnosisCodes`).
- [ ] **119.2:** the nightly CI run was turned off on 2026-10-01 to save
  Actions minutes (`ci.yml`), before it ever ran with the corpus and golden
  tiers. They now run only on a manual CI run with `full` ticked (about 2.5
  minutes more than the old 3m50s), or locally. Turn the cron back on when
  minutes allow.

Never started; the owner picks (was "Lane O"):

- recording on iPhone Safari and desktop Chrome, results written into
  `docs/courses.md` §8;
- the owner's model run over the golden set;
- a reel candidate for opening courses without a trap, mate or brilliant move;
- a puzzle's tempting threats that still win: no "?";
- a hook that hooks instead of restating facts;
- the Commander's repeated phrase;
- the promise and takeaways checked against the board by the verifier.

Ideas not planned yet:

- More stats from the board facts (tempting moves resisted, endgame
  technique): deferred in 117.3.
- A light version of the course verifier as a guard after each coach turn:
  flag hanging, fork or pin wording that no fact supports, and moves that no
  fact or tool result names.
- Tempting moves in the review and at the coach's prepared moments (engine
  cost; see 115.5 and 116.5).
- Course drills counting as practice for a diagnosis code (after 118).
