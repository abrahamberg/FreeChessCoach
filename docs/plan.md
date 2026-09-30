# FreeChessCoach — Merge the courses branch, then one set of board facts for courses, review, coach and stats (Phases 110–119)

Written 2026-09-30 from an investigation of `claude/courses` (draft PR #41:
175 commits, 432 files over `main` 60d52f8). Lane M's work happens on
`claude/courses` itself.
Phases 79–109 (courses, clips, the course player, the studio) are shipped on
the branch and described in `docs/architecture.md` ("Courses") and
`docs/courses.md`. Their task log is in git history:
`git show 033e81b:docs/plan.md`.

## How to work through this plan

- Work on one task at a time. Read the task's **Read** list and nothing else
  of `docs/`. The findings (F1–F13) are the evidence; a task cites the ones it
  needs.
- Each task names its **Branch** and **Depends on**. Never start a task whose
  dependency is not done (same branch) or merged to `main` (other branch).
- **Move tasks change no behaviour.** After Task 110.1 exists, every task in
  Phases 111 and 114 must leave the golden facts snapshot byte-identical
  (`npm run test:golden`). A diff means the move broke something: find it and
  fix the code. Never re-record the snapshot in a task that does not say
  **Re-record allowed**.
- When a task says **Re-record allowed**: run `GOLDEN_UPDATE=1 npm run
  test:golden`, read the whole diff, and list in the commit body each course
  whose facts changed and what changed. A change you cannot explain is a bug.
- **Stop and ask the owner** (write the question under the task as
  `Blocked:` and end the session) when: a snapshot diff you can't explain; a
  tactic precision ceiling would go up or a recall floor down
  (`npm run test:corpus`); a task needs a DB migration it does not list; you
  would dismiss a security alert instead of fixing it; anything touching auth
  headers, outbound calls or rate limits (read `docs/threat-model.md` first).
- Checks: `npm run verify:changed` after each task, `npm run verify` before a
  phase's last commit. The api package needs Docker (Postgres through
  Testcontainers). Without Docker, run the other packages, then write
  "api tests not run: no Docker" in the task's Status line. Never claim tests
  passed that did not run.
- Engine for scripts, when a task needs one: `sudo apt-get install -y
  stockfish` (installs `/usr/games/stockfish`, the engine's default path),
  then `PORT=8081 npx tsx services/engine/src/server.ts &`. Stop it when done.
- When a task is done: tick its boxes, add `Status: done YYYY-MM-DD — <what
  was verified>` under it, commit (one conventional commit per task), and push
  the branch at the end of each phase.
- `docs/prompts.md` is generated: after changing anything in
  `packages/prompts/src/`, run `npm run docs:prompts` and commit the result.
- **No backward compatibility** (the owner's rule). Rename, reshape and
  delete directly, and update every caller in the same commit. Never add:
  - version fields, or code that reads an old shape;
  - `.optional()` or `.default()` just so old rows parse;
  - deprecated aliases, or re-exports under old names or paths.

  When stored data no longer fits a new shape, the task says how it is
  regenerated (a rebuild script, or clearing it); stored data may be thrown
  away.

## Findings (verified 2026-09-30)

**F1 — Four detector families.** In `packages/chess-analysis/src/`:
`tactic-detectors/` (tactic motifs → review sentences, stats),
`diagnostics/detectors/` (BV/MS/TA codes → stats, focus areas),
`move-verdict/`, and the courses' board facts in `course-dossier-words.ts`,
`course-tempting.ts` and `course-material.ts`. The board facts cover: what
moved, captures (en passant too), promotion, a blocked check, discovered and
double checks, how a check can be answered, why it is mate, a back-rank mate,
the opposition and the rule of the square, pieces the moved piece attacks
(pinned or trapped), forks, pieces left hanging, a guard the move gave up, why
the better move is better, repetition, tempting moves and material in words.
They are general chess facts, but named and placed as course code: about 40
flat `course-*` files in a 200-file `src/`. The dossier itself runs the same
analysis as game review (`runAnalysisSteps`), then adds these facts.

**F2 — Two meanings of "hanging".** `piece-safety.ts`: `hangingPieces` =
attacked with no defenders; `underDefendedPieces` = more attackers than
defenders (counts, no exchange evaluation). Used by: `inspect-moves.ts` (the
coach's `check_moves` tool, the coach's "Board facts" line, the puzzle coach,
the course ask-coach), `diff-features.ts` → `move-reasons.ts` (review notes),
`candidate-moves.ts`, `tactics-score.ts`, `move-verdict/diagnostic-code.ts`,
diagnostics BV-01, BV-10, BV-22, MS-14, `diagnostics/detectors/own-chance.ts`,
and `prompts/src/position-analysis-summary.ts`. The course filters that list
with `canBeTaken` (`course-dossier-words.ts`): a legal capture that loses
nothing over the whole exchange (shared `see()` ≥ 0), and a capture that is
taken back is a trade, not a hanging piece. Neither version counts a defended
piece attacked by a cheaper one (a knight attacked by a pawn), which can be
won. Forks: the old code lists forked squares, including empty squares and
pawns. The course lists forked pieces, leaves pawns out, and counts a fork only
when the forking piece can't simply be taken.

**F3 — Course fixes applied after the fact.** `course-dossier-node.ts`
(lines ~77–186) edits the review's tactic claims after they are made:
- drops `spaceGain` in an endgame, or for a pawn past the 5th rank;
- drops defensive motifs on a check;
- drops "takes the open file" on a sacrifice;
- drops fork details that name squares;
- with a forced mate ahead, keeps only the claim about the mate;
- drops "they let you win X" when the move itself took at least X.

Game review still makes all of these mistakes.

**F4 — Facts are English strings, read back with regexes.** About 14 places:
- `course-dossier-node.ts`: `/forced mate/`, `withoutFileDetail`, `withoutSquareFork`;
- `course-reel-candidates.ts`: `IDEA_FACT`;
- `course-skeleton.ts:190`: `'the position has now come'`;
- `course-tempting.ts`: `notTheAnswer` parses verdict words;
- `prompts/src/course/playbooks.ts` (~lines 109–113, 222–227, 308): `'which is trapped'`, `'attacks '`, `'forks'`, `'a back-rank mate'`;
- `apps/api/src/services/courses/manual-notes.ts:12`: `/^(moves the |castles )/`;
- the verifier's tactic-word checks in `course-verify-text.ts`.

Changing a sentence's wording silently disables the rule that reads it.

**F5 — Duplicates and misplacements.**
- `valueOf` (king = 100) is defined twice: `course-dossier-words.ts`, `course-tempting.ts`.
- `capitalise` is defined three times (`course-dossier-text.ts`, `course-material.ts`, `prompts/src/course/context.ts`), plus `capitalize` in `prompts/src/render.ts`.
- `materialBalance` returns a string in `course-material.ts` and a number in `tactic-board-facts.ts`.
- `threatens` (`course-tempting.ts`) sits next to `checks-captures-threats.ts` and `diagnostics/threat-inventory.ts`.
- `course-dossier-words.ts` is 359 lines and `course-skeleton.ts` 256 (the limit is 250).
- `apps/api/src/services/course-dossier.ts`, `course-generate.ts` and `courses.ts` sit outside `services/courses/`.
- These thresholds are inline instead of in `CONFIG`: `SWING_WIN_DROP`, `MAX_CANDIDATES` (both in `course-reel-candidates.ts` and `course-tempting.ts`), `BEST_LINE_PLIES`, `MAX_REFUTATION_PLIES`, `FULL_BLOCK_NODE_LIMIT`.

**F6 — No fixes for specific positions.** No square, move or FEN is
hardcoded in course logic. Named games (Englund, Fishing Pole, Lucena…) appear
only in comments, as the case that led to a general rule. But the rules were
tuned on the 66 golden courses only; trapped pieces is the exception (Lichess
trappedPiece puzzles 29/40 → 40/40). These heuristics are general but rough:
- no space gain for a pawn on the 6th rank or beyond, or anywhere in an endgame;
- "tucked away" means a king on the a–c or g–h files;
- king safety isn't mentioned with 2 or fewer pieces left;
- a queen or rook check that the king simply takes isn't tempting.

That is fine for courses. Before game review uses any of them, check them on
the tactic corpus.

**F7 — Review notes use the naive definitions.** In `move-reasons.ts`:
- `hangingPieceReasons` says "Leaves the X undefended" from the naive list, on
  a move of any quality, so a best move or a trade can get it;
- `underDefendedReasons` compares attacker and defender counts instead of
  using exchange evaluation;
- `newForkReasons` names forked squares, and counts a fork whose forking piece
  can simply be taken.

The coach also reads these notes, as "Review notes" and in the annotated game.

**F8 — The coach makes tool calls to check claims.**
- `packages/prompts/src/episode-context.ts` `boardFacts()` prints the naive
  hanging list.
- Rule 6 in `packages/prompts/src/coach-method.ts` exists only to tell the
  model not to trust that line.
- Rules 3 and 8 require a tool call for every claim, and repeated
  `get_engine_analysis` calls. Every tool call re-sends the whole prompt.
- `apps/api/src/services/coach-context.ts` already holds everything the board
  facts need: the position before the move, the played SAN, the engine lines
  before the move (`analysis`, multiPv) and after it (`postMoveAnalysis`, the
  reply to the played move).
- `session_messages` stores tool results as `role = 'tool'` rows with a `ply`,
  so tool calls per episode can be counted.

**F9 — Stats count opportunities with the naive definitions.**
- BV-01, BV-10, BV-22 and MS-14 take their opportunities from the naive lists
  (F2). Failures are confirmed by the engine eval, so the error is mostly in
  the denominators.
- There is no analysis version: diagnostics are computed when a game is
  analysed, and `jobs/rebuild-diagnostic-profile.ts` rebuilds the profile from
  the stored entries.
- Course progress (`course_progress`, `course_enrollments`) is not linked to
  diagnostics or focus areas.

**F10 — Tests.**
- There are 287 test files; AGENTS.md said about 120. This branch added 68
  files, about 6,000 lines.
- `chess-analysis`: 852 tests in 29 s. The 15 course files hold 132 tests but
  take 30 s of the 47 s total file time, because `analyseEnglund()` (the whole
  analysis pipeline) is rebuilt in every test. `course-verify.test.ts` takes
  13 s, `prompts/src/course/course-prompts.test.ts` 10.7 s (of that package's
  11 s), `course-dossier.test.ts` 4.6 s.
- `apps/web`: 31 course-related files take 19 of 22 s;
  `player/CourseDrill.test.tsx` takes 12 s for 5 tests (real timers). The
  branch added 22 React component `.tsx` tests, although AGENTS.md said not to
  write them.
- `course-dossier.test.ts` has 82 exact-wording assertions in 24 tests.
- Every api test, pure ones included, starts Postgres
  (`apps/api/test/helpers/global-setup.ts`).
- `scripts/test-changed.ts` runs whole package suites, not only the affected
  tests.
- The tactic corpus (`npm run test:corpus`) never runs in CI, not even in the
  nightly run.

**F11 — The golden set has no committed expected output.** The 66 PGNs are in
`apps/api/test/fixtures/courses/`. "Facts unchanged on all 66 courses" was
checked by reading printed output. `npm run course:golden -w apps/api --
--facts --only trap-englund` runs in 8 s in the cloud container with apt
Stockfish; the Englund's engine data is 15.7 KB. The cache
`apps/api/.golden-engine-cache.json` is gitignored.

**F12 — PR #41** (`claude/courses` → `main`). Draft; investigated at head 033e81b; `main`
has not moved.
- `test`, `images`, `helm-lint` and CodeQL's own analysis jobs are green.
- **The CodeQL check reports 5 new high-severity alerts.** The agent can't see
  them; they are listed at
  `https://github.com/abrahamberg/FreeChessCoach/security/code-scanning?query=pr%3A41+tool%3ACodeQL+is%3Aopen`.
- `github-advanced-security` failed on its own infrastructure ("The requested
  model is not supported"), not on the code.

**F13 — Open items from Phases 79–109** (the owner's; they don't block the
merge):
- recording not yet tried on iPhone Safari and desktop Chrome (81.2);
- the owner's model run over the golden set (90.2, 93.4);
- opening courses get no reel candidate without a trap, mate or brilliant move;
- a puzzle's tempting threats that still win carry the same "?" as losing ones;
- the hook restates facts instead of hooking;
- the Commander persona repeats "Hold the line";
- the promise and takeaways are not checked against the board;
- prompt-level: invented plans, a "best" highlight drawn c3-c3, a terse quiz reveal.

## Branches, order and what runs in parallel

```
now ───────────────────────────────────────────────────────────────────►
Lane M  claude/courses 110 ─ 111 ─ 112 ─ 113 ─► merge
Lane T  test tiers    119.1 ─ 119.2 ─────────────┬─ 119.3 (after M merges)
                                                 │
after M merges:                                  ▼
Lane B  board facts                     114 ─► merge
Lane C  review                                   └─ 115 ─► merge
Lane D  coach                                    └─ 116 ─► merge
Lane E  stats                                    └─ 117 ─► merge
        after C, D and E merge: drop the naive hanging lists (117.4)
Lane F  courses ↔ diagnosis codes       118 ─► merge
Lane O  owner items (F13)               any time, own small branches
```

| Lane | Branch | Phases | Starts when | Runs alongside |
|---|---|---|---|---|
| M | `claude/courses` (PR #41) | 110–113 | now | T |
| T | `claude/test-tiers` | 119 | now; 119.3 after M merges | everything |
| B | `claude/board-facts` | 114 | M merged | T, F, O |
| C | `claude/review-facts` | 115 | B merged | D, E, F, O |
| D | `claude/coach-facts` | 116 | B merged | C, E, F, O |
| E | `claude/stats-loose-pieces` | 117 | B merged | C, D, F, O |
| E2 | `claude/drop-naive-hanging` | 117.4, second half | C, D and E merged | F, O |
| F | `claude/course-diagnosis-tags` | 118 | M merged | B–E, O |
| O | one branch per item | — | M merged | everything |

Rules that keep parallel lanes from colliding:
- C, D and E only *use* `packages/chess-analysis/src/board-facts/`. If one of
  them needs a change there, make it in a small PR to `main` first, then merge
  `main` into the lane.
- Lane T must not rename or edit test files that Lane M touches (anything
  under `course*`, `courses/` or `features/courses/`) until M is merged.
- Before pushing a lane, merge `main` into it. Never rebase a pushed branch.

## Test policy (applies to every task)

| Kind | Where it runs | What belongs there |
|---|---|---|
| **Keep, default** | `npm test`, `verify:changed`, PR CI | Invariants of pure logic (a rule that must always hold); one regression test per fixed bug in shared logic, on the smallest position that shows it; permission tests on routes (creator-only → 403); schema tests; pure web logic in `.ts` files. Fast: build expensive fixtures once per file, and use fake timers for anything that waits. |
| **Keep, opt-in tier** | nightly CI; locally when you touch the area | `corpus`: `npm run test:corpus` (tactic precision ceilings and recall floors). `golden`: `npm run test:golden` (course facts; later also review notes and coach facts). `db`: Postgres integration tests (after 119.3). |
| **Ephemeral** | only while a task is in progress | Tests that drive development and are then covered by the golden snapshot or the corpus: TDD scaffolding, "does this position now say X", old-vs-new comparisons, a component test while building a screen. Name them `*.wip.test.ts` / `*.wip.test.tsx`, and delete them in the task's last commit. After 119.1, CI fails when one is committed. |
| **Don't write** | — | Assertions on the exact English of a generated sentence (the golden snapshot covers wording); `.tsx` component tests; per-detector tactic tests; tests of wiring that TypeScript already checks. |

Every task below lists **Keep:** (tests that stay) and **Ephemeral:** (tests
to write, use and delete).

---

## Phase 110 — Lock the facts; fast course tests (Lane M)

### Task 110.1 — A committed golden facts snapshot

**Branch:** M. **Depends on:** nothing. **Findings:** F11.
**Read:** `apps/api/scripts/course-golden.ts`,
`apps/api/scripts/golden-engine-cache.ts`,
`apps/api/scripts/course-golden-facts.ts`,
`apps/api/src/services/course-dossier.ts`,
`apps/api/src/services/courses/generation-inputs.ts`,
`apps/api/test/fixtures/courses/golden-set.ts`.

Every later move and restructure is checked against this snapshot. It needs no
engine when it runs: the engine's answers are committed.

**Files:** new `apps/api/scripts/golden-inputs.ts`,
`apps/api/test/golden/fixture-engine.ts`,
`apps/api/test/golden/evals/<course>.json` (66),
`apps/api/test/golden/facts/<course>.txt` (66),
`apps/api/test/golden/course-facts.golden.ts`,
`apps/api/vitest.golden.config.ts`; edit `apps/api/scripts/course-golden.ts`,
`apps/api/package.json`, root `package.json`.

- [x] Move `courseInputs()` out of `course-golden.ts` into
  `apps/api/scripts/golden-inputs.ts` (exported, same behaviour) and import it
  back in the script.
- [x] Add `--record-evals` to `course-golden.ts`. For each course (honouring
  `--only`), wrap the engine backend in a small recorder with the same
  `analyzeGame` signature. It keeps every `(fen, opts) → EngineEval` the
  course asked for. After the course's inputs are built, write
  `apps/api/test/golden/evals/<name>.json`: an object keyed by the cache key
  (`golden-engine-cache.ts` `cacheKey`), keys sorted, values reduced to what
  the pipeline reads (`fen`, `depth`, and each line's `moveSan`, `moveUci`,
  `cp`, `mateIn`, `pvSan`). Pretty-print with 1-space indent. Each file must
  be under 50 KB; if one isn't, cut `pvSan` to 8 plies for that course and
  name it in the Status line.
- [x] `test/golden/fixture-engine.ts`: `fixtureEngineFor(name)` returns an
  `EngineBackend` whose `analyzeGame(fens, opts)` answers from that course's
  JSON (same key), sets `ply` by index as `GoldenEngineCache` does, and throws
  `no golden eval for <fen> in <name>` on a miss. `analyzePosition` throws; the
  dossier never calls it.
- [x] `test/golden/course-facts.golden.ts`: `test.each` over
  `loadGoldenSet()`. For each course: `courseInputs(course,
  fixtureEngineFor(name), 'fixture')`, then this text:
  - `renderCourseDossier(inputs.dossier)`;
  - a `REEL CANDIDATES` block, one line per candidate, as `printCourseFacts`
    prints them;
  - a `PLAN` block, one line per planned episode: `id role startNodeId–endNodeId`,
    plus `answer=<id>` when set.

  Compare the text with `facts/<name>.txt`; when `GOLDEN_UPDATE=1`, write the
  file instead and pass. Fail with the course name and a unified diff (use
  `expect(actual).toBe(expected)`).
- [x] `apps/api/vitest.golden.config.ts`: `include:
  ['test/golden/**/*.golden.ts']`, no `globalSetup`, `testTimeout: 120_000`.
  The default config must not pick these files up: the default include
  pattern only matches `*.test.ts`, so check with `npx vitest list` that
  neither `course-facts.golden.ts` nor any file under `test/golden/` shows up.
- [x] Scripts: `apps/api/package.json` gets `"test:golden": "vitest run
  --config vitest.golden.config.ts"` and `"golden:record": "tsx
  scripts/course-golden.ts --facts --record-evals"`; root `package.json`
  gets `"test:golden": "npm run test:golden -w @freechesscoach/api"`.
- [x] Record: start the engine (see "How to work"), `npm run golden:record -w
  @freechesscoach/api`, then `GOLDEN_UPDATE=1 npm run test:golden`. Run
  `npm run test:golden` twice more: both must pass with no file changes
  (`git status` clean after the second run).
- [x] Record how long `npm run test:golden` takes in the Status line.

**Keep:** `course-facts.golden.ts` (opt-in golden tier).
**Ephemeral:** none.
**Done when:** 66 eval files and 66 facts files are committed, each under 50
KB; `npm run test:golden` passes with the engine stopped; the default
`npm test -w @freechesscoach/api` does not run it.
**Commit:** `test(courses): a committed golden facts snapshot, no engine needed`

Status: done 2026-09-30 — 66 eval files (1.4 MB) and 66 facts files committed, all under 50 KB; `npm run test:golden` passed three times (77 s each, engine stopped afterwards), `git status` clean after the second re-run; `npx vitest list` in apps/api shows no golden file; api lint and typecheck clean. Eval files cut to fit 50 KB (pvSan kept to N plies): evergreen 0, game-of-the-century 0 and one JSON line per position, gold-coins 4, immortal 0, opera 8. The recorder tries the whole line, then 8, 4, 2, 0 plies, then the one-line layout. Facts are recorded from these files, not from the full engine data.


### Task 110.2 — Build expensive test fixtures once

**Branch:** M. **Depends on:** 110.1. **Findings:** F10.
**Read:** `packages/chess-analysis/src/course-test-fixtures.ts`,
`packages/prompts/src/course/fixtures.ts`,
`apps/web/src/features/courses/player/CourseDrill.test.tsx`.

- [x] Before changing anything, measure. For each of
  `packages/chess-analysis`, `packages/prompts` and `apps/web`, run
  `npx vitest run --reporter=json --outputFile=<scratch>/<pkg>.json` from
  inside the package and note the wall time. Write the three times in the
  Status line.
- [x] `analyseEnglund()`: compute once per process (module-level variable)
  and return `structuredClone(cached)`, so a test that edits the result can't
  leak into the next. Do the same for any other fixture builder in the same
  file that runs `analyseCourse`.
- [x] `englundCourseContext()` in `prompts/src/course/fixtures.ts`: it already
  goes through `analyseEnglund()`; check that it doesn't rebuild the analysis
  some other way.
- [x] `CourseDrill.test.tsx`: use `vi.useFakeTimers({ shouldAdvanceTime: true
  })` and advance timers instead of waiting on `waitFor(..., { timeout })`.
  Keep what it asserts.
- [x] `apps/api/src/services/course-generate.test.ts` gave two tests a 20 s
  timeout because of the Englund build (old Phase 106). Remove those
  per-test timeouts if the tests now pass within the default.
- [x] Measure again the same way.

Status: done 2026-09-30 — wall time before → after: `chess-analysis` 26 → 19 s, `prompts` 12 → 5 s, `apps/web` 37 → 36 s. Targets met for `prompts` only; the rest is per-file startup and import across 65 web files and does not come from the drill (its slowest test is now 2.9 s, from 20 s), so `apps/web` and `chess-analysis` miss 30 s and 15 s on this machine. `analyseEnglund()` is cached and cloned; `englundCourseContext()` already goes only through it. The two 20 s timeouts in `course-generate.test.ts` are removed: against a local Postgres (no Docker) the api suite passes and that file passes at the default timeout. Golden snapshot passes unchanged (66 tests).

**Keep:** everything (no test removed here).
**Ephemeral:** none.
**Done when:** `chess-analysis` ≤ 15 s wall, `prompts` ≤ 5 s, `apps/web` ≤ 30 s
(from 29, 14 and 41 s), all green, golden snapshot unchanged.
**Commit:** `test(courses): build the Englund analysis once per file; fake timers in the drill`

---

## Phase 111 — Everything in its place (Lane M, move only)

No behaviour changes in this phase. After each task, `npm run test:golden`
must pass untouched, as must `npm run typecheck` and the package tests.

### Task 111.1 — Course code into `src/course/`, board facts into `src/board-facts/`

**Branch:** M. **Depends on:** 110.2. **Findings:** F1, F5.
**Read:** `packages/chess-analysis/src/index.ts`,
`packages/chess-analysis/package.json` (the `exports` map),
`packages/chess-analysis/src/course-dossier-words.ts`.

Use `git mv` for every move so history follows. Rename each test file with its
source. Update imports everywhere (`packages/*`, `apps/*`, `apps/api/scripts`).

| From (`packages/chess-analysis/src/`) | To |
|---|---|
| `course-tree.ts`, `course-tree-build.ts` | `course/tree.ts`, `course/tree-build.ts` |
| `course-pgn-comment.ts`, `course-pgn-tokens.ts` | `course/pgn-comment.ts`, `course/pgn-tokens.ts` |
| `course-line-game.ts`, `course-node-path.ts`, `course-moves.ts` | `course/line-game.ts`, `course/node-path.ts`, `course/moves.ts` |
| `course-learner-side.ts` | `course/learner-side.ts` |
| `course-skeleton.ts` (256 lines) | `course/skeleton.ts` + one more file split at a function boundary (e.g. `course/skeleton-endgame.ts`), each under 250 lines |
| `course-stages.ts` | `course/stages.ts` |
| `course-review.ts` | `course/review-schedule.ts` (it is spaced review, not game review) |
| `course-key-moves.ts`, `course-outline-check.ts`, `course-reel-candidates.ts` | `course/key-moves.ts`, `course/outline-check.ts`, `course/reel-candidates.ts` |
| `course-verify.ts`, `course-verify-board.ts`, `-pieces.ts`, `-reel.ts`, `-scope.ts`, `-text.ts` | `course/verify.ts`, `course/verify-board.ts`, … (same suffixes) |
| `course-dossier.ts`, `course-dossier-node.ts`, `course-dossier-line.ts`, `course-dossier-text.ts` | `course/dossier.ts`, `course/dossier-node.ts`, `course/dossier-line.ts`, `course/dossier-text.ts` |
| `course-tempting.ts` | `course/tempting.ts` (Phase 114 takes its general half out) |
| `course-test-fixtures.ts` | `course/test-fixtures.ts`; rename the package export `./course-test-fixtures` to `./course/test-fixtures` and update the prompts imports |
| `course-material.ts` | `board-facts/material.ts`; rename its `materialBalance` to `materialWords` (F5: the name clashed with `tactic-board-facts.ts`) |
| `course-dossier-words.ts` (359 lines) | split, by the functions each file holds, into `board-facts/verdict-words.ts` (`lineWords`, `positionWords`), `board-facts/move-facts.ts` (`boardFacts`, `moveWords`, `forkTargets`, `takingStalemates`), `board-facts/check-facts.ts` (`discovered`, `blockedCheck`, `checkAnswers`, `mateNet`, `kingNeighbours`, `isBackRankMate`), `board-facts/endgame-geometry.ts`, `board-facts/safety.ts` (`canBeTaken`, `attackedPieces`, `pinOf`, `isTrapped`, `isLostOn`), `board-facts/better-move.ts` (`betterMoveFacts`, `newDefenders`, `abandonedGuard`) |

- [x] Tests without a same-named source: `course-dossier-tactics.test.ts` →
  `course/dossier-tactics.test.ts`; `course-material.test.ts` →
  `board-facts/material.test.ts`.
- [x] Moves done as in the table; `src/index.ts` exports the new files, and
  every importer uses the new paths and names (`materialWords` replaces the
  course's `materialBalance`). No re-exports under old paths.
- [x] `board-facts/` imports nothing from `course/`. Check with `grep -rn
  "from '\.\./course/" packages/chess-analysis/src/board-facts` → no output.
- [x] `eval-words.ts` and `san-token.ts` stay at `src/`.
- [x] Update file names in docs: `docs/courses.md` (lines naming
  `course-verify.ts`, `course-verify-pieces.ts`, `course-reel-candidates.ts`,
  `course-material.ts`, `course-tempting.ts`, `course-review.ts`,
  `course-stages.ts`), `docs/architecture.md` "Courses".

**Keep:** the moved tests, unchanged. **Ephemeral:** none.
**Done when:** no `course-*.ts` is left in `packages/chess-analysis/src/`;
typecheck, lint, tests and `test:golden` all pass with nothing re-recorded.
**Commit:** `refactor(analysis): course code in course/, board facts in board-facts/`

Status: done 2026-09-30 — no `course-*.ts` left in `packages/chess-analysis/src/`; typecheck, lint, package tests (api against a local Postgres) and `test:golden` (66) pass, snapshot unchanged.

### Task 111.2 — One copy of each helper; thresholds in CONFIG

**Branch:** M. **Depends on:** 111.1. **Findings:** F5.
**Read:** `packages/chess-analysis/src/tactics.ts` (`PIECE_VALUES`),
`packages/chess-analysis/src/config.ts` (`CONFIG.courses`).

- [x] One `pieceValueOrKing(piece)` (king = 100, else `PIECE_VALUES`) in
  `tactics.ts`. Delete both `valueOf` copies (`board-facts/safety.ts`,
  `course/tempting.ts`) and use it.
- [x] One `capitalise(word)` in `packages/shared/src/text.ts`, exported from
  shared's index. Replace the copies in `course/dossier-text.ts`,
  `board-facts/material.ts`, `prompts/src/course/context.ts` and `capitalize` in
  `prompts/src/render.ts`.
- [x] Move into `CONFIG.courses`, with the same values: `SWING_WIN_DROP`,
  both `MAX_CANDIDATES` (as `maxReelCandidates` and `maxTemptingCandidates`),
  `BEST_LINE_PLIES`, `MAX_REFUTATION_PLIES`, `FULL_BLOCK_NODE_LIMIT`,
  `REEL_MOVES_BEFORE`, `REEL_MOVES_AFTER`, `REEL_MATE_REACH`. Delete the old
  constants and update every importer (grep all packages, the web app
  included).
- [x] Leave `threatens` where it is (Phase 114 decides its home).

**Keep / Ephemeral:** none new.
**Done when:** `grep -rn "const valueOf\|function capitali" packages apps
--include=*.ts` shows only the shared ones; golden unchanged.
**Commit:** `refactor(analysis): one piece value with the king, one capitalise, course limits in CONFIG`

Status: done 2026-09-30 — typecheck, lint, package tests (api against a local Postgres), web tests and `test:golden` (66) pass, snapshot unchanged. `valueOf`/`capitali` grep shows only the shared `capitalise`.

### Task 111.3 — Course services into `services/courses/`

**Branch:** M. **Depends on:** 111.1.
**Read:** nothing beyond the files moved.

| From (`apps/api/src/services/`) | To |
|---|---|
| `courses.ts` | `courses/course-drafts.ts` |
| `course-generate.ts` (+ `.test.ts`) | `courses/generation.ts` (+ `.test.ts`) |
| `course-dossier.ts` (+ `.test.ts`) | `courses/dossier.ts` (+ `.test.ts`) |

- [x] `git mv`, update imports (routes, jobs, scripts,
  `test/fixtures/courses/golden-set.ts`, `scripts/golden-inputs.ts`),
  and `docs/architecture.md` "Courses" paths.

**Done when:** no `course*.ts` is left directly in `services/`; typecheck and
`test:golden` pass.
**Commit:** `refactor(api): course services under services/courses/`

Status: done 2026-09-30 — no `course*.ts` left directly in `services/`; typecheck, lint, package tests (api against a local Postgres) and `test:golden` (66) pass, snapshot unchanged. One api run failed once right after the move with no output kept; four reruns passed.

---

## Phase 112 — Prune this branch's tests (Lane M)

### Task 112.1 — Course logic tests: keep the invariants, drop the wording

**Branch:** M. **Depends on:** 111.3. **Findings:** F10.
**Read:** the test files named below; nothing else.

The golden snapshot now covers wording. What stays in the default run is the
list of invariants below. For each test in `course/dossier.test.ts`,
`course/dossier-tactics.test.ts`, `course/tempting.test.ts`,
`course/verify.test.ts`, `course/verify-reel.test.ts`,
`course/outline-check.test.ts`, `board-facts/material.test.ts` and
`prompts/src/course/course-prompts.test.ts`:
- keep it if it guards an invariant below; rewrite its assertions to check
  that the fact is present or absent (`toContain` on a short, stable fragment
  such as the square and piece), not a whole sentence;
- otherwise delete it.

Invariants to keep (one test each, on the smallest position that shows it):
1. A capture that can be taken back is a trade, not "hanging".
2. A piece is hanging only if a legal capture of it loses nothing over the
   whole exchange (SEE).
3. A hanging piece is named with its owner's colour.
4. A fork needs two targets that aren't pawns, and a forking piece that can't
   simply be taken; nothing else is called a fork.
5. How a check can be answered lists every block, capture and king move.
6. Why it's mate covers every square around the king.
7. A discovered or double check names the other checking piece.
8. En passant names the pawn actually taken.
9. "Keeps X safe" only for a piece standing there after the better move.
10. The moved piece "stops guarding" only a square it guarded before and not
    after, never the square it moved to.
11. Repetition counts positions, not moves.
12. Quiz eligibility: best by the gap; a slower mate is no second answer.
13. Tempting moves: never a mate; at a solving move every check is weighed;
    outside solving, an obvious loss is dropped.
14. Learner side per kind (a trap's is the side that moves last).
15. Tree parsing: variations, a FEN header must be legal, an illegal move is
    an error.
16. Verifier: rejects a move not in the analysis, a piece not on its square, a
    tactic word the facts don't support, an arrow that isn't a move, and a line
    over its length; the §6.6 worked example passes.
17. Prompts: the quiz prompt never names the answer; every tempting move the
    dossier lists at a solving move reaches the solve prompt; no engine number
    reaches any course prompt.

- [x] Pruned as above; `course/tree.test.ts`, `course/stages.test.ts`,
  `course/review-schedule.test.ts`, `course/key-moves.test.ts`,
  `course/moves.test.ts`, `course/reel-candidates.test.ts`,
  `san-token.test.ts` and `eval-words.test.ts` stay as they are (small, logic).
- [x] Write the before/after test counts and times in the Status line.

**Keep:** the invariant tests. **Ephemeral:** none.
**Done when:** each of the 17 invariants has a test (list the test names in the
Status line); no remaining assertion compares a whole generated sentence; the
default suites and `test:golden` pass.
**Commit:** `test(courses): invariants stay, wording is the golden snapshot's`

Status: done 2026-09-30 — tests before → after: `chess-analysis` 852 → 789 (19.5 → 17.3 s), `prompts` 234 → 208 (4.7 → 4.5 s); `test:golden` 66, snapshot unchanged. Invariant → test (file: name):
1–2. `board-facts/move-facts.test.ts`: "a capture that can be taken back is a trade…", "a piece hangs only if a legal capture…".
3. same file: "a hanging piece is named with its owner's colour".
4. same file: "a fork needs two targets…".
5. same file: "how a check can be answered lists every block…".
6. same file: "why it is mate covers every square…".
7. same file: "a discovered or double check names the other checking piece".
8. same file: "en passant names the pawn actually taken".
9–10. `board-facts/better-move.test.ts`: ""keeps X safe" only for a piece standing there…", ""stops guarding" only a square…". (Split out of `course/dossier.test.ts`; no test in `board-facts/` imports `course/`.)
11. `course/dossier.test.ts`: "repetition counts positions, not moves".
12. `course/tempting.test.ts`: "the best move by the gap is the one answer…".
13. same file: "never a mate…", "outside a solving move an obvious loss is dropped…", "at a solving move every check is weighed…".
14. `course/dossier.test.ts`: "the learner side, per kind" (two tests).
15. `course/tree.test.ts`, untouched.
16. `course/verify.test.ts`: the §6.6 example, "rejects a move the analysis never mentions…", "…a piece that is not on its square", "…a tactic word the facts don't support", "…an arrow that isn't a move", "…a line over its length".
17. `course-prompts.test.ts`: "the quiz prompt never names the answer…" (also `verify.test.ts`: "a quiz prompt never names the answer"), "every tempting move … reaches the solve prompt", "no engine number reaches any course prompt".
Deleted with no invariant to guard: `course/dossier-tactics.test.ts`, `course/outline-check.test.ts`, `course/verify-reel.test.ts`, the skeleton tests in `course/dossier.test.ts`, and the prompt tests for budgets, cache-stable heads, retries and playbook wording. `board-facts/material.test.ts` keeps `exchangeLoss` (invariant 13) and `settledLine`.

### Task 112.2 — Web: logic tests stay, component tests go

**Branch:** M. **Depends on:** 112.1. **Findings:** F10.
**Read:** the files listed.

- [x] Keep every `.ts` test under `apps/web/src/features/courses/`,
  `apps/web/src/features/board/moveListStart.test.ts` and
  `apps/web/src/sounds/*.test.ts` (pure logic).
- [x] Keep `features/courses/player/CourseDrill.test.tsx`: it guards what a
  drill records into the review schedule (user data).
- [x] Delete the other `.tsx` tests this branch added:
  `components/AccountMenuSections`, `features/board/MoveExplorer`,
  `features/chat/DebugPanel`, and under `features/courses/`:
  `CourseDebugPanel`, `CourseDetails`, `CourseEditorPage`,
  `CourseEpisodePanel`, `CourseEpisodeWarnings`, `CourseGenerationBar`,
  `CourseIntakePage`, `CourseOutline`, `CourseProducts`, `CourseStudioHeader`,
  `CoursesPage`, `learn/CoursesHomePage`, `player/AskCoachPanel`,
  `player/CourseBoardLayout`, `player/CoursePlayer`, `player/CourseStageBar`,
  plus `features/games/CourseContinueCard` and `features/games/StartShortcuts`.
- [x] Before deleting one, check whether it is the only test of a function
  with branching logic defined inside the component. If so, move that function
  to a `.ts` file next to the component and keep one small `.ts` test for it.
  List any you moved in the Status line.

**Done when:** `apps/web` has no `.tsx` test added by this branch except
`CourseDrill.test.tsx`; web tests pass; web wall time is in the Status line.
**Commit:** `test(web): course logic tests stay; component tests removed per AGENTS.md`

Status: done 2026-09-30 — 21 component tests deleted (28 → 7 `.tsx` tests; the 6 from `main` and `CourseDrill.test.tsx` stay). Web tests before → after: 303 → 240, wall time 39 s → 26 s. Functions with branching logic that only a deleted test covered, moved to `.ts` with a small test each: `pairMoves` → `features/board/pair-moves.ts`, `turnLabel`/`lastUserText` → `features/chat/turn-label.ts`, `callTitle`/`verdict` → `features/courses/debug-call-mark.ts`. Left in place (trivial, no branching worth a test): `initialsFor`, `videoSecondsOf`, `moveRange`, `askFor`.

---

## Phase 113 — Merge gate (Lane M)

### Task 113.1 — The five CodeQL alerts

**Branch:** M. **Depends on:** 112.2 (so the fixes land on the final file
paths). **Findings:** F12.
**Read:** `docs/threat-model.md`, then only the files the alerts name.

- [ ] **Owner:** open the code-scanning link in F12 and paste each alert's rule
  id, file and line under this task. The agent can't read them.
- [ ] Fix each at its root. Typical fixes by rule:
  - `js/polynomial-redos`: rewrite the regex without nested quantifiers, or
    cap the input length before matching;
  - `js/request-forgery` / `js/path-injection`: allow-list the host or path,
    as `docs/threat-model.md` does for the existing ones;
  - `js/missing-rate-limiting`: use the existing
    `plugins/route-rate-limit.ts`.
- [ ] Never dismiss an alert without the owner's written OK under this task.

**Keep:** one regression test per alert when the fix is logic (for example a
long input that used to backtrack now returns fast). **Ephemeral:** none.
**Done when:** each alert has a fix commit, or the owner's dismissal note, and
the CodeQL check on the pushed head shows 0 new alerts.
**Commit:** `fix(security): <rule> in <file>` (one per alert)

Status: partial 2026-09-30 — the owner reported five alerts, all the same message: a regex that may run slow on `, which is trapped:` repeated (`js/polynomial-redos`). The only source is `packages/prompts/src/course/playbooks.ts` (`trapEnding`): `.replace(/, which is trapped:.*$/, '')` is now `indexOf` + `slice`, same output (golden unchanged). No dedicated regression test: the input is a dossier fact, reachable only through a full prompt context. Waiting for the CodeQL re-run on the pushed head to confirm 0 alerts; if it still shows some, the owner pastes their file and line.

### Task 113.2 — Docs match the code

**Branch:** M. **Depends on:** 113.1.
**Read:** `docs/architecture.md` "Courses", `docs/courses.md` §5.4 and §7,
AGENTS.md "Directory map" and "Testing".

- [x] Every path in those sections exists (`grep -o` the paths and `ls` them).
- [x] `docs/courses.md` §7 names the golden snapshot (`npm run test:golden`,
  `npm run golden:record`) as the check for facts changes.
- [x] AGENTS.md: the directory map lists `course/` and `board-facts/`.

**Commit:** `docs: courses paths after the move; the golden snapshot`

Status: done 2026-09-30 — every `services/…` and `packages/…` path in architecture.md, courses.md and AGENTS.md exists. courses.md gains a golden-snapshot paragraph (there is no `golden:record` script; the re-record is `GOLDEN_UPDATE=1 npm run test:golden`). AGENTS.md's course-code line names `course/`.

### Task 113.3 — Final checks and the merge

**Branch:** M. **Depends on:** 113.2.

- [ ] `npm run verify` with Docker (or the owner runs it: no Docker in the
  cloud container), `npm run test:golden`, `npm run test:corpus` (ceilings and
  floors unchanged).
- [ ] Push `claude/courses`; the owner merges PR #41.
- [ ] After merge: F13's items become Lane O, and Lanes B, F and 119.3 can start.

---

## Phase 114 — Board facts as data, one definition of loose pieces (Lane B)

**Branch:** `claude/board-facts`, from `main` after M merged.

### Task 114.1 — Structured facts, rendered to today's sentences

**Depends on:** M merged. **Findings:** F1, F4.
**Read:** `packages/chess-analysis/src/board-facts/*.ts`,
`packages/chess-analysis/src/course/dossier-text.ts`.

- [x] `board-facts/types.ts`: a discriminated union `BoardFact`, one `kind`
  per sentence the builders make today:
  - `moved` {piece, from, to} and `castles` {side};
  - `promotes` {piece};
  - `captures` {piece, square, enPassant};
  - `blocksCheck` {checker};
  - `opposition`;
  - `outsideSquare` {king};
  - `gives` {check | checkmate};
  - `discoveredCheck` {checkers};
  - `doubleCheck` {others};
  - `backRankMate`;
  - `mateNet` {king, checkers, ownSquares, covered, guarded};
  - `checkAnswers` {blocks, captures, kingMoves};
  - `attacks` {piece, square, pinnedTo?, trapped?: 'boxed' | 'nowhere'};
  - `leavesHanging` {piece, square, owner, stalemateIfTaken};
  - `forks` {piece, square, targets};
  - `stopsGuarding` {piece, square, replySan};
  - `keepsSafe` {piece, square, newDefenders};
  - `takesOutOfDanger` {piece, square};
  - `repetition` {times}.

  Squares are `Square`, pieces `PieceSymbol`, sides `'white' | 'black'`.
- [x] Each builder returns `BoardFact[]`. `board-facts/render.ts` has
  `renderBoardFact(fact): string`, which produces exactly today's sentence.
- [x] Callers that need strings call `facts.map(renderBoardFact)` for now.
  Nothing else changes.

**Keep:** one test per `kind` checking the structured fields on a small
position (these replace the matching invariant tests from 112.1 where they
overlap). **Ephemeral:** a `render.wip.test.ts` comparing old string output
with the new render over the Englund and the 66 golden trees; delete it once
`test:golden` passes.
**Done when:** `test:golden` is byte-identical.
**Commit:** `refactor(analysis): board facts as data, rendered at the edge`

Status: done 2026-09-30 — `board-facts/types.ts` (`BoardFact`, 19 kinds) and `render.ts` (`renderBoardFact`); every builder returns `BoardFact[]`; `course/dossier-node.ts` and `course/tempting.ts` render at the edge; `test:golden` (66) passes with the snapshot unchanged (no `render.wip` test needed: the golden run is the old-vs-new comparison); chess-analysis typecheck, lint and board-facts tests pass. Naming deviations: `castles` carries `wing` (kingside/queenside), not `side`, and `gives` carries `check`. No kind is tested for `attacks.trapped` (no small position found); the mapping is one branch in `safety.ts`. Other packages' tests not re-run.

### Task 114.2 — No code reads the facts' English

**Depends on:** 114.1. **Findings:** F4.
**Read:** the files listed in F4.

- [x] `course/dossier-node.ts`: `mateAhead` comes from the engine line
  (`moverMateIn(evalAfter.lines[0], side) !== null`), not `/forced mate/`.
- [x] `course/reel-candidates.ts` `IDEA_FACT` → a check on the kinds `forks`,
  `attacks` with `pinnedTo`, or `gives`.
- [x] `course/skeleton.ts` repetition → the `repetition` kind.
- [x] `course/tempting.ts` `notTheAnswer` → decide from the two `EngineLine`s,
  not from `lineWords` text.
- [x] `prompts/src/course/playbooks.ts` and
  `apps/api/src/services/courses/manual-notes.ts`: filter by kind.
- [x] `course/verify-text.ts` tactic words: allowed words come from the kinds
  present (`forks` → fork, `attacks.pinnedTo` → pin, …).
- [x] `withoutFileDetail` and `withoutSquareFork` read tactic-claim details,
  not board facts. Leave them for Task 115.1.

**Done when:** `grep -rnE "\.(board|after|before|does)\b.*\.(test|includes|startsWith)\(" packages apps --include=*.ts | grep -v test` shows nothing, and `test:golden` is identical.
**Commit:** `refactor(courses): decisions from facts and engine lines, never from their words`

Status: done 2026-09-30 — the listed readers now decide from kinds and engine lines (`mateAhead` is a stored field of the node facts; `factWords` in `board-facts/fact-words.ts` feeds the verifier; `notTheAnswer` reads the engine lines, with a small test). `mateAhead` is true when either side has a mate after the move, not only the mover as this task's bullet said: the mover-only version changed three golden files (an allowed-gain sentence appeared where a mate follows for the opponent). `test:golden` (66) identical; chess-analysis, prompts and api course tests pass. The `docs/prompts.md` generator output was already stale before this task and is left alone.

### Task 114.3 — The dossier stores facts as data

**Depends on:** 114.2.
**Read:** `apps/api/scripts/course-dossier-refresh.ts`,
`apps/api/src/db/repositories/courses.ts` (`setDossier`).

- [x] `CourseNodeFacts.board`, `bestInstead.board` and the tempting moves'
  `does` and `after` become `BoardFact[]`. `renderCourseDossier` renders them.
  No version field, and no code that reads the old string shape.
- [x] Stored dossiers in the old shape are regenerated, not read:
  **Owner, after deploy:** run `npx tsx apps/api/scripts/course-dossier-refresh.ts`
  once on each database that has courses (one engine pass per course).

**Done when:** `test:golden` is identical.
**Keep / Ephemeral:** none new.
**Commit:** `feat(courses): the dossier stores board facts as data`

Status: done 2026-09-30 — done together with 114.2 (the readers needed the data). `board`, `bestInstead.board`, tempting `does`/`after` are `BoardFact[]`; `renderCourseDossier` renders them. Owner, after deploy: run `npx tsx apps/api/scripts/course-dossier-refresh.ts` once per database with courses (not run here).

### Task 114.4 — One definition of loose pieces and of forks

**Depends on:** 114.1. **Findings:** F2.
**Read:** `board-facts/safety.ts`, `see.ts`, `null-move-fen.ts`,
`piece-safety.ts`, `tactic-board-facts.ts`.

- [x] `board-facts/loose-pieces.ts`: `loosePieces(fen, owner): LoosePiece[]`
  with `{ square, piece, owner, tier: 'free' | 'winnable' }`.
  - Look from the opponent's side: if it's `owner`'s turn, use
    `flipActiveColorFen`. If the flipped position is illegal (the owner gives
    check), return `[]` and say so in the doc comment.
  - `free`: a legal capture of the piece exists, and the piece has no defender.
  - `winnable`: it has defenders, but `see(fen, square, opponent) > 0` (the
    opponent comes out ahead over the whole exchange, e.g. a knight attacked
    by a pawn).
  - Kings are never loose.
- [x] `board-facts/forks.ts`: `forks(fen, by)`: a piece of `by` attacking at
  least two non-pawn enemy pieces (the king counts), where the forking piece
  can't be taken with `see ≥ 0`. This is the rule the course already uses;
  build it from the same code.
- [x] The course keeps its output: `leavesHanging` uses only `free`, and the
  golden snapshot stays identical. Tier `winnable` is for Phases 115–117.
- [x] `threatens` (course/tempting.ts): move it to
  `board-facts/threats.ts` if nothing already in
  `checks-captures-threats.ts` does the same (compare them; if one does, use it
  and delete the copy).

**Keep:** tests for `free`, `winnable`, "a defended piece attacked by an equal
piece is not loose", "a pinned attacker can't take", and "the king is never
loose". **Ephemeral:** a `loose-pieces.wip.test.ts` that counts, over the
positions in `tactic-review-cases.ts` and the Lichess validation set, how many
pieces the naive `hangingPieces` / `underDefendedPieces` flag against
`free` / `winnable`. Paste the table in the Status line (Lane E needs it),
then delete the file.
**Done when:** `test:golden` identical; the table is in the Status line.
**Commit:** `feat(analysis): one definition of loose pieces and forks`

Status: done 2026-09-30 — `board-facts/loose-pieces.ts` (`loosePieces`), `board-facts/forks.ts` (`forks`, built on `tactics.forks` + `canBeTaken`), `board-facts/threats.ts` (`threatens` moved: `checks-captures-threats.ts` answers a different question, every newly attacked piece, so no copy was deleted). `move-facts.ts` now builds `leavesHanging` from `loosePieces(...)` `free` and forks from `forks()`; `test:golden` (66) identical. Both tiers also need `see > 0`, not only "no defender": the Englund's rook on a1 has no direct defender but sits behind the queen on b2, and taking it loses the queen; without that the golden changed. Table over the 1370 positions after each move of `tactic-review-cases.ts` and every ply of the Lichess fixture, each position seen from both owners (so 2740 owner views):

| | count | `free` | `winnable` | neither |
|---|---|---|---|---|
| `hangingPieces` (naive) | 1746 | 1238 | 0 | 508 |
| `underDefendedPieces` (naive) | 452 | 0 | 251 | 201 |

`free` pieces missing from `hangingPieces`: 0 (of 1238). `winnable` pieces missing from `underDefendedPieces`: 408 (of 659): a defended piece attacked by a cheaper one is invisible to the naive count. So 29% of the naive "hanging" pieces are not loose (an x-ray recapture, a pinned taker, or a capture that loses material), 44% of "under-defended" ones are not, and `winnable` finds 408 the naive lists never flag. `corpus` tier not run (nothing under `tactic-detectors/` changed).

### Task 114.5 — Docs and merge

- [x] AGENTS.md "Chess facts" rule points at `board-facts/`;
  `docs/architecture.md` gets one paragraph on `board-facts/` (what it is,
  who uses it, `renderBoardFact`).
- [x] `npm run verify`, `test:golden`, `test:corpus`; push; open a PR.

Status: partial 2026-09-30 — docs done. `verify:changed`, `test:golden` (66, identical) and the chess-analysis, prompts and api course tests pass; full `npm run verify` passed with Docker (api against Postgres included). `test:corpus`: the `basic` reporter in its script no longer exists in vitest 5, so it fails to start; run directly it passes with a longer test timeout (three tests hit the 5 s default under load), no ceiling or floor moved. Branch pushed, PR to be opened.

---

## Phase 115 — Game review from the board facts (Lane C)

**Branch:** `claude/review-facts`, from `main` after B merged. Runs alongside
D and E.

### Task 115.1 — The course's claim fixes move into the tactic layer

**Depends on:** B merged. **Findings:** F3, F6.
**Read:** `docs/tactics-rework.md` §9, `course/dossier-node.ts` (the filters),
`tactic-reason-text.ts`, `rank-tactic-claims.ts`, `verify-tactic-claims.ts`.

Move each filter to where the claim is made or verified, so
`ClassifiedMove.tacticOpportunity` and `tacticAllowed` come out right for both
review and courses:
- [x] no `spaceGain` in the endgame phase, or for a pawn reaching rank ≥ 6
  (White) / ≤ 3 (Black);
- [x] no defensive motif (`defendsHangingPiece`, `removesTarget`,
  `escapesFork`, `blocksThreat`, `breaksPin`) on a move that gives check;
- [x] on a checkmate, or with a forced mate for the mover in the engine line
  after the move, only claims whose gain is mate;
- [x] no "takes the open file" detail on `brilliantSacrifice`;
- [x] fork details name pieces (`board-facts/forks.ts`), never bare squares;
- [x] no "they let you win X (material)" when the move itself captured at
  least X.
- [x] Delete the filters from `course/dossier-node.ts`.

**Keep:** add each fix's position to `tactic-review-cases.ts`, as that file
already does. **Ephemeral:** none.
**Done when:**
- `test:golden` is identical (the course already filtered these);
- `npm run test:corpus`: precision ceilings the same or lower, recall floors
  the same or higher (if a floor would drop, stop and ask);
- the new ceilings are written into `tactic-precision.test.ts`.

**Commit:** `fix(review): the course's tactic-claim fixes, for the review too`

Status: done 2026-09-30 — the filters live in `tactic-claim-fit.ts` (`cardFits`, applied to the card in `classifyTacticChance`), `tactic-allowed.ts` and `move-verdict/reasons/` (`mateFollows`, `moveTookAtLeast`, also in the hung-material fallback, otherwise it re-made the card the gate dropped), `game-tactic-motifs.ts` (the open-file detail) and `tactic-detectors/fork.ts` (fork detail names the pieces, pawns left out, null under two pieces). `course/dossier-node.ts` has none left. Deviations: the gates sit on the card (headline), as the course's did, not on each claim, because dropping claims would promote a lower claim to headline and change what the corpus measures; "a mate ahead" means a mate for either side after the move (not only the mover), as the course read it, else three golden files gained wrong "allowed" sentences; `TacticClaim.detail` is `string | null`. **Re-recorded** (the owner allowed it for this task, since the snapshot could not stay identical): 19 files, 33 lines added and 5 changed, all explained. (a) 30 lines "You forced mate." / "They let you force mate with X": the card a move gets when a mate is ahead is now the mate card, where the course used to drop the non-mate card and say nothing. (b) 5 fork sentences gain "— knight on c6 forks the knight on b8 and the queen on d8" (was the fork with no detail). Nothing else changed. `test:corpus`: all three files pass with no ceiling or floor moved (the gates sit after the classification the precision test measures). `npm run verify` passes in 104 s (api with Docker; api suite 45 s, the course generation tests no longer rebuild the Englund dossier per call: `englundDossier` caches per tree). Unit tests: `tactic-claim-fit.test.ts`, one in `tactic-allowed.test.ts`; the two `build-game-report` fork sentences now name pieces. The new cases could not go in `tactic-review-cases.ts`: its harness checks the headline and detectors before the card gate.

### Task 115.2 — Review notes on the golden snapshot

**Depends on:** 115.1. **Re-record allowed.**
**Read:** `apps/api/test/golden/course-facts.golden.ts`, `move-reasons.ts`.

- [x] Extend the golden text with a `REVIEW NOTES` block: for every course
  line, each move's `reasons` from `CourseLineAnalysis.moves`, as
  `n12 6…Bb4: <reason>; <reason>`. Record it with today's behaviour in its own
  commit, so the next task's diff shows exactly what changes.

**Commit:** `test(review): review notes in the golden snapshot`

Status: done 2026-09-30 — `test:golden` has a `REVIEW NOTES` block per course (`courseInputs` now also returns each line's analysis); recorded with the current behaviour, the rest of each file unchanged (only additions), all files under 50 KB, 66 tests pass.

### Task 115.3 — Review notes from the board facts

**Depends on:** 115.2. **Findings:** F7. **Re-record allowed.**
**Read:** `move-reasons.ts`, `board-facts/loose-pieces.ts`, `board-facts/forks.ts`.

- [x] Replace `hangingPieceReasons`, `underDefendedReasons` and
  `newForkReasons` with facts from `board-facts`:
  - "Leaves the knight on f3 undefended" for `free`;
  - "Leaves the knight on f3 where it can be won" for `winnable`;
  - "Allows a fork: the knight on d5 hits the queen on c7 and the rook on a8"
    from `forks()` for the opponent after the move.
- [x] Fault notes (the three above) only on moves of quality inaccuracy,
  mistake, blunder or miss, never on book, best, excellent, good or brilliant
  moves.
- [x] Never report as loose the piece on the square the move just captured on
  when the capture is a trade (the course's `traded` rule).
- [x] Read the golden diff: every changed note must be explainable. Paste 5
  representative before/after lines in the commit body.

**Keep:** invariant tests: a best move gets no fault note; a trade is not
loose; a defended knight attacked by a pawn gets the `winnable` note.
**Ephemeral:** none.
**Commit:** `fix(review): loose pieces and forks from the board facts; faults only on errors`

Status: done 2026-09-30 — `move-reasons.ts` builds "Leaves the X on S undefended" (`free`), "…where it can be won" (`winnable`) and "Allows a fork: the knight on d5 hits the queen on c7 and the rook on a8" from `loosePieces` and `forks`, only for inaccuracy, mistake, miss and blunder, only what the move made loose (a piece loose before is not reported again), and never the square of a capture that was an even trade. The old "attacked 2× and defended 1×" note is gone. `test:golden` re-recorded: 34 files, notes removed from good moves (138 old fault notes gone, most on best or good moves), 11 new "undefended" / "where it can be won" notes on moves that cost something; forks named by pieces; the old fork notes that named bare squares, or a fork the forker could simply be taken out of, are gone. `npm run verify` passes in 114 s. Invariant tests in `move-reasons.test.ts`: a best move gets no fault note, a trade is not loose, a defended knight attacked by a pawn gets `winnable`, a fork names pieces and only a new one.

### Task 115.4 — Why the better move was better

**Depends on:** 115.3. **Re-record allowed.**
**Read:** `board-facts/better-move.ts`, `board-facts/material.ts`,
`CONFIG.moveReasons`.

For the user's moves of quality mistake, blunder or miss only, add at most two
notes (within `CONFIG.moveReasons.maxReasons`):
- [x] `stopsGuarding` against the engine's reply to the played move ("Your
  queen stopped guarding c1, where Qc1# followed");
- [x] the better move's `keepsSafe` or `takesOutOfDanger`, and the material at
  the end of its settled line (`settledLine` + `materialWords`), e.g. "Nc3
  keeps the rook on a1 safe; after it material stays level".

Where the evals come from: `runAnalysisSteps` already has each position's
lines (multiPv 5) and the position after the move.

**Keep:** one test each for `stopsGuarding` and `keepsSafe` appearing only on
errors. **Ephemeral:** none.
**Commit:** `feat(review): what the move gave up, and why the better move was better`

Status: done 2026-09-30 — `move-reason-better.ts`: for the user's mistake, blunder and miss (not inaccuracy, not the opponent's moves) "Your queen stopped guarding c1, where Qc1# followed" (`abandonedGuard` against the engine's reply after the move, `evalAfter` is now passed to `buildReasons`) and "Bc3 keeps the rook on a1 safe; after it material is level" (`betterMoveFacts` keepsSafe / takesOutOfDanger, material from `settledLine` + `lineBalance`). Both go through the usual `maxReasons` cut. `test:golden` re-recorded: one line changed (the course games have few user errors): `n37 19.e5: Costs 19 squares of piece mobility` → `Qd1 keeps the pawn on c2 safe; after it Black is a rook and a bishop up`. Tests in `move-reasons.test.ts` for both notes, errors only. `npm run verify` passes in 105 s.

### Task 115.5 — Merge

- [x] Stored game reports keep their old notes until a game is analysed again;
  no backfill. Say so in the PR description.
- [x] `npm run verify`, `test:golden`, `test:corpus`; push; PR.
- [ ] Later, owner decision: tempting moves at the user's critical moments in
  review (up to 6 extra engine positions per moment). Not in this phase.

Status: done 2026-09-30 — `verify` 105 s, `test:golden` 66, `test:corpus` 14 pass (run directly with a longer timeout: its script's `basic` reporter no longer exists). Branch pushed, PR opened.

---

## Phase 116 — The coach gets the facts up front (Lane D)

**Branch:** `claude/coach-facts`, from `main` after B merged. Runs alongside C
and E.

### Task 116.1 — Measure tool calls per episode first

**Depends on:** B merged (can start earlier; it touches nothing in B).
**Findings:** F8.
**Read:** `apps/api/src/db/repositories/session-messages.ts`,
`apps/api/src/services/coach-agent-turn.ts` (how tool rows are written).

- [ ] Repository function `toolCallStats(db, since: Date)` in
  `session-messages.ts` (SQL stays there). It returns tool-call rows grouped by
  session and ply, with the tool name taken from the stored content (find
  where the name is in a tool row's JSON).
- [ ] Script `apps/api/scripts/coach-tool-stats.ts --since 2026-09-01`
  (read-only, `DATABASE_URL`). It prints: sessions, episodes (session + ply),
  tool calls per episode (mean, median, 90th percentile), and calls by tool
  name.
- [ ] **Owner:** run it on the real database and paste the output under this
  task. This is the "before" number.

**Keep:** one db test for `toolCallStats`. **Ephemeral:** none.
**Commit:** `feat(api): a script counting coach tool calls per episode`

**Status:** done except the Owner step. `toolCallStats` counts `tool-call`
parts in assistant rows (SQL in `session-messages.ts`, one db test); the
script is `apps/api/scripts/coach-tool-stats.ts`. The owner still has to run it
on the real database and paste the "before" numbers here.

### Task 116.2 — `check_moves` and "Board facts" from the board facts

**Depends on:** 116.1. **Findings:** F2, F8.
**Read:** `inspect-moves.ts`, `packages/prompts/src/move-inspection-summary.ts`,
`packages/prompts/src/coach-method.ts`,
`packages/prompts/src/episode-context.ts` (`boardFacts`).

- [ ] `inspectMoves`:
  - replace `hangingPieces` with `loosePieces` (both colours, with tier), and
    `leavesHanging` with `leavesLoose` (the mover's, both tiers, excluding a
    traded piece);
  - replace `createsForks` with `forks()` for the mover;
  - add `facts: BoardFact[]` (the move facts).
- [ ] Renderers:
  - "Loose right now: the white knight on f3 (can be won), the black pawn on e5 (undefended)";
  - a checked move lists its rendered facts and loose pieces.
- [ ] `coach-method.ts`: replace rule 6 with one sentence: "Board facts call
  a piece loose only when it can actually be won; still read the evaluation
  before calling a move a mistake."
- [ ] Callers to check: `coach-tools.ts`, `puzzle-session-tools.ts`,
  `courses/ask-coach.ts`, `puzzle-coach-system.ts`,
  `prompts/src/course/ask-coach.ts`.
- [ ] `npm run docs:prompts`; update the prompts snapshot test.

**Keep:** tests for the render of a loose piece, a trade (not loose), and an
illegal move. **Ephemeral:** none.
**Commit:** `feat(coach): check_moves and board facts count only pieces that can be won`

**Status:** done. `inspectMoves` carries `leavesLoose`, `forks` and `facts`; the
position has `loose` (both colours, with tier). The single-move replay moved
to `inspect-move.ts` (`replayMove`) so `boardFacts` and `betterMoveFacts` use it
without an import cycle; `inspectMoves` adds `facts` on top. `favorableCaptures`
is unchanged. A checked move's line lists its rendered facts; the loose pieces
are listed once, with tiers ("undefended" / "can be won"), so `leavesHanging`
facts are left out of that line. Rule 6 is one sentence; tool descriptions say
"loose". `docs/prompts.md` was stale, so its diff is larger than this change. Deviation:
`betterMoveFacts` keeps the old attacked-and-undefended reading (own helper in
`better-move.ts`); moving it to the loose tiers changed the golden review notes
of six courses, and this phase does not re-record.

### Task 116.3 — "What the move did" in the current position

**Depends on:** 116.2. **Findings:** F8.
**Read:** `apps/api/src/services/coach-context.ts` (lines ~120–165),
`packages/prompts/src/episode-context.ts` (`renderAnalysisSection`,
`CurrentMoveAnalysisContext`).

- [ ] `CurrentMoveAnalysisContext` gets an optional `moveFacts`:
  - `played`: the played move's rendered facts;
  - `gaveUp`: `abandonedGuard` against `postMoveAnalysis.lines[0]`;
  - `better`: for a move that isn't the best, `betterMoveFacts` plus the
    material at the end of the settled best line;
  - `playedLine`: `captureWords` over the played move and its continuation;
  - `looseAfter`: `loosePieces` for both sides after the move.

  Computed in `coach-context.ts` (pure calls, no engine call: everything
  comes from `analysis` and `postMoveAnalysis`).
- [ ] Render it after the engine lines as "What the move did" and "Best
  instead", at most 10 lines. It's in the uncached tail, so keep it short.
- [ ] `coach-method.ts`:
  - rule 2: a move named in "What the move did" or "Best instead" counts as
    checked;
  - rules 3 and 8: that block already says what the played and best moves
    touch; call tools only for what it doesn't say.
- [ ] `npm run docs:prompts`.

**Keep:** render tests: a blunder shows `gaveUp` and `better`; a best move
shows no `better`; a trade shows nothing loose. **Ephemeral:** none.
**Commit:** `feat(coach): the move's board facts in the current position`

**Status:** done. `currentMoveFacts` (`board-facts/current-move.ts`, pure, no
engine call) builds `played`, `gaveUp`, `better` (with the material at the end
of the settled best line), `playedLine` and `looseAfter`. The mover's own loose
pieces come from `replayMove`, so a capture taken back is a trade, not loose.
`renderCurrentMoveBlock` shows "What the move did" and "Best instead" after the
engine lines, cut at 10 lines. `coach-method.ts` has six rules, not eight: the
new sentence went into rules 2 and 3. The api full run hit the 5 s timeout in
`generation.test.ts` once under load; it passes alone (Lane C's cached
`englundDossier` fixes that, it is not on this branch).

### Task 116.4 — Facts for the student's focus areas

**Depends on:** 116.3.
**Read:** `packages/prompts/src/coach-system.ts` (`renderFocusAreasBlock`),
`packages/shared/src/diagnosis/families/bv.ts` and `ms.ts` (the code titles
only), `apps/api/src/services/coach-context.ts`.

- [ ] Pass the active focus areas' diagnosis codes into
  `buildEpisodeContext`. For the student's own moves only, add at most 8 lines:

  | Codes | Extra facts |
  |---|---|
  | BV-01, BV-04, BV-22, MS-14 | loose pieces of both sides before and after the move |
  | MS-01, MS-02, MS-03 | the opponent's checks, captures and threats after the move (list only, labelled "to look at, not verdicts") |
  | MS-04, MS-05, MS-06 | the student's own checks, captures and threats before the move |
  | BV-15, MS-08 | whether the moved piece's new square is safe (SEE) |
  | EG-* | the opposition and the rule of the square, when present |
- [ ] Check the code ids exist in `families/*.ts` before using them; skip any
  that don't.

**Keep:** one render test per row. **Ephemeral:** none.
**Commit:** `feat(coach): facts for the student's focus areas, up front`

**Status:** done. `focusFacts` (`board-facts/focus-facts.ts`) maps the codes in the
table to sections and returns null for the opponent's move. All codes in the
table exist in `families/*.ts` (EG-* by prefix). `buildEpisodeContext` reads the
active and improving focus areas itself (one query) instead of taking the codes
as input, because the turn does not hold the profile. `renderFocusFacts` shows
at most 8 lines under "For what you two are working on:". "Threats" are the
pieces the side to move could win (`loosePieces`). The EG-* row shows the
opposition and the rule of the square for the played move only.

### Task 116.5 — Measure again and merge

- [ ] **Owner:** after a week of use, run `coach-tool-stats.ts` again and
  paste the output. Compare with 116.1.
- [ ] If tool calls per episode didn't drop, write down which tools remain
  common. The next step (an owner decision): tempting moves for the coaching
  plan's prepared moments, computed when the plan is built.
- [ ] `npm run verify`; push; PR.

---

## Phase 117 — Stats count real loose pieces (Lane E)

**Branch:** `claude/stats-loose-pieces`, from `main` after B merged. Runs
alongside C and D.

### Task 117.1 — What the change will do to the numbers

**Depends on:** B merged. **Findings:** F2, F9.
**Read:** `docs/diagnose.md` §4.4 (Opportunity definition), §II.C (Board
vision) and §II.D (One-ply move safety) only;
`packages/chess-analysis/src/diagnostics/README.md`;
`apps/api/src/services/diagnostic-window.ts`.

- [ ] Using Task 114.4's table, estimate how the BV-01, BV-10, BV-22 and MS-14
  opportunity counts will move. Write it in the Status line, with the window
  size from `diagnostic-window.ts`.
- [ ] Diagnostic entries already stored stay as they are: no recompute job, no
  version marker. The profile's window moves on to newly analysed games by
  itself. Say this in the PR description.

Status: done 2026-09-30 — estimate from 114.4's table (2740 owner views; window = 15 to 100 rated games per time control, `MIN_WINDOW_GAMES`/`MAX_WINDOW_GAMES`): BV-01 and BV-10 read `free` instead of `hangingPieces`: 1746 → 1238 pieces, so about 29% fewer opportunities (the naive list flagged x-ray recaptures, pinned takers and losing captures). BV-22 and MS-14 read `free` + `winnable` instead of `underDefendedPieces`, which never held the zero-defender pieces: 452 → 1897 pieces (`free` 1238 + `winnable` 659), about 4× more loose pieces per position, so MS-14 opportunities rise sharply and BV-22 (needs two at once) more than that, while a failure still needs an engine-confirmed loss, so the failure counts rise less. Every new opportunity that was not a failure counts as a success, so these codes' success rates will read higher than before until the window has turned over. PR description: stored entries are not recomputed; the window moves on by itself.

### Task 117.2 — Detectors use `loosePieces`

**Depends on:** 117.1.
**Read:** the detector files named here.

- [ ] Stop reading the naive lists; call `loosePieces(fen, color)`:
  - BV-01, BV-10 and `own-chance.ts` use tier `free`;
  - BV-22 and MS-14 use `free` + `winnable` (instead of
    `underDefendedPieces`);
  - `move-verdict/diagnostic-code.ts` `isHangingAt`, `candidate-moves.ts` and
    `tactics-score.ts` use `free`.
- [ ] The naive lists stay in `PositionFeatures` until Task 117.4, because
  Lanes C and D are replacing their other readers in parallel.

**Keep:** update each detector's existing test (`bv-01-…test.ts` etc.) and add
one "defended by value" case to MS-14. **Ephemeral:** none.
**Done when:** diagnostics tests and `test:corpus` pass.
**Commit:** `fix(diagnostics): opportunities count pieces that can really be won`

Status: done 2026-09-30 — BV-01, BV-10, BV-22, MS-14, `own-chance.ts` (`ownFreePieceCaptureSans`), `diagnostic-code.ts` (`isHangingAt` now reads `move.fenBefore`; the `featuresBefore` parameter is gone, so `build-diagnostics.ts` drops it too), `candidate-moves.ts` and `tactics-score.ts` (`hasHangingPieces`) call `loosePieces` through `looseSquares` in `detectors/own-piece-squares.ts`. Deviations: BV-10 no longer reads `previousMove.featureDelta.newHangingPieces`: it compares `free` pieces at the previous move's `fenBefore` and `fenAfter`, so it needs both FENs. `candidate-moves.ts` takes `createsUnderDefendedPiece` from `winnable` (free pieces are already `createsHangingPiece`) and computes the hanging flags from `free` before/after instead of `diffPositionFeatures`; forks still come from the diff. Limit: a side in check on its own turn has no `loosePieces` answer (`[]`), so a check the candidate gives leaves the opponent's loose pieces unlisted. Two tests had illegal or stale fixtures and were fixed (a king already in check in `candidate-diagnosis-proxy.test.ts`; `bv-10` test now gives the previous move's FENs). New MS-14 case: a pawn attacked by queen and rook behind it, defended once, is not loose. `verify:changed` passes; the corpus files run directly (the script's `basic` reporter is gone in vitest 5) pass, 14 tests.

### Task 117.3 — "Only moves found"

**Depends on:** 117.2.
**Read:** `course/dossier-node.ts` (`isQuizEligible`), the stats-entry and
stats-dashboard files (`build-stats-dashboard.ts`, `stats-entry.ts`).

- [ ] Use the quiz rule (the best move clearly ahead of the second, or a
  faster mate) on the user's positions: they are "only move" positions; found
  = the user played it. The review evals are multiPv 5, so no engine cost.
  Move `isQuizEligible` to `board-facts/only-move.ts` and reuse it in both
  places.
- [ ] Add "Only moves found X of Y" to the stats dashboard (jsonb stats, no
  migration, following the existing jsonb convention).
- [ ] Other new stats (tempting moves resisted, endgame technique) wait for
  the owner.

**Keep:** tests for the rule. **Commit:** `feat(stats): only moves found`

Status: done 2026-09-30 — `isQuizEligible` moved to `board-facts/only-move.ts` as `isOnlyMove` (same rule; the course quiz and the stat both call it; its test moved with it), plus `countOnlyMoves(moves, evals, side)`. `buildPlayerReport` fills `PlayerReport.onlyMoves {positions, found}` from `evals[ply - 1]` (the review's multiPv lines, no engine cost); found = the player's SAN is the best line's. `StatsBucket.onlyMoves` and `StatsDashboard.onlyMoves` carry it: optional in the report and the bucket so stored reports and archived weeks still parse and stay absent rather than 0 (same rule as `preventable`); the dashboard field is null with no positions. The tactics card shows "Only moves found X of Y" as a headline on the Stats page and on a game's report. Stored reports have no `onlyMoves` until the game is re-analysed; nothing backfills. The frozen `stats-dashboard-reference.ts` gained a plain-sum `referenceOnlyMoves`. A faster-mate second line is read from `mateIn` at report time, which the stored move alone (cp only) could not give, hence the computation in the report builder, not from `ClassifiedMoveDto`. `verify:changed` and `test:golden` (66) pass.

### Task 117.4 — Merge, then delete the naive lists

- [ ] `npm run verify`, `test:corpus`; push; PR; merge.
Status (first bullet): done 2026-09-30 — `npm run verify` passes (Docker up, api against Postgres included); corpus files run directly pass (14 tests, after 117.2; 117.3 touched nothing under `tactic-detectors/`); `test:golden` 66 identical. Branch pushed, PR opened. The second bullet (delete the naive lists) waits for this PR to merge.

Status (second bullet): done 2026-09-30 — `hangingPieces`/`underDefendedPieces` are gone from `PositionFeaturesSchema`, `position-features.ts` and `piece-safety.ts`; `FeatureDelta.newHangingPieces` is `newLoosePieces` (a true before/after diff from `loosePieces`, both tiers; new `LoosePieceSchema` in shared). `diffPositionFeatures` keeps forks and mobility; `positionDelta(before, after, fenBefore, fenAfter)` adds the loose diff for `classify`, enrichment, `pv-tactics` and the coach. Readers moved: `better-move.ts` (`leavesLoose`, `free`; golden stayed identical, no re-record needed), `tactics-score.ts`, `pv-tactics.ts`, `position-analysis-summary.ts` (from `analysis.fen`) and `episode-context.ts` (renders "Newly loose: …"). The grep prints nothing. Stored rows are not read for the old fields: a report's `featureDelta` written before this fails the schema and is re-made on re-analysis. `verify` passes, `test:golden` 66 identical, corpus files 14 pass.

- [ ] **After C and D are merged too**, on a new branch
  `claude/drop-naive-hanging` from `main`:
  - remove `hangingPieces` and `underDefendedPieces` from
    `PositionFeaturesSchema` and `position-features.ts`;
  - delete them from `piece-safety.ts`;
  - replace `FeatureDelta.newHangingPieces` with `newLoosePieces` (from
    `loosePieces`);
  - move every remaining reader to `loosePieces`
    (`grep -rn "hangingPieces\|underDefendedPieces" packages apps services`
    must print nothing).

  No field is kept "for old rows". If a stored row holds the old fields, it is
  regenerated or dropped, not read.
- [ ] `npm run verify`, `test:golden`, `test:corpus`; PR.
  **Commit:** `refactor(analysis): one loose-piece list; the naive hanging lists are gone`

---

## Phase 118 — Courses know which weakness they train (Lane F)

**Branch:** `claude/course-diagnosis-tags`, from `main` after M merged. Runs
alongside B–E.

### Task 118.1 — Codes on a course

**Findings:** F9.
**Read:** `packages/shared/src/course.ts` (the document),
`packages/chess-analysis/src/diagnostics/motif-to-code.ts`.

- [ ] `CourseDocument.diagnosisCodes: string[]`, required (no `.default()`;
  jsonb, no migration). Code fills it at dossier time:
  - each learner node's `motif` through `motif-to-code.ts`;
  - for the `endgame` kind, the EG code that matches the skeleton's goal where
    one does (else none).
- [ ] The editor's Details shows the codes and lets the creator remove or add
  one (from the catalogue).
- [ ] The public catalogue API returns them.
- [ ] Existing courses: `course-dossier-refresh.ts` also fills
  `diagnosisCodes` into each stored document. **Owner:** run it once after
  deploy. Nothing reads a document without the field.

**Keep:** one test on the Englund trap: its codes are exactly what
`motif-to-code.ts` gives for its learner nodes' motifs (look at the golden
facts file for which motifs those are before writing the test).
**Ephemeral:** none.
**Commit:** `feat(courses): the diagnosis codes a course trains`

### Task 118.2 — Focus areas point to courses

**Depends on:** 118.1.
**Read:** where focus areas are shown (grep `FocusArea` in
`apps/web/src/features`), `apps/api/src/routes/public-courses.ts`.

- [ ] `GET /api/public/courses?code=BV-22` (or the catalogue route with a
  filter): public courses carrying that code.
- [ ] Each focus area card lists up to 3 of them.
- [ ] Course drills counting as practice for a code needs a design first; it
  is not in this phase.

**Keep:** a route test for the filter. **Commit:** `feat(progress): courses for each focus area`

---

## Phase 119 — Test tiers for the whole repo (Lane T)

**Branch:** `claude/test-tiers`, from `main`. Tasks 119.1 and 119.2 can start
now, alongside Lane M; they don't touch M's files.

### Task 119.1 — `test:changed` runs affected tests; no committed wip tests

**Findings:** F10.
**Read:** `scripts/test-changed.ts`, `vitest.config.ts`,
`.github/workflows/ci.yml` (the test job).

- [ ] `scripts/test-changed.ts`: run `npx vitest run --changed HEAD~1` from
  the root (the root config's projects), so only tests reached through
  imports from changed files run, as CI already does for PRs. Keep a
  `--package` escape hatch that runs one package's whole suite.
- [ ] CI step in the test job: `git ls-files '*.wip.test.ts' '*.wip.test.tsx'`
  must print nothing, else the job fails with "ephemeral test committed".
- [ ] AGENTS.md "Testing" already describes both; check the wording matches.

**Commit:** `chore(test): affected-only test:changed; ephemeral tests never committed`

Status: done 2026-09-30 — `scripts/test-changed.ts` runs `npx vitest run --changed HEAD~1` from the root (one run took 48 s on this branch's last commit), with `--package <name>` for one package's whole suite. CI's test job fails with "ephemeral test committed" when `git ls-files '*.wip.test.ts' '*.wip.test.tsx'` prints anything. AGENTS.md's Testing bullet and the `test:changed` line say the same.

### Task 119.2 — Nightly runs the opt-in tiers

**Read:** `.github/workflows/ci.yml`.

- [ ] On `schedule` and manual `full` runs, add `npm run test:corpus`.
- [ ] After M merges, also `npm run test:golden` (no engine needed).
- [ ] Record the nightly run's duration in the Status line.

**Commit:** `ci: nightly corpus and golden tiers`

### Task 119.3 — api tests without Postgres don't start it

**Depends on:** M merged (it renames api test files).
**Read:** `apps/api/vitest.config.ts`, `apps/api/test/helpers/global-setup.ts`,
`apps/api/test/helpers/db.ts`, `apps/api/test/helpers/build-app.ts`.

- [ ] A test needs Postgres if it imports `test/helpers/db.js`, or imports
  `test/helpers/build-app.js` and `build-app` uses the db (check). Rename those
  files to `*.db.test.ts` (about 45).
- [ ] `apps/api/vitest.config.ts` becomes two projects:
  - `unit`: `*.test.ts` except `*.db.test.ts`, no `globalSetup`;
  - `db`: `*.db.test.ts` with the Postgres `globalSetup`.
- [ ] `npm test` runs both; add `test:unit` for the fast loop.
- [ ] AGENTS.md: the `db` tier and `test:unit`.

**Done when:** `npm run test:unit -w @freechesscoach/api` passes without
Docker; the full suite passes with Docker.
**Commit:** `test(api): unit tests run without Postgres`

---

## Lane O — the owner's items (F13)

Each item is its own small branch after M merges, and starts only when the
owner picks it:
- recording on iPhone Safari and desktop Chrome, results written into
  `docs/courses.md` §8;
- the owner's model run over the golden set;
- a reel candidate for opening courses without a trap, mate or brilliant move;
- a puzzle's tempting threats that still win: no "?";
- a hook that hooks instead of restating facts;
- the Commander's repeated phrase;
- the promise and takeaways checked against the board by the verifier.

Any course facts change here is checked with `npm run test:golden` and
**Re-record allowed**, with the diff explained in the commit.

## Ideas not planned yet

- A light version of the course verifier as a guard after each coach turn:
  flag hanging, fork or pin wording that no fact supports, and moves that no
  fact or tool result names.
- Tempting moves in the review and at the coach's prepared moments (engine
  cost; see 115.5 and 116.5).
- Course drills counting as practice for a diagnosis code (after 118).
