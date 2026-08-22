# Chess AI Coach — Game Report Implementation Plan

**Source spec:** `docs/algorith.md` (chess.com-style Game Review reproduction).
It is long (~930 lines) and most of it is irrelevant to any single task — do
**not** read it end-to-end and do not open it for work outside this plan.
Every task below has its own **Read:** line naming the exact subsection
(e.g. "§5.5 only") that task needs; read only that. Tag legend used in those
sections: 🟢 exact published formula, 🟡 reverse-engineered (keep constants in
config), 🔴 heuristic (needs calibration, §10 there).

**Why this file exists:** Phases 0–9 (the original build) are done and this
plan continues that numbering. Everything below is genuinely new work — a
`git grep -i accuracy` across `apps/` and `packages/` today returns nothing;
there is no opening book, no SEE, no phase segmentation, no scores, no rating
estimate. `packages/chess-analysis/src/classify.ts` does per-move quality
tiers today, but on a **different formula** (expected-points-loss thresholds:
brilliant/best/good/interesting/dubious/mistake/miss/blunder) than the spec's
win%-drop + CAPS-style accuracy system (book/forced/brilliant/great/best/
excellent/good/inaccuracy/mistake/miss/blunder). Phase 15 reconciles the two;
until then they coexist.

**What already exists and is reused as-is (verified in code, not assumed):**
- `EngineEval.lines[].cp` is **already stored White-perspective** — `services/engine/src/uci.ts`
  multiplies UCI's side-to-move-relative score by `mover === 'white' ? 1 : -1`
  before it ever reaches the DB. §1.2's sign bug does not exist here; Task
  10.1 only adds the regression-guard assertion the spec asks for.
- `computePositionFeatures(fen)` (`position-features.ts`) is **pure and
  engine-independent** — it already computes forks, hangingPieces, mobility,
  controlledSquares, centerControlScore, openFiles/semiOpenFiles,
  doubledPawns/isolatedPawns/passedPawns, captureOpportunities,
  piecesUnderAttack/underDefendedPieces/overloadedDefenders. It is called
  today only on the **interactive** single-position path
  (`analyzePositionDetailed` in `services/engine/src/analyze.ts`), never on
  the **batch** whole-game path (`analyzeGame`/`classifyMoves`). Since it
  needs nothing but a FEN, wiring it into the batch path (Phase 12) costs no
  extra engine calls — this satisfies most of §1.3's "what must be added"
  for free.
- `diffPositionFeatures` (`diff-features.ts`) already produces
  `newForks`/`newHangingPieces`/`mobilityDelta` in exactly the vocabulary
  §7.2/§7.3 use — currently wired only into the coach's candidate-move
  annotator (`candidate-moves.ts`), not the batch pipeline.
- `all.tsv` (repo root) is the **already-built** `lichess-org/chess-openings`
  dataset — `eco`, `name`, `pgn`, **and** `uci`, `epd` columns are present, so
  the "run the build yourself" step in §12.1 is already done; only the index
  build (§12.2) remains.
- No real **SEE** exists. `isSacrifice`/`hangsPiece` (classify.ts) and
  `captureOpportunities`/`forks` `favorable` (piece-safety.ts/tactics.ts) are
  one-ply attacker/defender-count heuristics, not a capture-sequence walk.
  Brilliant detection (§5.5) is load-bearing on real SEE — build it once,
  reuse everywhere.

**Layering reminder (AGENTS.md):** all formulas below are pure and belong in
`packages/chess-analysis`; new persisted shapes are zod schemas in
`packages/shared`; DB access stays in `apps/api/src/db/repositories/`; the
extra engine call for Brilliant soundness (§5.5 B6) is the one piece of I/O
that can't be pure — it lives in a service, not in chess-analysis.

---

## Phase 10 — Foundations (small, unblocks everything else)

### Task 10.1: Sign-convention regression guard

**Read:** `docs/algorith.md` §1.2 only.

**Files:** `packages/chess-analysis/src/assert-eval-sign.ts` + test; call site
in the batch job (`apps/api/src/services/analysis.ts`).

- [x] Write a function `assertEvalSignConvention(fen, lines)` implementing
      the §1.2 check (black-to-move → `lines[0].cp <= lines[1].cp`; white →
      `>=`) — throws a descriptive error rather than silently proceeding.
- [x] Unit tests: a correctly-ordered white-to-move and black-to-move eval
      each pass; a deliberately-flipped fixture of each throws.
- [x] Call it once per stored `EngineEval` in `analyzeInChunks`
      (`apps/api/src/services/analysis.ts`) — cheap, catches an engine/parser
      regression at ingest instead of downstream as "plausible garbage".
- [x] Commit: `feat: assert engine eval sign convention at ingest`.

### Task 10.2: Relocate the opening dataset

**Read:** `docs/algorith.md` §12.1 only.

**Files:** move `all.tsv` → `packages/chess-analysis/data/openings.tsv`;
add `packages/chess-analysis/data/README.md` recording the dataset's source
(`lichess-org/chess-openings`), that it's pre-built (has `uci`/`epd`), and —
important per §12.1 — **pin a version**: since we don't know which upstream
commit produced this exact file, record today's date as the pin and note
that a future refresh should record the new source commit SHA at that time.

- Rationale for this location over root: it's chess domain data consumed by
  a pure indexing function that will live in this package (§12.2); every
  other repo-root file is tooling config, not data. `packages/*` has no I/O
  at runtime, but a checked-in data *fixture* consumed by an offline build
  script (Phase 11) is the same pattern `apps/api/test/helpers` already uses
  for fixtures — it's fine for it to sit inside a package tree.
- [x] `git mv all.tsv packages/chess-analysis/data/openings.tsv`.
- [x] Update `.gitignore`/lint globs if anything currently excludes `*.tsv`.
- [x] Delete the stray `docs/algorith.md` typo duplicate check — N/A, keep
      `docs/algorith.md` filename as-is (already referenced in this plan).
- [x] Commit: `chore: relocate opening dataset into chess-analysis package`.

---

## Phase 11 — Opening book index & runtime lookup

Nothing downstream (book classification, opening phase, opening score,
opening name in the UI) can start until this phase's runtime lookup exists.

### Task 11.1: `positionKey` — EPD normalization

**Read:** `docs/algorith.md` §12.3 only.

**Files:** `packages/chess-analysis/src/opening-book-key.ts` + test.

- [x] Implement `positionKey(fullFen: string): string` exactly per §12.3:
      drop halfmove/fullmove clocks; drop the en-passant field unless a legal
      en-passant capture actually exists in the position (verify against the
      installed chess.js version's EP-flagging behavior — don't trust the
      spec's comment blindly).
- [x] Unit test: the §12.3 vector — after `1.e4 e5 2.Nf3 Nc6 3.d4`, the key's
      EP field must be `-`, not `d3`.
- [x] Unit test: a position with a genuinely legal EP capture keeps the
      square.
- [x] Commit: `feat: opening-book position key with EP normalization`.

### Task 11.2: Offline index build script

**Read:** `docs/algorith.md` §12.2 only.

**Files:** `packages/chess-analysis/scripts/build-opening-book.mjs` (I/O
lives in a script, not in package `src/`, matching
`services/engine/scripts/bundle.mjs` / `apps/api/scripts/bundle.mjs`);
output: `packages/chess-analysis/src/generated/opening-book-index.json`
(checked into git — deterministic, small, versioned with the dataset it was
built from; regenerate only when `data/openings.tsv` or this script changes).

- [x] Script reads `data/openings.tsv`, walks each row's `pgn` with
      `chess.js`, builds `bookIndex: Record<PositionKey, BookEntry[]>` (san,
      uci, eco, name; dedupe by san within a key) and `nameIndex:
      Record<PositionKey, {eco, ecoVolume, name, ply}>` (terminal position of
      each row, keeping the deepest ply on collision) — per §12.2. No 24-ply
      cap on the build.
- [x] `ecoVolume` derives from `eco[0]` (A–E).
- [x] Add an npm script (`build-book` on `packages/chess-analysis`) and add
      it to root `README`/AGENTS.md commands section describing when to
      re-run it (dataset refresh only, not every build).
- [x] Sanity-check the output: expect on the order of a few thousand unique
      position keys given `openings.tsv`'s ~3.8k rows (not the ~18k the spec
      quotes for the full multi-volume set with denser transposition
      coverage — this file already looks like the merged `a+b+c+d+e.tsv`, so
      just assert the count is non-trivial and stable, don't hardcode an
      exact number in a test).
- [x] Run once, commit the generated JSON: `feat: build opening book index from lichess dataset`.

### Task 11.3: Runtime book lookup

**Read:** `docs/algorith.md` §12.4–§12.6 only.

**Files:** `packages/chess-analysis/src/opening-book.ts` + test. Imports the
generated JSON directly (`import bookData from './generated/opening-book-index.json'`)
— esbuild inlines JSON imports by default, so this ships inside
`dist-bundle/{server,worker}.mjs` automatically; **no Dockerfile change
needed** (verified against `apps/api/scripts/bundle.mjs` — first-party
imports are bundled, not left external).

- [x] `inBookWalk(positions: {fen, moveSan, mover}[]): PerPlyBookResult[]` —
      §12.4: walks plies in order, flips `inBook = false` permanently once
      either side deviates, returns per-ply `{classification: 'book' |
      undefined, leftBook?: {ply, played, alternatives}}` plus
      `lastBookPly: {white, black}`.
- [x] `resolveOpening(positionKeys: string[]): {eco, ecoVolume, name, family,
      variation, ply} | null` — §12.5 deepest-match-wins (search backwards
      from `min(length-1, 30)`), split `name` on `': '` into family/variation.
- [x] Tests: a known Sicilian Najdorf PGN resolves the deepest named line,
      not "Sicilian Defense"; a transposed move order (`1.Nf3 d5 2.d4 Nf6
      3.c4` vs. QGD order) resolves to the same key/name; a game that leaves
      book at move 6 reports `leftBookPly`/`leftBookMove`/`bookAlternatives`
      correctly for both colors independently.
- [x] Commit: `feat: opening book runtime lookup (book detection, opening name)`.

### Task 11.4: Wire book info into the analyze-game job

**Read:** `docs/algorith.md` §12.7 only (§12.4 was already read in Task 11.3).

**Files:** modify `apps/api/src/services/analysis.ts`; new migration
`00xx_book_report.ts` (adds a `book_report` jsonb column, or folds into the
Phase 16 `game_report` column if that lands first — sequence these together
if convenient).

- [ ] Call `inBookWalk`/`resolveOpening` after `classifyMoves` in
      `runAnalyzeGameJob`, using the parsed game's FENs.
- [ ] Persist the `BookReport`/`PlayerBookReport` shape from §12.7 (add to
      `packages/shared/src/analysis.ts` as zod schemas first).
- [ ] Integration test (`apps/api/src/services/analysis.test.ts`): a fixture
      PGN with a known named opening produces the expected `eco`/`name`/
      `lastBookPly`.
- [ ] Verify the shipped artifact: after `npm run bundle -w apps/api`, grep
      `dist-bundle/worker.mjs` for a known opening name string to confirm the
      JSON asset actually got inlined (one-time manual check, not a
      permanent test — but worth a comment in the bundle script or this plan
      recording that it was checked).
- [ ] Commit: `feat: detect opening book moves and name during game analysis`.

---

## Phase 12 — Win% core primitives

Pure math, no I/O, fully spec'd (🟢/🟡) — the highest-confidence phase to
implement and the one to get exactly right before anything downstream uses it
(§10 step 3: "if game accuracy is off, the bug is here, not in the
constants").

### Task 12.1: `toCpWhite` + `winPctWhite` + `winPctFor`

**Read:** `docs/algorith.md` §2.1–§2.2 only.

**Files:** `packages/chess-analysis/src/win-probability.ts` + test.

- [ ] `toCpWhite(evalObj: {cp, mateIn}): number` — §2.1 mate folding
      (`MATE_BASE=2000`, `CP_CLAMP=2000`).
- [ ] `winPctWhite(cpWhite: number): number` — §2.2, constant `0.00368208`
      untouched. Unit tests: reproduce the §2.2 reference table to 2 decimals
      exactly (0→50.00 … 2000→99.94).
- [ ] `winPctFor(color, cpWhite): number` — per-colour mirror.
- [ ] Commit: `feat: win probability primitives (win%, mate folding)`.

### Task 12.2: `moveAccuracy`

**Read:** `docs/algorith.md` §3 only.

**Files:** `packages/chess-analysis/src/accuracy-curve.ts` + test.

- [ ] `moveAccuracy(drop: number): number` — §3 formula, clamped [0,100].
      Unit tests reproduce the §3 reference table to 2 decimals (0→100.00 …
      70→0.00 clamped).
- [ ] Commit: `feat: per-move accuracy curve`.

### Task 12.3: Per-ply win% series and per-move drop

**Read:** `docs/algorith.md` §2.3–§2.4 only.

**Files:** `packages/chess-analysis/src/move-metrics.ts` + test. This
replaces `classify.ts`'s ad-hoc `cpLoss`/`epLoss` computation as the single
source of truth every downstream phase reads from — `classify.ts` itself is
refactored onto it in Phase 15, not touched yet here.

- [ ] `buildWinPctSeries(evals: EngineEval[]): number[]` — §2.3, one entry
      per position (`N+1` for `N` plies), each `winPctWhite(toCpWhite(eval))`.
      Test: does **not** substitute a previous position's PV eval for the
      next position's own eval (the exact bug the spec calls out) — assert by
      fixture where they'd differ if the bug were present.
- [ ] `computeMoveDrop(before: number, after: number, mover): number` — §2.4,
      `max(0, before - after)` in mover's win% terms.
- [ ] `MoveMetrics = {ply, cpBeforeWhite, cpAfterWhite, winPctBefore,
      winPctAfter, drop, accuracy}[]` assembling the above plus
      `moveAccuracy(drop)` per ply — this is the `cpBefore`/`cpAfter`/
      `winPctBefore`/`winPctAfter`/`drop`/`accuracy` fields of §9's
      `MoveReport`.
- [ ] Commit: `feat: per-move win% series and drop/accuracy metrics`.

---

## Phase 13 — SEE (Static Exchange Evaluation)

Standalone, spec-mandated, load-bearing for Brilliant. Build and test it in
isolation before anything else depends on it.

### Task 13.1: SEE core

**Read:** `docs/algorith.md` §1.3, the "SEE contract" code block only — skip
the rest of §1.3 (that's Task 14.1's).

**Files:** `packages/chess-analysis/src/see.ts` + test.

- [ ] `see(fen, targetSquare, sideToMove): number` — §1.3 contract: full
      capture sequence on `targetSquare`, least-valuable-attacker first each
      side, either side free to stand pat. Piece values as specified
      (P100/N320/B330/R500/Q900/K20000).
- [ ] `seeOnAllOpponentCaptures(fenAfterMove, movingColor): number` — most
      negative SEE the opponent can obtain against the mover; the "is my
      piece really hanging" test §5.5 B5 needs.
- [ ] Unit tests on known exchange sequences: simple even trade (0), a
      piece defended once attacked twice (attacker wins the exchange), a
      piece defended by a lower-value piece behind a higher one (attacker
      should stand pat after the first capture — the classic SEE
      correctness case), an undefended hanging piece (full value).
- [ ] Commit: `feat: static exchange evaluation`.

---

## Phase 14 — Batch pipeline enrichment (features, move flags, legal move count)

Everything here is free per §1.3's own accounting — no new engine calls
except Task 14.3, which is scoped narrowly.

### Task 14.1: Per-ply features and move flags in the batch job

**Read:** `docs/algorith.md` §1.3, the "What must be added" table only — skip
the SEE contract block (already read in Task 13.1).

**Files:** modify `apps/api/src/services/analysis.ts` (or extract a new
`enrich-positions.ts` service if `analysis.ts` would cross the ~200-line
guideline); reuses `computePositionFeatures`, `diffPositionFeatures`
(existing), plus new small pure helpers.

- [ ] New pure helper in `packages/chess-analysis`:
      `moveFlags(fenBefore, moveSan): {isCapture, isCheck, isPromotion,
      isCastle, movedPieceType, capturedPieceType, legalMoveCount}` — all
      derivable from a `chess.js` move object + `moves().length`, per §1.3's
      table.
- [ ] New pure helper: `phaseUnits(fen): number` and `nonPawnMaterial(fen):
      {white, black}` — §6.2's material-based phase signal, derived from FEN.
- [ ] In the batch job, compute `PositionFeatures` for every position (one
      call per FEN, already free) and `moveFlags` for every played move; wire
      `diffPositionFeatures` between consecutive positions to get
      `newForks`/`newHangingPieces`/`mobilityDelta` per move — the exact
      inputs §7.2/§7.3's tactics/strategy evidence need.
- [ ] Decide storage shape now (used by every later phase): a parallel
      per-ply enrichment array stored alongside `engineEvals`/
      `classifiedMoves`, or folded directly into an expanded
      `ClassifiedMove`. Recommend folding in — Phase 15 already needs to
      extend `ClassifiedMove` to `MoveReport` shape, do both extensions in
      one schema pass rather than two.
- [ ] Test: a fixture game's enrichment includes a known fork/hanging-piece
      delta at a known ply.
- [ ] Commit: `feat: compute position features and move flags in batch analysis`.

### Task 14.2: `castledPly` / `developedPieces`

**Read:** `docs/algorith.md` §7.1, the `developmentScore` bullet list only.

**Files:** `packages/chess-analysis/src/opening-development.ts` + test.

- [ ] `castledPly(positions, color): number | null` and
      `developedMinorPieceCount(fen, color): number` — derived from the move
      list / FEN, feeding §7.1's `developmentScore`.
- [ ] Commit: `feat: opening development signals (castling, piece development)`.

### Task 14.3: Opponent-reply eval for Brilliant candidates only

**Read:** `docs/algorith.md` §5.5, the `B6` bullet only.

**Files:** new service `apps/api/src/services/brilliant-soundness.ts`; called
from the classification step in Phase 15, not from `analysis.ts` directly (keeps
`analysis.ts` from growing a chess-judgment responsibility it shouldn't have).

- [ ] Pure candidate pre-filter lives in chess-analysis (Phase 15, B1–B5/B7/B8
      of §5.5); only B6 (soundness after the opponent's actual best reply)
      needs a live engine call, and only for moves that already passed every
      other Brilliant gate — this is the "1 extra shallow engine call...only
      for Brilliant candidates" the spec budgets for, and it must stay that
      narrow or game analysis time balloons.
- [ ] `checkBrilliantSoundness(engine, fenAfterMove, mover, beforeWin):
      Promise<boolean>` — one `analyzePosition` call at the same depth, feed
      the result's best line back through `winPctFor`.
- [ ] Test with a mocked engine backend (existing pattern —
      `apps/api/src/services/analysis.test.ts` already mocks
      `analyzeGamePositions`): a candidate whose reply holds the win%
      threshold passes; one that doesn't gets rejected.
- [ ] Commit: `feat: brilliant-move soundness check via targeted engine reply`.

---

## Phase 15 — Move classification overhaul

This is "top of mind" — the piece the user called out explicitly. Replaces
`classify.ts`'s tier system with the spec's decision order. Highest-blast-radius
phase: touches the shared `MoveQuality` enum and every UI consumer.

### Task 15.1: Extend shared schemas to the `MoveReport` shape

**Read:** `docs/algorith.md` §9 (the `MoveReport` interface) and §5.9
(`ClassificationCounts`) only.

**Files:** `packages/shared/src/analysis.ts`.

- [ ] Replace `MOVE_QUALITIES` with the spec's §5 label set: `brilliant,
      great, best, excellent, good, book, inaccuracy, mistake, miss, blunder,
      forced` (drops `interesting`/`dubious`, adds `great`, `excellent`,
      `book`, `inaccuracy`, `forced`). Update `MOVE_QUALITY_SYMBOLS`
      accordingly (chess.com's own glyphs: `!!`, `!`, best has none/★ per
      current convention — keep a symbol for every tier, decide gaps here
      rather than leaving TODOs).
- [ ] Extend `ClassifiedMoveSchema` → effectively §9's `MoveReport`: add
      `moveNumber`, `fenBefore`, `fenAfter`, `cpBefore`, `cpAfter`,
      `winPctBefore`, `winPctAfter`, `drop`, `accuracy`, `underlyingSeverity?`,
      `phase`, `isTacticalPosition`, `bestMoveSan`, `bestLinePvSan`,
      `alternatives`, `reasons`. Keep `moveSan`/`uci`/`mover`/`isUserMove`
      field names as they exist today rather than renaming to the spec's
      exact casing where it'd churn every consumer for no behavioral gain
      (e.g. keep `mover` not `color` if that's simpler — note the mapping
      explicitly in a comment so `docs/algorith.md` §9 and this schema stay
      cross-referenceable).
- [ ] Schema tests: valid fixture round-trips; an unknown quality value is
      rejected.
- [ ] Commit: `feat: extend move schema to full move-report shape`.

### Task 15.2: Decision-order classifier

**Read:** `docs/algorith.md` §5.1–§5.8 in full — this task's core spec, no
shortcut available. (§5.4 is optional/flagged — read it but it's a stretch
goal, not required for this task's tests to pass.)

**Files:** small named functions, one file per decision per the golden-rule
("small named functions over nested conditionals" / "one responsibility per
file"):
- `packages/chess-analysis/src/classify-severity.ts` (§5.2 base tiers + §5.3
  damping — the "still winning/already lost/dead-drawn" caps)
- `packages/chess-analysis/src/classify-brilliant.ts` (§5.5 B1–B8, using
  `see.ts` from Phase 13 and the soundness check's *result*, passed in — this
  file itself makes no engine call)
- `packages/chess-analysis/src/classify-great.ts` (§5.6 G1–G4)
- `packages/chess-analysis/src/classify-miss.ts` (§5.8 M1–M4 re-label)
- `packages/chess-analysis/src/classify-move.ts` (orchestrator: §5.1's exact
  decision order, book → forced → brilliant → great → best → severity tier →
  miss re-label)

- [ ] Each file: failing tests first, from the spec's own "rejected cases to
      unit-test" call-outs (§5.5: recaptures, exchange sacs that immediately
      win the piece back, sacrifices at +8, desperado in lost positions,
      defended-piece false positives; §5.3: verify a +9.0 → +4.0 move is
      **not** a blunder — this exact case is in the §13 checklist, make it a
      literal test).
- [ ] Rarity checks as tests where feasible: run the classifier over a corpus
      of already-imported real games (if any exist in a dev DB / fixture set)
      and assert brilliant frequency stays under roughly 1-in-60 games,
      great around 1-per-3–4 — soft/advisory assertions (log, don't hard-fail
      CI on a heuristic target), revisited for real in Phase 20 (calibration).
- [ ] `classifyMove` orchestrator replaces the current `classifyMove` in
      `classify.ts` — `classify.ts` becomes a thin re-export or is deleted in
      favor of the new module, decide during implementation which reads
      cleaner; `classifyMoves`/`classifyLiveMove`'s call sites
      (`apps/api/src/services/analysis.ts`, the live-move interactive path)
      switch to the new orchestrator.
- [ ] Commit per file (5 commits), each `feat: <tier> move classification`.

### Task 15.3: Reasons generation

**Read:** `docs/algorith.md` §11 only.

**Files:** `packages/chess-analysis/src/move-reasons.ts` + test.

- [ ] `buildReasons(move, delta, features, ...): string[]` — §11's trigger
      table, capped at 2 reasons, priority order `mate > material > tactical
      motif > structural > mobility`.
- [ ] Deterministic — no LLM at render time, per the spec's explicit
      instruction. Tests: each trigger row produces its exact template
      output; a move matching 3+ triggers returns only the top 2 by priority.
- [ ] Commit: `feat: deterministic per-move coaching reasons`.

### Task 15.4: Reconcile UI consumers

**Read:** no `docs/algorith.md` read needed — pure UI wiring against the
schema Task 15.1 already extended.

**Files:** `apps/web/src/features/session/liveMoveQualities.ts`,
`SessionBoardColumn.tsx`, `apps/web/src/features/board/{MoveStrip,
MoveExplorer, GameEvalChart, EvalBar}.tsx` and their tests.

- [ ] Update every `MoveQuality`-keyed lookup/switch for the new label set
      (`great`, `excellent`, `book`, `inaccuracy`, `forced` added;
      `interesting`/`dubious` removed — grep for those two literals across
      `apps/web/src` to find every reference before deleting).
- [ ] Surface `reasons` in the move detail view (short list, per §11's
      "show at most two" — no ordering logic needed client-side, the array
      already arrives pre-ordered).
- [ ] Existing component/unit tests updated to the new fixtures; run
      `npm run typecheck` on `apps/web` — the enum change should make the
      compiler find every stale reference.
- [ ] Old analyses in the DB (`classifiedMoves` jsonb) were written with the
      old shape. Decide and document the migration story: simplest is "not
      backward compatible — the UI reads whatever shape is stored, so old
      analyses render best-effort or the game gets a `re-analyze` action";
      given this is a personal-use app (not a public product with a large
      analysis corpus), a hand-triggered re-analysis of existing games is
      almost certainly cheaper than a JSONB backfill migration — confirm this
      call explicitly rather than silently leaving old rows to render wrong.
- [ ] Commit: `feat: update move-quality UI for new classification labels`.

---

## Phase 16 — Game accuracy aggregation (CAPS-style) and phase segmentation

### Task 16.1: Volatility weights and the two-mean aggregate

**Read:** `docs/algorith.md` §4 only.

**Files:** `packages/chess-analysis/src/game-accuracy.ts` + test.

- [ ] `volatilityWeights(winPctSeries, moverPlies): number[]` — §4.1, window
      size `clamp(ceil((N+1)/10), 2, 8)`, population stdev, clamp `[0.5,12]`.
- [ ] `aggregateAccuracy(accs, weights): number` — §4.2/§4.3: weighted mean,
      harmonic mean, `clamp((weighted+harmonic)/2, 0, 100)`, 1 decimal.
- [ ] Edge cases from §4.4 as explicit tests: 0 moves → `null`; 1 move →
      that move's own accuracy; book moves included at 100% unless the
      engine says the book move loses ≥10 win% (real drop used instead);
      forced (1-legal-move) moves included, not excluded.
- [ ] Commit: `feat: CAPS-style game accuracy aggregation`.

### Task 16.2: Phase boundaries

**Read:** `docs/algorith.md` §6.1–§6.3 only.

**Files:** `packages/chess-analysis/src/phase-segmentation.ts` + test.

- [ ] `openingEndPly(lastBookPly): number` — §6.1 (book-derived, fallback 10,
      cap 30).
- [ ] `endgameStartPly(positions): number | null` — §6.2, using `phaseUnits`
      from Task 14.1, monotone, threshold `10` kept in the config object
      (Phase 18).
- [ ] Guards from §6.3 as tests: `endgameStartPly > openingEndPly` forced
      when material vanishes inside book; a phase with zero moves for a
      colour is `null` not `0`; 1–2 move phases carry `lowConfidence: true`.
- [ ] Sanity-check table from §6.2 (Q vs Q → endgame, Q+R vs Q+R → not, etc.)
      as literal test fixtures.
- [ ] Commit: `feat: opening/middlegame/endgame phase segmentation`.

### Task 16.3: Phase accuracy

**Read:** `docs/algorith.md` §6.4 only.

**Files:** `packages/chess-analysis/src/phase-accuracy.ts` + test.

- [ ] `phaseAccuracy(colour, phase, moves, fullGameWeights): number | null` —
      §6.4, restricted to that phase's plies but weights come from the
      **full-game** series (explicitly not recomputed per phase — test this
      distinction directly, it's easy to get backwards).
- [ ] Commit: `feat: per-phase accuracy`.

---

## Phase 17 — Opening / Tactics / Strategy / Endgame scores

All 🔴 — implement per spec, flag clearly as calibration targets (Phase 20),
don't hand-tune weights without ground truth.

### Task 17.1: Opening score

**Read:** `docs/algorith.md` §7.1 only.

**Files:** `packages/chess-analysis/src/opening-score.ts` + test.
- [ ] `bookDepthScore`, `developmentScore` (using Task 14.2's
      castledPly/developedMinorPieceCount + existing
      centerControlScore/controlledSquares), `openingScore` per §7.1's
      weighted sum.
- [ ] Commit: `feat: opening score`.

### Task 17.2: Tactics score

**Read:** `docs/algorith.md` §7.2 only.

**Files:** `packages/chess-analysis/src/tactics-score.ts` + test.
- [ ] `isTacticalPosition(analysis, mover): boolean` — §7.2's seven-clause OR,
      reusing MultiPV gap (already computed for Great's G3), `features.*`
      (already computed per Task 14.1), SEE (Phase 13) for the
      "capture with SEE ≥ 0" clause.
- [ ] `tacticalEvidence`/`tacticsScore` per §7.2, using `diffPositionFeatures`
      deltas already threaded through in Task 14.1.
- [ ] `< 4` tactical positions for the colour → `null` with reason, per spec
      — test this guard explicitly.
- [ ] Commit: `feat: tactics score`.

### Task 17.3: Strategy score

**Read:** `docs/algorith.md` §7.3 only.

**Files:** `packages/chess-analysis/src/strategy-score.ts` + test.
- [ ] `positionalTrend` — §7.3's five weighted deltas
      (pawnStructure/space/files/centre/kingSafety), all already available
      from `PositionFeatures` at `openingEndPly` vs. the final/decisive
      position.
- [ ] `strategyScore = clamp(quietAccuracy + positionalTrend, 0, 100)`, same
      `< 4` quiet-position `null` guard as tactics.
- [ ] Commit: `feat: strategy score`.

### Task 17.4: Endgame score

**Read:** `docs/algorith.md` §7.4 only.

**Files:** `packages/chess-analysis/src/endgame-score.ts` + test.
- [ ] `conversionScore` per §7.4's win%-at-`endgameStartPly` × actual result
      table; `endgameScore = 0.7*phaseAccuracy + 0.3*conversionScore`;
      `null` if the game never reached the endgame phase.
- [ ] Commit: `feat: endgame score`.

---

## Phase 18 — Rating estimation

### Task 18.1: Elo anchor interpolation + error-rate cross-check

**Read:** `docs/algorith.md` §8.1–§8.3 only.

**Files:** `packages/chess-analysis/src/rating-estimate.ts` + test.
- [ ] `accuracyToElo(accuracy): number` — §8.2 piecewise-linear over the
      anchor table, clamp `[100,3200]`, flat extrapolation outside the table.
- [ ] `errorRating(counts, movesPlayed): number` — §8.3.
- [ ] `raw = 0.65*accuracyRating + 0.35*errorRating` — §8.3.
- [ ] Commit: `feat: rating estimate — accuracy anchor and error-rate cross-check`.

### Task 18.2: Complexity adjustment, shrink-to-prior, guard rails

**Read:** `docs/algorith.md` §8.4–§8.6 only.

**Files:** same file, continued.
- [ ] `complexity` from mean volatility (§8.4); `estimate`/`range` via the
      shrink-toward-prior formula (§8.5), rounded to nearest 25; `null` (with
      reason) when `movesPlayed < 12`.
- [ ] Guard rails (§8.6): cap `prior + 600` when a prior exists; subtract
      forced-sequence plies (>8 consecutive) from `movesPlayed`.
- [ ] Where does `prior` come from? Wire to the existing user rating field
      (`apps/api/src/services/user-profile.ts` / `packages/shared/src/user.ts`
      already has a rating concept — confirm its exact field name and units
      before wiring, don't assume) — falls back to 1200 when absent.
- [ ] Tests: the §8 worked examples (movesPlayed<12 → null; low-nEff game
      capped near prior; a 15-move miniature with an opponent blunder doesn't
      report 2800).
- [ ] Commit: `feat: rating estimate — complexity, prior shrinkage, guard rails`.

---

## Phase 19 — Output schema, config object, and pipeline wiring

### Task 19.1: `GameReport`/`PlayerReport` zod schemas

**Read:** `docs/algorith.md` §9 only.

**Files:** `packages/shared/src/analysis.ts` (or split into
`packages/shared/src/game-report.ts` if `analysis.ts` would cross the
200-line guideline — check current length before deciding).
- [ ] Schemas per §9, reusing the `MoveReport` shape already landed in Task
      15.1 for `moves`.
- [ ] `ClassificationCounts` (§5.9) — `miss` counted only under `miss`,
      `underlyingSeverity` kept separate; accuracy math always reads raw
      `drop`, never the label — assert this with a test (a `miss`-labeled
      move's accuracy still reflects its actual drop, not a miss-specific
      penalty).
- [ ] Commit: `feat: game report output schema`.

### Task 19.2: Single tunable-constants config object

**Read:** no `docs/algorith.md` read needed — this consolidates constants
already implemented in Phases 12–18, no new formula content.

**Files:** `packages/chess-analysis/src/config.ts`.
- [ ] Pull every magic number introduced across Phases 12–18 (accuracy curve
      constant, aggregation window/clamp bounds, severity tier cutoffs,
      damping thresholds, Brilliant SEE threshold, Great gap threshold, phase
      unit threshold, rating anchor table, error-rate weights, shrink `k`)
      into one exported object. Downstream modules import from here instead
      of hardcoding — recalibration (Phase 20) becomes a data change.
- [ ] This is a refactor of code written earlier in this plan, not new logic
      — do it as its own pass once Phases 12–18 are green, not
      incrementally (fighting merge churn against tests that reference the
      old inline constants otherwise).
- [ ] Commit: `refactor: centralize game-report tunable constants`.

### Task 19.3: Wire the full pipeline

**Read:** `docs/algorith.md` §13 (checklist) only, to verify against — every
formula it references was already read in its own phase above.

**Files:** `apps/api/src/services/analysis.ts` (or a new
`apps/api/src/services/build-game-report.ts` if wiring everything here would
blow past the 200-line guideline — likely, given the phase count above);
new migration `00xx_game_report.ts` (adds `analyses.game_report jsonb`);
`apps/api/src/db/repositories/analyses.ts` gets `storeGameReport`/
`findGameReportByGameId`; new/extended route in
`apps/api/src/routes/analyses.ts`.

- [ ] Orchestrate: parse → analyze (existing) → enrich (Phase 14) → classify
      (Phase 15) → aggregate accuracy + phases (Phase 16) → scores (Phase 17)
      → rating (Phase 18) → book (Phase 11) → assemble `GameReport` (Phase
      19.1) → persist.
- [ ] Integration test: a full fixture game produces a `GameReport` with
      every field populated and internally consistent (phase accuracies
      don't need to average to game accuracy — assert they're merely
      *present*, not equal, per §6.4's explicit note).
- [ ] Determinism check (§13 checklist's last line): same PGN + same depth →
      byte-identical report — a snapshot test on one fixture game is enough
      to catch an accidental `Date.now()`/`Math.random()` creeping in.
- [ ] Commit: `feat: assemble and persist full game report`.

---

## Phase 20 — UI surfacing

### Task 20.1: Game report summary panel

**Read:** no new `docs/algorith.md` read needed — renders the §9/§8.1 fields
already read in Phases 18–19; re-check §8.1 only if the "ship a range, not a
point estimate" requirement isn't already clear from Task 18.2.

**Files:** new component(s) under `apps/web/src/features/games/` or
`apps/web/src/features/board/` (co-locate with existing move-explorer UI —
check current feature-folder boundary before choosing).
- [ ] Accuracy headline (both colours), phase accuracy breakdown, the four
      scores (opening/tactics/strategy/endgame), classification counts
      (inaccuracy/mistake/blunder/etc. — the exact ask from the user's
      original request), estimated rating **as a range**, per §8.1's explicit
      "ship a range or users lose trust" instruction — do not render a bare
      point estimate.
- [ ] Component tests with a fixture `GameReport`.
- [ ] Commit: `feat: game report summary panel`.

### Task 20.2: Alternatives + book label in the move explorer

**Read:** `docs/algorith.md` §11, closing paragraph only (already read in full
in Task 15.3 — re-open only if that context has aged out).

**Files:** `apps/web/src/features/board/MoveExplorer.tsx`,`MoveStrip.tsx`.
- [ ] Book moves show the opening name/ECO (§11's last trigger row); the
      alternatives panel shows `bestMoveSan` + PV and the two runners-up by
      win% (not raw cp) per §11's closing paragraph.
- [ ] Commit: `feat: opening labels and win%-based alternatives in move explorer`.

---

## Phase 21 — Calibration (process, not a coding task — do last)

**Read:** `docs/algorith.md` §10 in full.

Follow §10 verbatim once real analyzed games exist in numbers:
1. Collect 200–500 games with known ground truth (or the closest available
   proxy — chess.com Game Review isn't scriptably accessible at scale, so
   this may mean the user's own already-known ratings + a smaller manual
   sample rather than a bulk chess.com pull; decide the practical substitute
   when this phase starts, don't block earlier phases on it).
2. Sweep engine depth (14/16/18/20) against `ENGINE_DEFAULT_DEPTH` (currently
   16 — `packages/shared/src/constants.ts`) — note this is a shared constant
   across all three backends' caching, changing it has broader effects than
   just Game Report accuracy.
3. Validate §2–§4 to within ±1.5 accuracy points before touching any 🔴
   constant.
4. Grid-search §5.2/§5.3 thresholds.
5. Fit Brilliant/Great by rarity.
6. Regress rating anchors against known ratings last.

All fitted constants land in `packages/chess-analysis/src/config.ts` (Task
19.2) — this phase should produce no code changes outside that one file
(plus the depth constant, if changed).
