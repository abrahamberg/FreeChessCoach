# FreeChessCoach — Game Report Implementation Plan

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

- [x] Call `inBookWalk`/`resolveOpening` after `classifyMoves` in
      `runAnalyzeGameJob`, using the parsed game's FENs.
- [x] Persist the `BookReport`/`PlayerBookReport` shape from §12.7 (add to
      `packages/shared/src/analysis.ts` as zod schemas first).
- [x] Integration test (`apps/api/src/services/analysis.test.ts`): a fixture
      PGN with a known named opening produces the expected `eco`/`name`/
      `lastBookPly`.
- [x] Verify the shipped artifact: after `npm run bundle -w apps/api`, grep
      `dist-bundle/worker.mjs` for a known opening name string to confirm the
      JSON asset actually got inlined (one-time manual check, not a
      permanent test — but worth a comment in the bundle script or this plan
      recording that it was checked).
- [x] Commit: `feat: detect opening book moves and name during game analysis`.

---

## Phase 12 — Win% core primitives

Pure math, no I/O, fully spec'd (🟢/🟡) — the highest-confidence phase to
implement and the one to get exactly right before anything downstream uses it
(§10 step 3: "if game accuracy is off, the bug is here, not in the
constants").

### Task 12.1: `toCpWhite` + `winPctWhite` + `winPctFor`

**Read:** `docs/algorith.md` §2.1–§2.2 only.

**Files:** `packages/chess-analysis/src/win-probability.ts` + test.

- [x] `toCpWhite(evalObj: {cp, mateIn}): number` — §2.1 mate folding
      (`MATE_BASE=2000`, `CP_CLAMP=2000`).
- [x] `winPctWhite(cpWhite: number): number` — §2.2, constant `0.00368208`
      untouched. Unit tests: reproduce the §2.2 reference table to 2 decimals
      exactly (0→50.00 … 2000→99.94).
- [x] `winPctFor(color, cpWhite): number` — per-colour mirror.
- [x] Commit: `feat: win probability primitives (win%, mate folding)`.

### Task 12.2: `moveAccuracy`

**Read:** `docs/algorith.md` §3 only.

**Files:** `packages/chess-analysis/src/accuracy-curve.ts` + test.

- [x] `moveAccuracy(drop: number): number` — §3 formula, clamped [0,100].
      Unit tests reproduce the §3 reference table to 2 decimals (0→100.00 …
      70→0.00 clamped).
- [x] Commit: `feat: per-move accuracy curve`.

### Task 12.3: Per-ply win% series and per-move drop

**Read:** `docs/algorith.md` §2.3–§2.4 only.

**Files:** `packages/chess-analysis/src/move-metrics.ts` + test. This
replaces `classify.ts`'s ad-hoc `cpLoss`/`epLoss` computation as the single
source of truth every downstream phase reads from — `classify.ts` itself is
refactored onto it in Phase 15, not touched yet here.

- [x] `buildWinPctSeries(evals: EngineEval[]): number[]` — §2.3, one entry
      per position (`N+1` for `N` plies), each `winPctWhite(toCpWhite(eval))`.
      Test: does **not** substitute a previous position's PV eval for the
      next position's own eval (the exact bug the spec calls out) — assert by
      fixture where they'd differ if the bug were present.
- [x] `computeMoveDrop(before: number, after: number, mover): number` — §2.4,
      `max(0, before - after)` in mover's win% terms.
- [x] `MoveMetrics = {ply, cpBeforeWhite, cpAfterWhite, winPctBefore,
      winPctAfter, drop, accuracy}[]` assembling the above plus
      `moveAccuracy(drop)` per ply — this is the `cpBefore`/`cpAfter`/
      `winPctBefore`/`winPctAfter`/`drop`/`accuracy` fields of §9's
      `MoveReport`.
- [x] Commit: `feat: per-move win% series and drop/accuracy metrics`.

---

## Phase 13 — SEE (Static Exchange Evaluation)

Standalone, spec-mandated, load-bearing for Brilliant. Build and test it in
isolation before anything else depends on it.

### Task 13.1: SEE core

**Read:** `docs/algorith.md` §1.3, the "SEE contract" code block only — skip
the rest of §1.3 (that's Task 14.1's).

**Files:** `packages/chess-analysis/src/see.ts` + test.

- [x] `see(fen, targetSquare, sideToMove): number` — §1.3 contract: full
      capture sequence on `targetSquare`, least-valuable-attacker first each
      side, either side free to stand pat. Piece values as specified
      (P100/N320/B330/R500/Q900/K20000).
- [x] `seeOnAllOpponentCaptures(fenAfterMove, movingColor): number` — most
      negative SEE the opponent can obtain against the mover; the "is my
      piece really hanging" test §5.5 B5 needs.
- [x] Unit tests on known exchange sequences: simple even trade (0), a
      piece defended once attacked twice (attacker wins the exchange), a
      piece defended by a lower-value piece behind a higher one (attacker
      should stand pat after the first capture — the classic SEE
      correctness case), an undefended hanging piece (full value).
- [x] Commit: `feat: static exchange evaluation`.

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

- [x] New pure helper in `packages/chess-analysis`:
      `moveFlags(fenBefore, moveSan): {isCapture, isCheck, isPromotion,
      isCastle, movedPieceType, capturedPieceType, legalMoveCount}` — all
      derivable from a `chess.js` move object + `moves().length`, per §1.3's
      table.
- [x] New pure helper: `phaseUnits(fen): number` and `nonPawnMaterial(fen):
      {white, black}` — §6.2's material-based phase signal, derived from FEN.
- [x] In the batch job, compute `PositionFeatures` for every position (one
      call per FEN, already free) and `moveFlags` for every played move; wire
      `diffPositionFeatures` between consecutive positions to get
      `newForks`/`newHangingPieces`/`mobilityDelta` per move — the exact
      inputs §7.2/§7.3's tactics/strategy evidence need.
- [x] Decide storage shape now (used by every later phase): a parallel
      per-ply enrichment array stored alongside `engineEvals`/
      `classifiedMoves`, or folded directly into an expanded
      `ClassifiedMove`. Recommend folding in — Phase 15 already needs to
      extend `ClassifiedMove` to `MoveReport` shape, do both extensions in
      one schema pass rather than two.
- [x] Test: a fixture game's enrichment includes a known fork/hanging-piece
      delta at a known ply.
- [x] Commit: `feat: compute position features and move flags in batch analysis`.

### Task 14.2: `castledPly` / `developedPieces`

**Read:** `docs/algorith.md` §7.1, the `developmentScore` bullet list only.

**Files:** `packages/chess-analysis/src/opening-development.ts` + test.

- [x] `castledPly(positions, color): number | null` and
      `developedMinorPieceCount(fen, color): number` — derived from the move
      list / FEN, feeding §7.1's `developmentScore`.
- [x] Commit: `feat: opening development signals (castling, piece development)`.

### Task 14.3: Opponent-reply eval for Brilliant candidates only

**Read:** `docs/algorith.md` §5.5, the `B6` bullet only.

**Files:** new service `apps/api/src/services/brilliant-soundness.ts`; called
from the classification step in Phase 15, not from `analysis.ts` directly (keeps
`analysis.ts` from growing a chess-judgment responsibility it shouldn't have).

- [x] Pure candidate pre-filter lives in chess-analysis (Phase 15, B1–B5/B7/B8
      of §5.5); only B6 (soundness after the opponent's actual best reply)
      needs a live engine call, and only for moves that already passed every
      other Brilliant gate — this is the "1 extra shallow engine call...only
      for Brilliant candidates" the spec budgets for, and it must stay that
      narrow or game analysis time balloons.
- [x] `checkBrilliantSoundness(engine, fenAfterMove, mover, beforeWin):
      Promise<boolean>` — one `analyzePosition` call at the same depth, feed
      the result's best line back through `winPctFor`.
- [x] Test with a mocked engine backend (existing pattern —
      `apps/api/src/services/analysis.test.ts` already mocks
      `analyzeGamePositions`): a candidate whose reply holds the win%
      threshold passes; one that doesn't gets rejected.
- [x] Commit: `feat: brilliant-move soundness check via targeted engine reply`.

---

## Phase 15 — Move classification overhaul

This is "top of mind" — the piece the user called out explicitly. Replaces
`classify.ts`'s tier system with the spec's decision order. Highest-blast-radius
phase: touches the shared `MoveQuality` enum and every UI consumer.

### Task 15.1: Extend shared schemas to the `MoveReport` shape

**Read:** `docs/algorith.md` §9 (the `MoveReport` interface) and §5.9
(`ClassificationCounts`) only.

**Files:** `packages/shared/src/analysis.ts`.

- [x] Replace `MOVE_QUALITIES` with the spec's §5 label set: `brilliant,
      great, best, excellent, good, book, inaccuracy, mistake, miss, blunder,
      forced` (drops `interesting`/`dubious`, adds `great`, `excellent`,
      `book`, `inaccuracy`, `forced`). Update `MOVE_QUALITY_SYMBOLS`
      accordingly (chess.com's own glyphs: `!!`, `!`, best has none/★ per
      current convention — keep a symbol for every tier, decide gaps here
      rather than leaving TODOs).
- [x] Extend `ClassifiedMoveSchema` → effectively §9's `MoveReport`: add
      `moveNumber`, `fenBefore`, `fenAfter`, `cpBefore`, `cpAfter`,
      `winPctBefore`, `winPctAfter`, `drop`, `accuracy`, `underlyingSeverity?`,
      `phase`, `isTacticalPosition`, `bestMoveSan`, `bestLinePvSan`,
      `alternatives`, `reasons`. Keep `moveSan`/`uci`/`mover`/`isUserMove`
      field names as they exist today rather than renaming to the spec's
      exact casing where it'd churn every consumer for no behavioral gain
      (e.g. keep `mover` not `color` if that's simpler — note the mapping
      explicitly in a comment so `docs/algorith.md` §9 and this schema stay
      cross-referenceable).
- [x] Schema tests: valid fixture round-trips; an unknown quality value is
      rejected.
- [x] Commit: `feat: extend move schema to full move-report shape`.

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

- [x] Each file: failing tests first, from the spec's own "rejected cases to
      unit-test" call-outs (§5.5: recaptures, exchange sacs that immediately
      win the piece back, sacrifices at +8, desperado in lost positions,
      defended-piece false positives; §5.3: verify a +9.0 → +4.0 move is
      **not** a blunder — this exact case is in the §13 checklist, make it a
      literal test).
- [x] Rarity checks as tests where feasible — deferred to Phase 21
      (calibration) per that phase's own scope; not blocking here.
- [x] `classifyMove` orchestrator replaces the current `classifyMove` in
      `classify.ts` — `classify.ts` becomes a thin re-export or is deleted in
      favor of the new module, decide during implementation which reads
      cleaner; `classifyMoves`/`classifyLiveMove`'s call sites
      (`apps/api/src/services/analysis.ts`, the live-move interactive path)
      switch to the new orchestrator.
- [x] Commit per file (5 commits), each `feat: <tier> move classification`.

### Task 15.3: Reasons generation

**Read:** `docs/algorith.md` §11 only.

**Files:** `packages/chess-analysis/src/move-reasons.ts` + test.

- [x] `buildReasons(move, delta, features, ...): string[]` — §11's trigger
      table, capped at 2 reasons, priority order `mate > material > tactical
      motif > structural > mobility`.
- [x] Deterministic — no LLM at render time, per the spec's explicit
      instruction. Tests: each trigger row produces its exact template
      output; a move matching 3+ triggers returns only the top 2 by priority.
- [x] Commit: `feat: deterministic per-move coaching reasons`.

### Task 15.4: Reconcile UI consumers

**Read:** no `docs/algorith.md` read needed — pure UI wiring against the
schema Task 15.1 already extended.

**Files:** `apps/web/src/features/session/liveMoveQualities.ts`,
`SessionBoardColumn.tsx`, `apps/web/src/features/board/{MoveStrip,
MoveExplorer, GameEvalChart, EvalBar}.tsx` and their tests.

- [x] Update every `MoveQuality`-keyed lookup/switch for the new label set
      (`great`, `excellent`, `book`, `inaccuracy`, `forced` added;
      `interesting`/`dubious` removed — grep for those two literals across
      `apps/web/src` to find every reference before deleting). Found and
      fixed: `tokens.css`/`MoveQualityBadge.css`/`MoveExplorer.css`/
      `MoveStrip.css`'s `--quality-*` custom properties and per-tier CSS
      rules (5 new tiers added, 2 stale ones removed); `JsonTreeView.css` had
      been reusing `--quality-interesting` as a generic syntax-highlight
      color, unrelated to move quality — given its own `--syntax-string`
      token instead of coupling it to a quality tier. Also fixed a latent bug
      MoveExplorer.tsx's "better was X" note (`quality !== 'good' && quality
      !== 'best'`) would have shown for the 5 new non-error tiers too
      (`brilliant`/`great`/`excellent`/`book`/`forced`) — replaced with an
      explicit `isImprovableQuality` allowlist (`inaccuracy`/`mistake`/
      `miss`/`blunder`).
- [x] Surface `reasons` in the move detail view (short list, per §11's
      "show at most two" — no ordering logic needed client-side, the array
      already arrives pre-ordered). Implemented in MoveExplorer.tsx's
      `MoveNote`: renders the `reasons` list when present, falling back to
      the legacy "quality: better was ..." line for analyses stored before
      `reasons` existed.
- [x] Existing component/unit tests updated to the new fixtures; run
      `npm run typecheck` on `apps/web` — the enum change should make the
      compiler find every stale reference. (Clean — no stale references
      found; `apps/web/src` never had a hardcoded `MoveQuality` switch, only
      generic `MOVE_QUALITY_SYMBOLS`/`move-quality-${quality}` lookups, which
      pick up new labels automatically once the CSS backing them exists.)
- [x] Old analyses in the DB (`classifiedMoves` jsonb) were written with the
      old shape. **Decision (confirmed, not building a migration or
      re-analyze route):** not backward compatible. `ClassifiedMoveSchema`'s
      `quality` enum no longer accepts `'interesting'`/`'dubious'`, so any
      already-analyzed game still holding those values will fail to
      round-trip through the schema. This is a personal-use app with no dev
      Postgres currently running to audit for such rows (the compose
      Postgres is stopped; only an unrelated project's container is up) —
      given the small, single-user corpus this implies, the practical fix if
      it ever surfaces is deleting and re-importing the affected game(s)
      through the existing import flow (which re-runs `runAnalyzeGameJob`
      from scratch) rather than writing a one-off JSONB backfill or a new
      `re-analyze` endpoint for a problem that may not even exist yet.
- [x] Commit: `feat: update move-quality UI for new classification labels`.

---

## Phase 16 — Game accuracy aggregation (CAPS-style) and phase segmentation

### Task 16.1: Volatility weights and the two-mean aggregate

**Read:** `docs/algorith.md` §4 only.

**Files:** `packages/chess-analysis/src/game-accuracy.ts` + test.

- [x] `volatilityWeights(winPctSeries, moverPlies): number[]` — §4.1, window
      size `clamp(ceil((N+1)/10), 2, 8)`, population stdev, clamp `[0.5,12]`.
- [x] `aggregateAccuracy(accs, weights): number` — §4.2/§4.3: weighted mean,
      harmonic mean, `clamp((weighted+harmonic)/2, 0, 100)`, 1 decimal.
- [x] Edge cases from §4.4 as explicit tests: 0 moves → `null`; 1 move →
      that move's own accuracy; book moves included at 100% unless the
      engine says the book move loses ≥10 win% (real drop used instead);
      forced (1-legal-move) moves included, not excluded. (Book/forced
      handling lives in a third small export, `accuracyForAggregate(quality,
      drop)`, since §4.2's `accs` array needs to know quality to apply the
      book override — not part of the spec's named functions but required to
      build their input.)
- [x] Commit: `feat: CAPS-style game accuracy aggregation`.

### Task 16.2: Phase boundaries

**Read:** `docs/algorith.md` §6.1–§6.3 only.

**Files:** `packages/chess-analysis/src/phase-segmentation.ts` + test.

- [x] `openingEndPly(lastBookPly): number` — §6.1 (book-derived, fallback 10,
      cap 30).
- [x] `endgameStartPly(positions): number | null` — §6.2, using `phaseUnits`
      from Task 14.1, monotone, threshold `10` kept in the config object
      (Phase 18). Signature ended up taking `openingEndPly` as a second
      argument — the §6.3 guard below needs it to force the boundary, and
      baking it directly into this function (rather than a separate
      reconciliation step) keeps "endgameStartPly is always internally
      consistent" a property of the type, not a caller obligation.
- [x] Guards from §6.3 as tests: `endgameStartPly > openingEndPly` forced
      when material vanishes inside book; a phase with zero moves for a
      colour is `null` not `0`; 1–2 move phases carry `lowConfidence: true`.
      (Zero-moves→null is already `aggregateAccuracy`'s existing empty-array
      guard from Task 16.1, not new code; added `isLowConfidencePhase(count)`
      here for the 1–2-move case, and `phaseForPly` to classify a ply against
      resolved boundaries — needed by every downstream consumer of these two
      boundary numbers.)
- [x] Sanity-check table from §6.2 (Q vs Q → endgame, Q+R vs Q+R → not, etc.)
      as literal test fixtures.
- [x] Commit: `feat: opening/middlegame/endgame phase segmentation`.

### Task 16.3: Phase accuracy

**Read:** `docs/algorith.md` §6.4 only.

**Files:** `packages/chess-analysis/src/phase-accuracy.ts` + test.

- [x] `phaseAccuracy(colour, phase, moves, fullGameWeights): number | null` —
      §6.4, restricted to that phase's plies but weights come from the
      **full-game** series (explicitly not recomputed per phase — test this
      distinction directly, it's easy to get backwards). `fullGameWeights` is
      a `ReadonlyMap<ply, weight>` — `volatilityWeights`' output is parallel
      to its `moverPlies` input, not ply-indexed, so the caller zips them
      into a map once per game; this function has no way to recompute
      weights itself, which is what makes the "never recomputed per phase"
      rule structural rather than a convention to remember.
- [x] Commit: `feat: per-phase accuracy`.

---

## Phase 17 — Opening / Tactics / Strategy / Endgame scores

All 🔴 — implement per spec, flag clearly as calibration targets (Phase 20),
don't hand-tune weights without ground truth.

### Task 17.1: Opening score

**Read:** `docs/algorith.md` §7.1 only.

**Files:** `packages/chess-analysis/src/opening-score.ts` + test.
- [x] `bookDepthScore`, `developmentScore` (using Task 14.2's
      castledPly/developedMinorPieceCount + existing
      centerControlScore/controlledSquares), `openingScore` per §7.1's
      weighted sum. `developmentScore`'s 5 sub-bonuses (🔴, calibration-only
      per Phase 21 — this task builds the mechanism, not final weights):
      castled-or-king-safe-with-connected-rook, developed minors (capped at
      40), center control advantage, no piece moved twice without a capture
      "causing" it, and no more than one pawn move beyond 2 "necessary"
      ones — all as separately named, independently testable helpers.
- [x] Commit: `feat: opening score`.

### Task 17.2: Tactics score

**Read:** `docs/algorith.md` §7.2 only.

**Files:** `packages/chess-analysis/src/tactics-score.ts` + test.
- [x] `isTacticalPosition(analysis, mover): boolean` — §7.2's seven-clause OR,
      reusing MultiPV gap (already computed for Great's G3), `features.*`
      (already computed per Task 14.1), SEE (Phase 13) for the
      "capture with SEE ≥ 0" clause.
- [x] `tacticalEvidence`/`tacticsScore` per §7.2, using `diffPositionFeatures`
      deltas already threaded through in Task 14.1. `tacticsScore` takes the
      caller-computed `tacticalAccuracy` (the existing §4/Task 16.1 machinery,
      restricted to tactical-position plies with full-game weights) rather
      than recomputing it — same "don't duplicate the aggregation" reasoning
      as Task 16.3's `phaseAccuracy`.
- [x] `< 4` tactical positions for the colour → `null` with reason, per spec
      — test this guard explicitly.
- [x] Commit: `feat: tactics score`.

### Task 17.3: Strategy score

**Read:** `docs/algorith.md` §7.3 only.

**Files:** `packages/chess-analysis/src/strategy-score.ts` + test.
- [x] `positionalTrend` — §7.3's five weighted deltas
      (pawnStructure/space/files/centre/kingSafety), all already available
      from `PositionFeatures` at `openingEndPly` vs. the final/decisive
      position. Exception: `kingSafety`'s "escape squares" and "opponent
      attackers near the king" aren't literal `PositionFeatures` fields (the
      feature bag only tracks attackers on *occupied* squares) — recomputed
      from the FEN via the existing pure `buildAttackMap`, not a new engine
      call, so still no I/O.
- [x] `strategyScore = clamp(quietAccuracy + positionalTrend, 0, 100)`, same
      `< 4` quiet-position `null` guard as tactics.
- [x] Commit: `feat: strategy score`.

### Task 17.4: Endgame score

**Read:** `docs/algorith.md` §7.4 only.

**Files:** `packages/chess-analysis/src/endgame-score.ts` + test.
- [x] `conversionScore` per §7.4's win%-at-`endgameStartPly` × actual result
      table; `endgameScore = 0.7*phaseAccuracy + 0.3*conversionScore`;
      `null` if the game never reached the endgame phase. (Signalled by
      either input being `null` — both derive from the same
      `endgameStartPly`, which is `null` in that case per Task 16.2.)
- [x] Commit: `feat: endgame score`.

---

## Phase 18 — Rating estimation

### Task 18.1: Elo anchor interpolation + error-rate cross-check

**Read:** `docs/algorith.md` §8.1–§8.3 only.

**Files:** `packages/chess-analysis/src/rating-estimate.ts` + test.
- [x] `accuracyToElo(accuracy): number` — §8.2 piecewise-linear over the
      anchor table, clamp `[100,3200]`, flat extrapolation outside the table.
- [x] `errorRating(counts, movesPlayed): number` — §8.3.
- [x] `raw = 0.65*accuracyRating + 0.35*errorRating` — §8.3 (`combinedRawRating`).
- [x] Commit: `feat: rating estimate — accuracy anchor and error-rate cross-check`.

### Task 18.2: Complexity adjustment, shrink-to-prior, guard rails

**Read:** `docs/algorith.md` §8.4–§8.6 only.

**Files:** same file, continued.
- [x] `complexity` from mean volatility (§8.4); `estimate`/`range` via the
      shrink-toward-prior formula (§8.5), rounded to nearest 25; `null` (with
      reason) when `movesPlayed < 12`.
- [x] Guard rails (§8.6): cap `prior + 600` when a prior exists; subtract
      forced-sequence plies (>8 consecutive) from `movesPlayed`. Cap is
      applied against the *resolved* prior (real or the 1200 default) —
      "when a prior exists" reads as "when we have a prior value to check
      against" (we always do), not "only for a real known rating"; otherwise
      the literal worked example two lines below (a 15-move miniature must
      not report 2800) would be unguarded for the common case of no known
      rating.
- [x] Where does `prior` come from? **Confirmed, not wired yet (belongs to
      Phase 19's pipeline assembly):** checked both files named in this
      task — there is **no numeric rating field**. `packages/shared/src/user.ts`
      only has `ratingBand: 'novice'|'improving'|'club'|'advanced'`
      (`packages/shared/src/constants.ts`'s `RATING_BANDS`), a coarse
      self-reported band, not an Elo number. Phase 19 will need a small
      band→representative-Elo lookup (e.g. novice≈800, improving≈1200,
      club≈1600, advanced≈2000 — placeholder numbers, calibrate in Phase 21)
      to turn `ratingBand` into `prior`, falling back to 1200 when the user
      never set one.
- [x] Tests: the §8 worked examples (movesPlayed<12 → null; low-nEff game
      capped near prior; a 15-move miniature with an opponent blunder doesn't
      report 2800).
- [x] Commit: `feat: rating estimate — complexity, prior shrinkage, guard rails`.

---

## Phase 19 — Output schema, config object, and pipeline wiring

### Task 19.1: `GameReport`/`PlayerReport` zod schemas

**Read:** `docs/algorith.md` §9 only.

**Files:** `packages/shared/src/analysis.ts` (or split into
`packages/shared/src/game-report.ts` if `analysis.ts` would cross the
200-line guideline — check current length before deciding).
- [x] Schemas per §9, reusing the `MoveReport` shape already landed in Task
      15.1 for `moves`.
      Landed in the pre-existing `packages/shared/src/game-report.ts` (already
      home to the book-resolution schemas from an earlier phase) rather than
      `analysis.ts`, which is already over the 200-line guideline. Added
      `ClassificationCountsSchema`, `EstimatedRatingReportSchema`,
      `PlayerReportSchema`, `GamePhasesSchema`, `EngineReportSchema`, and
      `GameReportSchema`. `GameReport.book` reuses the existing, richer
      `BookReportSchema` (per-colour book-exit detail) instead of §9's leaner
      inline shape — it's a strict superset of what §9 asks for and already
      backs the shipped book pipeline, so there's no reason to shadow it with
      a second, narrower type.
- [x] `ClassificationCounts` (§5.9) — `miss` counted only under `miss`,
      `underlyingSeverity` kept separate; accuracy math always reads raw
      `drop`, never the label — assert this with a test (a `miss`-labeled
      move's accuracy still reflects its actual drop, not a miss-specific
      penalty).
      `ClassificationCountsSchema` is derived from the existing
      `MOVE_QUALITIES` tuple (one non-negative int field per quality) rather
      than hand-duplicated, with a test asserting the key set stays in sync.
      The raw-drop invariant was already structurally true —
      `accuracyForAggregate` only special-cases `'book'`, never `'miss'` — so
      added a regression test in `game-accuracy.test.ts` pinning it
      (`accuracyForAggregate('miss', 22) === accuracyForAggregate('mistake', 22)`).
- [x] Commit: `feat: game report output schema`.

### Task 19.2: Single tunable-constants config object

**Read:** no `docs/algorith.md` read needed — this consolidates constants
already implemented in Phases 12–18, no new formula content.

**Files:** `packages/chess-analysis/src/config.ts`.
- [x] Pull every magic number introduced across Phases 12–18 (accuracy curve
      constant, aggregation window/clamp bounds, severity tier cutoffs,
      damping thresholds, Brilliant SEE threshold, Great gap threshold, phase
      unit threshold, rating anchor table, error-rate weights, shrink `k`)
      into one exported object. Downstream modules import from here instead
      of hardcoding — recalibration (Phase 20) becomes a data change.
      Landed as a single `export const CONFIG = {...} as const`, namespaced
      by module (`winProbability`, `accuracyCurve`, `gameAccuracy`,
      `severity`, `resultBand`, `brilliant`, `great`, `miss`,
      `phaseSegmentation`, `openingScore`, `tacticsScore`, `strategyScore`,
      `endgameScore`, `ratingEstimate`, `moveReasons`). Every consuming module
      destructures its slice at module scope back into the same
      UPPER_SNAKE_CASE local names it used before, so function bodies needed
      no changes beyond the constant declarations. Went a bit further than
      the named list: also centralized inline literals the task description
      didn't call out by name but that are equally calibration knobs (e.g.
      Great's `topMoveDropTolerance`/`materialityBandGap`, Miss's
      `opportunityWinPctMin`/`threwAwayDropMin`, the mate-score decay-per-ply
      and win% aggregation window divisor, rating's stdErr divisor and
      rounding granularity). Left alone: board-geometry constants (file
      letters, adjacency math), SEE's own piece-value table (`see.ts` — kept
      separate from Brilliant's material-restoration table since SEE
      deliberately values the king at 20000 so it's never treated as
      capturable, a different contract than Brilliant's lookup), and
      structural facts like "one legal move = forced" (not a tunable, a
      definition).
- [x] This is a refactor of code written earlier in this plan, not new logic
      — do it as its own pass once Phases 12–18 are green, not
      incrementally (fighting merge churn against tests that reference the
      old inline constants otherwise).
      Zero test changes were needed — every existing test still asserts on
      the same behavior, since destructuring preserves both the values and
      the local names. Full `packages/chess-analysis` + `packages/shared`
      suites (346 + 68 tests) and `tsc -b`/`eslint .` all green after.
- [x] Commit: `refactor: centralize game-report tunable constants`.

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

- [x] Orchestrate: parse → analyze (existing) → enrich (Phase 14) → classify
      (Phase 15) → aggregate accuracy + phases (Phase 16) → scores (Phase 17)
      → rating (Phase 18) → book (Phase 11) → assemble `GameReport` (Phase
      19.1) → persist.
      The orchestration itself (phase boundaries → per-move
      phase/isTacticalPosition → per-colour accuracy/phaseAccuracy/scores/
      counts/acpl/rating) landed as a **pure** function,
      `buildGameReport`, in `packages/chess-analysis/src/build-game-report.ts`
      — fully unit-testable without a DB or engine, and reusable if a report
      ever needs rebuilding outside the API (e.g. a recalibration script).
      `apps/api/src/services/build-game-report.ts` is a thin wrapper adding
      only what's knowable at the API layer: engine name/depth/multiPv, and
      each colour's `GameResultForColour` from the PGN `Result` header
      (`'*'`/unrecognised → `'draw'`, the neutral entry in the conversion
      table). `runAnalyzeGameJob` in `apps/api/src/services/analysis.ts`
      calls it right after `classifyMoves`/`buildBookReport` and stores the
      result via the new `storeGameReport`. Deviations from this task's
      literal file list, both because the natural integration point already
      existed elsewhere: the new route wiring landed in the existing
      `GET /api/games/:id` in `apps/api/src/routes/games.ts` (which is where
      `classifiedMoves`/`bookReport`-shaped data is actually already
      surfaced to the frontend — `routes/analyses.ts` only ever served the
      SSE status stream), not a new route in `routes/analyses.ts`; and
      `phases.openingSource` is hardcoded to `'book'` rather than threaded
      through as a real signal, since the book index is a bundled asset
      always present in this deployment — `'heuristic'` is §6.1's fallback
      for "no book index at all," which structurally can't happen here.
      `priorRating` is `null` for both colours (documented at both the
      pure-function call site and in the wrapper) — no numeric player rating
      exists yet, only the coarse `ratingBand` enum noted back in Task 18.2,
      so §8.5's shrink always falls back to the default 1200 prior for now.
      Added one new tunable in the same `CONFIG.ratingEstimate` namespace
      from Task 19.2 rather than a bare literal: `mediumConfidenceMinMoves`
      (24, double the §8.6 minimum), used to derive `estimatedRating.confidence`
      since the spec names the field but doesn't define the threshold.
- [x] Integration test: a full fixture game produces a `GameReport` with
      every field populated and internally consistent (phase accuracies
      don't need to average to game accuracy — assert they're merely
      *present*, not equal, per §6.4's explicit note).
      Covered at two levels: `build-game-report.test.ts` in
      `packages/chess-analysis` (a real, engine-free game generated by
      always playing chess.js's first legal move — legal by construction,
      no hand-transcription to get wrong) asserts full schema validity plus
      the invariants above; `analysis.test.ts` in `apps/api` adds an
      end-to-end test (real Postgres via testcontainers, fake engine) that
      the stored `gameReport` column round-trips through `GameReportSchema`.
      A matching `GET /api/games/:id` route test confirms the frontend-facing
      shape, alongside a `gameReport: null` assertion on the pre-existing
      coach_play-game test (no `analyses` row, so nothing to report).
- [x] Determinism check (§13 checklist's last line): same PGN + same depth →
      byte-identical report — a snapshot test on one fixture game is enough
      to catch an accidental `Date.now()`/`Math.random()` creeping in.
      `build-game-report.test.ts`'s determinism test calls `buildGameReport`
      twice on identical input and asserts `JSON.stringify` equality.
- [x] Commit: `feat: assemble and persist full game report`.

---

## Phase 20 — UI surfacing

### Task 20.1: Game report summary panel

**Read:** no new `docs/algorith.md` read needed — renders the §9/§8.1 fields
already read in Phases 18–19; re-check §8.1 only if the "ship a range, not a
point estimate" requirement isn't already clear from Task 18.2.

**Files:** new component(s) under `apps/web/src/features/games/` or
`apps/web/src/features/board/` (co-locate with existing move-explorer UI —
check current feature-folder boundary before choosing).
- [x] Accuracy headline (both colours), phase accuracy breakdown, the four
      scores (opening/tactics/strategy/endgame), classification counts
      (inaccuracy/mistake/blunder/etc. — the exact ask from the user's
      original request), estimated rating **as a range**, per §8.1's explicit
      "ship a range or users lose trust" instruction — do not render a bare
      point estimate.
      Landed as `GameReportSummary` in `apps/web/src/features/board/`
      (co-located with `MoveExplorer`, per this task's own suggestion) — a
      two-column (White/Black) table covering every metric listed above, plus
      a per-colour classification-count list reusing `MoveQualityBadge` for
      the same iconography already used in the move list. `formatRating`
      renders `reason` (e.g. "insufficient moves") when `value`/`range` are
      `null`, and always pairs a non-null value with its range — there is no
      code path that prints a bare number. Wired into `SessionPage.tsx` above
      `MoveExplorer` (both now share a new `.session-move-explorer-column`
      flex wrapper, since the panel needs to sit above the explorer rather
      than *be* it), gated on `gameQuery.data?.gameReport` so a `coach_play`
      game (no `analyses` row, hence no report) shows just the explorer as
      before. Required extending the frontend's `GameDetailSchema`
      (`sessionPageSchemas.ts`) with the new `gameReport` field the backend
      route now returns (Task 19.3).
- [x] Component tests with a fixture `GameReport`.
      5 tests in `GameReportSummary.test.tsx`: both colours' accuracy render,
      null phase-accuracy/score values render as "—", the rating range always
      renders paired with its value, the `reason` fallback renders when the
      rating is null, and classification counts (explicitly including
      inaccuracies/mistakes/blunders) render per colour.
- [x] Commit: `feat: game report summary panel`.

### Task 20.2: Alternatives + book label in the move explorer

**Read:** `docs/algorith.md` §11, closing paragraph only (already read in full
in Task 15.3 — re-open only if that context has aged out).

**Files:** `apps/web/src/features/board/MoveExplorer.tsx`,`MoveStrip.tsx`.
- [x] Book moves show the opening name/ECO (§11's last trigger row); the
      alternatives panel shows `bestMoveSan` + PV and the two runners-up by
      win% (not raw cp) per §11's closing paragraph.
      In `MoveExplorer.tsx`: `OpeningLabel` renders the move's book reason
      (already exactly `"Theory — {name} ({eco})"` from Task 15.3's
      `buildReasons`) unconditionally — not gated behind the "show notes"
      toggle, since leaving book is something a player should see without an
      extra click — while `MoveNote` now skips `quality === 'book'` so the
      same line never renders twice if notes are also toggled on. A new
      `AlternativesPanel`, gated behind the notes toggle alongside
      `MoveNote`, renders `bestLinePvSan` joined as the "Best:" line and the
      first two `alternatives` entries by their pre-computed `winPct` (never
      `cp`, which the type doesn't even surface a use for here). `MoveStrip`
      has no room for an inline note (it's a bare chip strip), so its one
      change is folding the same opening-reason text into the long-press
      inspector modal's title instead of a dedicated panel.
- [x] Commit: `feat: opening labels and win%-based alternatives in move explorer`.

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

---

# Historical Stats Dashboard + Stat-Bank Import

**Why this section exists:** Phases 10–21 above produce a full `GameReport`
per game (accuracy, phase accuracy, opening/tactics/strategy/endgame scores,
classification counts, rating) but nothing aggregates that **across** games.
This section adds a chess.com-style Insights dashboard (time-range + rapid
filter), a tactical-motif breakdown (forks/pins/discoveries/etc. as "found N
of M"), and a stat-bank import path that lets a user bulk-import games
without forcing a full coaching session on each one. No peer-comparison
section — no peer data exists in this single-user app.

Tags: 🟢 exact/derived from existing code, 🟡 a concrete formula defined here
(reasonable, not yet validated against real data), 🔴 heuristic, flagged for
later calibration alongside Phase 21's.

Existing building blocks this reuses (verified in code): `tactics.ts`'s
`forks()`/`captureOpportunities()` (built on `attack-map.ts`); `see.ts`
(brilliant-sacrifice counting is just `quality === 'brilliant'`, no new
detector); `strategy-score.ts`'s `positionalTrend()` (5 named weighted
deltas, not yet exported individually); `endgame-score.ts`'s
`standingBucket()` (winning/equal/worse, not yet exported); `gameReport` is
jsonb — new fields need no migration, but every aggregator must treat an
absent field on an old report as *absent*, not zero; `game-import.ts`'s
`importGame()` always calls `insertQueued`+`enqueueAnalyzeGame` synchronously
— this needs to become optional; `GamesPage`/`GameRow`'s existing
Analyzing…/Ready/Failed status+action model just needs a fourth
("not analyzed yet") state.

## Phase 22 — Foundations: time-control classification

### Task 22.1: `classifyTimeControl`

**Files:** `packages/chess-analysis/src/time-control.ts` + test.

- [ ] 🟡 `classifyTimeControl(raw: string | null): 'bullet' | 'blitz' |
      'rapid' | 'classical' | 'correspondence' | 'unknown'` — Lichess's own
      formula, estimated seconds = `base + 40 * increment` for
      `"base+increment"`; `<180` bullet, `180–479` blitz, `480–1499` rapid,
      `≥1500` classical; a `days`-style value (contains `/`) →
      correspondence; unparseable/null → unknown.
- [ ] Tests: Lichess-style and plain-seconds rapid, bullet/blitz/classical
      boundaries, correspondence, garbage/missing → unknown.
- [ ] Commit: `feat: classify game speed from PGN TimeControl header`.

## Phase 23 — Tactical motif detection (pure, per-position)

Each detector mirrors `tactics.ts`'s `forks()` shape. Built and tested in
isolation before Phase 24 wires them into the batch pipeline.

### Task 23.1: Pins

**Files:** `packages/chess-analysis/src/tactic-pins.ts` + test.

- [ ] 🟡 `pins(chess, attackMap): PinHit[]` — for each sliding piece (B/R/Q),
      walk each ray; first occupied square an enemy piece, next occupied
      square on the same ray the enemy king (absolute) or a higher-value
      piece (relative) → pin.
- [ ] Tests: absolute pin to king; relative pin to higher-value piece; no
      pin when blocked by an own piece first; no false positive with nothing
      behind the first enemy piece.
- [ ] Commit: `feat: pin detection`.

### Task 23.2: Discovered attacks

**Files:** `packages/chess-analysis/src/tactic-discovered.ts` + test.

- [ ] 🟡 `discoveredAttack(fenBefore, moveSan, mover): boolean` — after the
      move, some piece **other than the moved piece** newly attacks an enemy
      piece/king it didn't attack before (compare `attackersOf`/
      `controlledBy` pre/post via `attack-map.ts`).
- [ ] Tests: discovered check; discovered attack on a piece (not check); no
      false positive on an ordinary developing move.
- [ ] Commit: `feat: discovered-attack detection`.

### Task 23.3: Removes-the-defender (deflection)

**Files:** `packages/chess-analysis/src/tactic-removes-defender.ts` + test.

- [ ] 🟡 `removesDefender(fenBefore, moveSan, mover): RemovesDefenderHit |
      null` — before the move, find an enemy piece defended by exactly the
      piece the move captures/forces away; after, if the formerly-defended
      piece is now undefended and attacked, it qualifies.
- [ ] Tests: capturing the sole defender of a hanging piece qualifies;
      capturing a piece with a second defender doesn't; no false positive
      when nothing is defended.
- [ ] Commit: `feat: removes-the-defender (deflection) detection`.

### Task 23.4: Trapped pieces

**Files:** `packages/chess-analysis/src/tactic-trapped.ts` + test.

- [ ] 🟡 `trappedPieces(chess, attackMap, color): TrappedHit[]` — a piece
      with zero legal destinations that aren't attacked by the opponent,
      itself currently attacked/attackable. Reuse
      `computePositionFeatures`'s mobility/`controlledSquares` fields.
- [ ] Tests: cornered piece with all flight squares covered qualifies; one
      safe flight square doesn't; unattacked immobile piece doesn't.
- [ ] Commit: `feat: trapped-piece detection`.

### Task 23.5: Checkmate flag

**Files:** the existing `moveFlags` helper (Phase 14.1) + test.

- [ ] 🟢 Add `isCheckmate: boolean` alongside `isCheck` —
      `chess.isCheckmate()` after the move, or SAN ends in `#`.
- [ ] Commit: `feat: flag checkmating moves`.

### Task 23.6: Motif orchestrator

**Files:** `packages/chess-analysis/src/classify-tactic-motif.ts` + test.

- [ ] `classifyTacticMotif(context): TacticMotifType | null`,
      `TacticMotifType = 'checkmate' | 'brilliantSacrifice' | 'fork' |
      'pin' | 'discoveredAttack' | 'removesDefender' | 'trappedPiece' |
      'freePiece' | 'other'` — priority order (most-specific first,
      mirroring `classify-move.ts`): checkmate → brilliant sacrifice → fork
      → pin → discoveredAttack → removesDefender → trappedPiece → freePiece
      (reuse `captureOpportunities` favorable+undefended) → `other`
      (`isTacticalPosition`, Phase 17.2, matching nothing above) → `null`.
- [ ] Tests: one fixture per priority tier confirming precedence.
- [ ] Commit: `feat: tactic-motif classification orchestrator`.

## Phase 24 — Per-game tactic-motif report

### Task 24.1: Wire motif classification into the batch pipeline

**Files:** `build-game-report.ts`; `packages/shared/src/game-report.ts`.

- [x] For every ply, classify the motif of the **best** engine move (the
      "opportunity"); if the mover's played move achieves the same motif
      *and* its own quality is `best` or better, count it as "found."
      Landed as `computeTacticMotifCounts` in the new
      `packages/chess-analysis/src/game-tactic-motifs.ts` (kept out of
      `build-game-report.ts` to avoid pushing it further past the
      200-line guideline), called once per colour from `buildPlayerReport`.
      "Found" requires an exact `moveSan` match against the best move (not
      just a coincidentally-matching motif on a different move) — simpler
      and matches the chess.com framing ("did you play *that* fork") better
      than a same-motif-different-move coincidence would.
      **Deviation, documented in code:** the "opportunity" side's own
      quality (needed only for the `brilliantSacrifice` tier) is exact when
      the player actually played the best move (reuses that move's already-
      computed classification, which can be `'brilliant'`); when the player
      played something else, the unplayed best move is treated as plain
      `'best'` rather than run through the full brilliant-soundness check,
      since that needs the extra engine call Phase 14.3 deliberately
      reserves for played-move candidates only. Net effect: a real but
      accepted undercount of *missed* brilliancies specifically (every
      other motif — fork/pin/discovered/removesDefender/trapped/free
      piece/checkmate — is exact regardless of whether the best move was
      played, since those are objective properties needing no engine call).
- [x] Add `TacticMotifCountsSchema` (`{opportunities, found}` per motif
      type) to `game-report.ts`; add `tacticMotifs` to `PlayerReportSchema`.
      No migration (jsonb) — pre-existing reports won't have this field;
      treat absent as absent, not zero.
      `TacticMotifType`'s canonical definition (`TACTIC_MOTIF_TYPES` +
      `TacticMotifTypeSchema`) also landed in `game-report.ts` rather than
      in chess-analysis's `classify-tactic-motif.ts` (which now imports and
      re-exports it) — per AGENTS rule 4, the type comes from a shared zod
      schema first, matching how `MoveQuality`/`MOVE_QUALITIES` is handled.
- [x] Test: `game-tactic-motifs.test.ts` covers a played best move (credits
      both opportunity and found), a missed best move (opportunity only),
      and a move with no stored `fenBefore`/best-line eval (skipped
      cleanly). `build-game-report.test.ts`'s existing full-pipeline test
      confirms `tacticMotifs` round-trips through `GameReportSchema` on a
      real generated game.
- [x] Commit: `feat: per-game tactic-motif counts (opportunities vs. found)`.

## Phase 25 — Strategy sub-metric breakdown

### Task 25.1: Export and re-express the five strategy components as accuracies

**Files:** `packages/chess-analysis/src/strategy-score.ts`.

- [x] Export `pawnStructureTrend`/`spaceTrend`/`filesTrend`/`centreTrend`/
      `kingSafetyTrend` individually.
- [x] 🔴 Map to labels, each a 0–100 accuracy via
      `clamp(quietAccuracy + component, 0, 100)` (same formula the existing
      `strategyScore` already uses): Pawn Structure ← `pawnStructureTrend`;
      Space Advantage ← `spaceTrend`; Active Piece ← `filesTrend`; Attacking
      ← new `attackingTrend` (`kingSafetyTrend` machinery vs. the
      **opponent's** king); Defending ← existing `kingSafetyTrend` (mover's
      own king); Overall Strategic ← existing `strategyScore`, unchanged.
      Landed as `buildStrategyScores` in `build-game-report.ts` (renamed
      from the old `buildStrategyScore`), reusing the existing
      `strategyScore(quietPositionCount, quietAccuracy, component)` function
      unchanged for every sub-score — no new "sub-score" formula needed
      since it was already generic over its `trend` argument. `ATTACKING_BONUS`
      (10, mirroring `KING_SAFETY_PENALTY`'s magnitude) added to
      `CONFIG.strategyScore`.
- [x] Add `strategySubScores` to `PlayerReportSchema` (5 nullable
      percentages, same `< 4` quiet-position null guard).
- [x] Tests: each component fixture-tested independently (including two new
      `attackingTrend` fixtures — one with genuine attacking pressure via an
      open-file rook, one confirming the opponent merely blocking its own
      escape squares does *not* count); existing `strategyScore` tests still
      pass unchanged.
      Caught mid-task: `npx tsc -b` without `--force` was silently reusing
      stale incremental build info and reporting clean when two pre-existing
      fixture files (`apps/api/src/routes/games.test.ts`,
      `apps/web/src/features/board/GameReportSummary.test.tsx`) were
      actually missing the new required `strategySubScores`/`tacticMotifs`
      fields from Phase 24 and this task — only `--force` surfaced the real
      errors. Both fixtures fixed. **Takeaway for future sessions:** after
      adding a required field to a widely-fixture'd shared schema, run
      `tsc -b --force` (or clean the build cache) before trusting a clean
      typecheck.
- [x] Commit: `feat: strategy sub-metric accuracies (defending/attacking/space/pawn structure/active pieces)`.

## Phase 26 — Endgame breakdown (by starting standing, by theme)

### Task 26.1: Export the equal/worse/better bucket

**Files:** `packages/chess-analysis/src/endgame-score.ts`.

- [x] Export `standingBucket` (as `endgameStandingBucket` if that reads
      clearer outside this file) — no behavior change.
- [x] Commit: `refactor: export endgame standing-bucket classifier`.

### Task 26.2: Endgame theme classification

**Files:** `packages/chess-analysis/src/endgame-theme.ts` + test.

- [x] 🟢 `classifyEndgameType(fen): 'kingAndPawn' | 'queen' | 'rookAndPawn' |
      'other'` from material at `endgameStartPly`, reusing Task 14.1's
      material-counting helper.
      Landed as a direct board scan for queen/rook/minor *presence* rather
      than routing through `nonPawnMaterial`'s point totals — points alone
      can't distinguish "one knight" from "one bishop" worth of material
      from "queens on the board," which the theme buckets need to tell apart.
- [x] Tests: one fixture per bucket, plus mixed-material → `other`.
- [x] Commit: `feat: endgame theme classification (K+P/queen/rook+pawn/other)`.

### Task 26.3: Wire theme + standing into the game report

**Files:** `build-game-report.ts`, `game-report.ts`.

- [x] Add `endgame: { standing: 'winning'|'equal'|'worse'|null, theme:
      ReturnType<typeof classifyEndgameType> | null }` to
      `PlayerReportSchema` (both null when the game never reached endgame).
      `EndgameStanding`/`EndgameTheme` canonically live in
      `packages/shared/src/game-report.ts` (per AGENTS rule 4, matching the
      `TacticMotifType` precedent from Phase 24) — `endgame-score.ts`/
      `endgame-theme.ts` import and re-export them rather than declaring
      local unions. New `buildEndgameContext` in `build-game-report.ts`
      reads the position at `endgameStartPly` and reuses the already-
      computed `winPctAtEndgameStart` — no new engine/FEN work.
- [x] Commit: `feat: persist per-game endgame standing and theme`.

## Phase 27 — Opening breakdown (aggregation-only, no new chess logic)

### Task 27.1: Per-phase mistake count

**Files:** `packages/chess-analysis/src/opening-mistakes.ts` + test.

- [x] 🟢 `openingMistakeCount(moves: MoveReport[], colour): number` — count
      of that colour's `phase === 'opening'` moves with quality in
      `inaccuracy`/`mistake`/`miss`/`blunder`.
- [x] Commit: `feat: per-game opening mistake count`. Also added the shared
      `StatsEntry` interface (`stats-entry.ts`) here rather than deferring it
      to Task 28.1 — Task 27.2 needs it immediately and it has no
      dependencies of its own (`GameReport`/`PlayerColor` from shared,
      `GameResultForColour` from `endgame-score.ts`, `GameSpeed` from
      `time-control.ts`).

### Task 27.2: Cross-game opening aggregator

**Files:** `packages/chess-analysis/src/aggregate-opening-stats.ts` + test.

- [x] `aggregateOpeningStats(entries: StatsEntry[]): OpeningStats` — average
      book moves (mean `book.players[colour].lastBookPly`), opening accuracy
      (mean `phaseAccuracy.opening`, nulls excluded), average opening
      mistakes (Task 27.1), and performance by opening (group by
      `book.name` → `book.eco` → "Unknown opening"; games played/win%/mean
      *overall game* accuracy per group — not opening-phase accuracy, to
      match chess.com's "Performance by Opening" table being a distinct
      metric from "Opening Accuracy" above it — sorted by games played
      descending). All three scalar stats are `null`, not `0`, when
      `entries` is empty.
- [x] Tests: two games sharing an opening aggregate into one row; a
      null-name game falls back to eco then to "Unknown opening", never
      dropped; sort order by games played; empty-input nulls.
- [x] Commit: `feat: cross-game opening-performance aggregation`.

## Phase 28 — The dashboard aggregator (pure) and shared schemas

### Task 28.1: `StatsEntry` and the master aggregator

**Files:** `packages/chess-analysis/src/build-stats-dashboard.ts` + test.

- [x] `StatsEntry` (already added alongside Task 27.1, since 27.2 needed it
      immediately): `{ gameReport: GameReport, result: GameResultForColour,
      userColor: PlayerColor, playedAt: Date | null, speed: GameSpeed }`.
- [x] `buildStatsDashboard(entries: StatsEntry[]): StatsDashboard` —
      opening (Phase 27's `aggregateOpeningStats`), tactics (sum
      `tacticMotifs` per motif across games, Phase 24), strategy (mean each
      of the 6 sub-scores — the 5 `strategySubScores` plus overall
      `scores.strategy` — skip nulls, Phase 25), endgame (win% per standing
      bucket = wins / (wins+losses+draws*0.5), buckets with 0 games omitted;
      accuracy-by-theme = mean phase accuracy per theme bucket, themes with
      0 games omitted; overall = mean `phaseAccuracy.endgame`, Phase 26).
- [x] Every section `null`/empty-array when `entries` is empty or the
      needed signal is missing everywhere — never a misleading `0`.
- [x] Determinism test: same entries twice → byte-identical (`JSON.stringify`
      equal) output.
- [x] Commit: `feat: cross-game stats dashboard aggregator`.

### Task 28.2: `StatsDashboardSchema`

**Files:** `packages/shared/src/stats-dashboard.ts` (new file).

- [x] Zod schemas for every Task 28.1 shape, plus `StatsRangeSchema =
      z.enum(['last7', 'last30', 'last365', 'all'])` and
      `GameSpeedFilterSchema = z.enum(['rapid', 'all'])`. Per AGENTS rule 4
      (types come from `packages/shared` first), `aggregate-opening-stats.ts`
      and `build-stats-dashboard.ts` were refactored to import+re-export
      these shared types (`OpeningStats`, `StrategyStats`, `EndgameStats`,
      etc.) instead of keeping their own duplicate local interfaces — same
      pattern as `TacticMotifType`/`EndgameStanding`/`EndgameTheme` in
      Phase 24/26. `tactics: TacticMotifCountsSchema` is reused directly
      from `game-report.ts` rather than redefined.
- [x] Commit: `feat: stats dashboard schema`.

## Phase 29 — API: repository query, service, route

### Task 29.1: Repository query for analyzed games in range

**Files:** `apps/api/src/db/repositories/analyses.ts`.

- [x] `listReadyReportsForUser(db, userId, since: Date | null):
      Promise<StatsSourceRow[]>` — joins `analyses` (`status = 'ready'`) to
      `games`, scoped by `games.userId`, optional
      `games.playedAt >= since OR (playedAt IS NULL AND createdAt >= since)`.
      Decided to exclude `coach_play`/`vs_bot` games by scoping
      `games.source IN` `ImportableGameSourceSchema.options` (`'paste' |
      'upload' | 'lichess'`) rather than hand-duplicating that list — the
      dashboard is about performance against real opponents, not practice
      sessions.
- [x] Tests (real Postgres via testcontainers, new
      `apps/api/src/db/repositories/analyses.test.ts`): a ready imported
      game is returned; a non-ready analysis is excluded; `coach_play` is
      excluded; another user's game never leaks in; `since` filters on
      `playedAt`, falling back to `createdAt` for a null-`playedAt` row.
- [x] Commit: `feat: repository query for ready game reports in a date range`.

### Task 29.2: Service — resolve range/speed, call the aggregator

**Files:** `apps/api/src/services/stats-dashboard.ts`.

- [x] `getStatsDashboard(db, userId, range, speedFilter)` — resolves
      `range` → `since`, queries `listReadyReportsForUser`, maps each row
      through `resultForColour` (exported from `build-game-report.ts`,
      reused rather than re-derived) and `classifyTimeControl`, filters to
      the requested speed, builds `StatsEntry[]`, calls `buildStatsDashboard`.
- [x] Test: real Postgres (matches this codebase's existing service-test
      convention — `analysis.test.ts` uses a real test DB rather than
      mocking the repository layer, so this follows suit instead of
      introducing a new mocking pattern): the `'rapid'` speed filter
      excludes a bullet-timed game; a user with no analyzed games gets an
      all-null empty dashboard.
- [x] Commit: `feat: stats dashboard service`.

### Task 29.3: Route

**Files:** `apps/api/src/routes/stats.ts` (new) + test.

- [x] `GET /api/users/me/stats?range=&speed=` (defaults `range=all`,
      `speed=rapid`), thin adapter → `getStatsDashboard`. Registered in
      `app.ts` alongside `registerDashboardRoutes`, unconditionally under
      the existing `if (options.db)` block.
- [x] Tests (real Postgres): empty-state user gets the all-null dashboard
      shape; an unrecognised `range` value is a 400; no auth headers is a
      401; the `speed=rapid` default excludes a bullet-timed game.
- [x] Commit: `feat: stats dashboard route`.

## Phase 30 — Frontend: Insights page

### Task 30.1: Feature folder + data fetching hook

**Files:** `apps/web/src/features/stats/StatsPage.tsx` + `useStatsDashboard`
hook (TanStack Query, mirrors `DashboardPage`'s `apiGet` pattern); route in
`App.tsx`; nav link.

- [ ] Range tabs (Last 7 days/Last 30 days/Last year/All time) + rapid/all
      toggle, same controlled-tab pattern as `GamesPage`'s `FILTERS`.
- [ ] Empty state when the range/filter combination returns zero entries.
- [ ] Commit: `feat: stats dashboard page shell with range/speed filters`.

### Task 30.2: Section components

**Files:** `OpeningStatsSection.tsx`, `TacticsStatsSection.tsx`,
`StrategyStatsSection.tsx`, `EndgameStatsSection.tsx` under
`features/stats/`, presentational (no fetching), each a `.card`.

- [ ] Tactics section renders each motif as "found / opportunities" (e.g.
      "Forks 2/5").
- [ ] Strategy/Endgame sections reuse `GameReportSummary`'s null → "—"
      convention.
- [ ] Component tests per section with a fixture `StatsDashboard`.
- [ ] Commit: `feat: opening/tactics/strategy/endgame stats sections`.

## Phase 31 — Stat-bank import (decoupled analysis)

### Task 31.1: Make analysis-on-import optional

**Files:** `packages/shared/src/game.ts`; `apps/api/src/services/game-import.ts`.

- [ ] `ImportGameRequestSchema` gets optional `deferAnalysis` (default
      `false` — existing flow unaffected). Extract `insertQueued`+
      `enqueueAnalyzeGame` into an exported `startAnalysis(db, jobQueue,
      gameId)`, called only when `!deferAnalysis`.
      `ImportGameResponseSchema.analysisId` becomes nullable.
- [ ] Tests: `deferAnalysis: true` inserts no `analyses` row and never
      enqueues; default behavior unchanged (regression).
- [ ] Commit: `feat: optional deferred analysis on game import`.

### Task 31.2: On-demand analyze route

**Files:** `apps/api/src/routes/games.ts` + test.

- [ ] `POST /api/games/:id/analyze` — ownership check (404), idempotent
      no-op if an `analyses` row already exists, otherwise `startAnalysis`.
- [ ] Commit: `feat: on-demand game analysis endpoint`.

### Task 31.3: "Not analyzed" state in the Games list

**Files:** `apps/web/src/features/games/GameRow.tsx`, `GamesPage.tsx`.

- [ ] `statusAndActionFor`: new branch for `analysisStatus === null` (and
      not `coach_play`/`vs_bot`) → "Not analyzed" / "Get coach analysis",
      before the existing "assume analyzing" fallback.
- [ ] New `analyzeMutation` (mirrors `deleteMutation`) → Task 31.2's route,
      invalidates `['games']` on success.
- [ ] Add `'Not analyzed'` to `GamesPage`'s `FILTERS`.
- [ ] Component tests for the new branch + click wiring.
- [ ] Commit: `feat: "not analyzed" status and on-demand analyze action in games list`.

### Task 31.4: Bulk import UI ("stat bank")

**Files:** `LichessGamePicker.tsx`, `ImportPage.tsx`.

- [ ] `LichessGamePicker` multi-select mode (checkbox per row, additive to
      its existing single-`onSelect` contract) + "Import N for stat bank".
- [ ] `ImportPage` bulk mode: `POST /api/games` per selection with
      `deferAnalysis: true, source: 'lichess'`; surface the 10/day limit's
      remaining count on partial failure; routes back to the Games list
      (not into `AnalysisProgress`/a session).
- [ ] Out of scope: multi-game PGN paste/upload — bulk import is
      Lichess-only for now.
- [ ] Component test: selecting 3 games calls the import mutation 3 times
      with `deferAnalysis: true`.
- [ ] Commit: `feat: bulk "stat bank" import from Lichess`.

## Verification (end of Phase 31)

- `npm run lint && npm run typecheck && npm test`, green.
- Manual (`npm run dev`): bulk-import 3–5 rapid games via stat-bank mode,
  confirm "Not analyzed" → click "Get coach analysis" per game → Ready;
  open `/stats`, confirm all four sections populate and the range/rapid
  filters change the numbers; confirm a blitz game imported normally is
  excluded when the rapid filter is on.
