# FreeChessCoach — Review text you can trust: the review audit (Phases 120–124)

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
    `--stream N` rows of the full puzzle DB), bucketed by the players'
    average rating into five bands; the 66 golden courses
    (`apps/api/test/fixtures/courses/`); the owner's seeds (`seeds.json`).
    Each game is hashed into `dev` (80%) or `holdout` (20%) by id.
  - `run` (`run.ts`, `analyze.ts`): each game through the worker's own path
    (`engine.analyzeGame(fens)` with no options, then `runAnalysisSteps`)
    and through `buildCourseDossierFromEngine` as a one-line `master_game`
    course. Engine answers are cached in the workspace
    (`GoldenEngineCache`), so a re-run after a code change needs no engine.
    A game with an `evalsFile` is replayed from those evals
    (`stored-engine.ts`).
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
    engine's own line for the named move delivers what a card promises);
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

- [ ] `corpus --per-band 40 --stream 150000` (about 200 Lichess games, plus
  the golden courses and the seed). If a band stays short, raise `--stream`.
- [ ] `run --jobs 2` (the first run searches: expect minutes per game on the
  dev engine's pool of 2), then `report --log`.
- [ ] Read the code-check failures table. For the five sources with the
  most failures, open 5 each with `failures --source <s> --limit 5` and the
  probe: is the check right? A check that misfires is fixed now, with its
  position added to `oracle.test.ts`, before any number is trusted.
- [ ] Write the baseline under this task: sentences per surface, the share
  failing a check, the top five sources.

**Commit:** `chore(audit): first run; checks corrected against the corpus`

### Task 120.2 — The first judging round and the owner's calibration

**Depends on:** 120.1. **Read:** `judge-instructions.md`, the skill §4.

- [ ] Batches until dev has at least 300 judged sentences per surface, then
  the same for holdout (12 positions per batch, 4–6 `review-judge` agents
  at a time).
- [ ] Calibration: 20 random labels shown to the owner (`show`), their
  verdicts compared. More than 2 disagreements: rewrite the unclear part of
  `judge-instructions.md` and re-judge that tag.
- [ ] Every `audit-bug:` note from a judge becomes a check fix with a test.
- [ ] `report --log`: this is the first real accuracy number. Write it here.

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

- [ ] Test (in `tactic-reason-text` or `defused-threat` tests): for the
  seed's plies 23, 29 and 49 with the stored evals, every piece the
  prevention sentence names stands on its square before the move, after it,
  or after the one threat move the sentence names.
- [ ] Carry the threat's move on the card (`threatSan`), and write the
  sentence around it: "You stopped …Rd5, which would fork the bishop on c5
  and the knight on e5." When the threat move is not the opponent's legal
  next move in the position before this move, print no detail.
- [ ] The threat must be real: drop the card when the engine's line after
  the threat move (from the prevention scan) does not win what the card
  says. 12.Bxc5 (…Rd1+ Rxd1) must produce no card.
- [ ] `test:corpus` (the card gate sits after the measured classification;
  confirm no ceiling or floor moved), `test:golden` (the dossier does not
  print prevention sentences: expect no diff).

**Commit:** `fix(review): a stopped threat names its move, and only when it was real`

### Task 121.2 — "Can be won" only when the exchange wins

**Findings:** F2. **Read:** `board-facts/loose-pieces.ts`, `see.ts`,
`move-reasons.ts` (`looseReasons`), `null-move-fen.ts`.

- [ ] Reproduce first: a wip test calling `loosePieces` on the seed's
  position after 13…Bd3 (`r2r2k1/p1p2ppp/2n5/1pB1N3/8/2Pb1N2/PP3PPP/R4RK1 w - - 1 14`).
  Find which step says the bishop is winnable, and write the cause here.
- [ ] Fix it at that step; keep one regression test on the smallest
  position (a bishop attacked once by a knight, defended once by a rook).
- [ ] `test:golden`: the dossier's `leavesHanging` uses the same list, so
  lines may drop; explain each. Stats (`diagnostics/`, Phase 117) read
  `loosePieces` too: say in the PR that counts can fall.

**Commit:** `fix(analysis): a piece defended through an even trade is not loose`

### Task 121.3 — The only move is said

**Findings:** F3. **Read:** `board-facts/only-move.ts`, `move-reasons.ts`,
`board-facts/material.ts` (`settledLine`, `lineBalance`),
`move-verdict/` (how one card is chosen).

- [ ] A review reason for a played only move: "The only move: anything else
  loses the queen" (what the second line loses, from its settled line's
  material), for best and great moves of either side.
- [ ] When that reason fires, a card that explains less of the eval gap
  ("won a pawn through an eventual fork") is not shown beside it.
- [ ] Tests: fires on the seed's ply 49 with fresh evals; never on a move
  with a second line within `CONFIG.courses.onlyMoveGap`.

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

- [ ] `corpus --users <n>`: games of random players per band through
  `lichess.org/api/games/user/<name>` (names from the puzzle games'
  headers), not tied to a puzzle. Half of each band from here.

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
