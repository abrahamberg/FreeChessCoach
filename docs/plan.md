# FreeChessCoach — Programmatic Coach Diagnostics Implementation Plan

**Source spec:** `docs/diagnose.md` ("Chess.com Rapid Operational Diagnostic
Glossary v2.0"). It is long (~1000 lines) and most of it is irrelevant to any
single task — do **not** read it end-to-end and do not open it for work
outside this plan. Every task below has its own **Read:** line naming the
exact section (e.g. "§4.4 only") that task needs; read only that.

Section map for the **Read:** lines: §0 rating calibration · §I.1 diagnosis
format + direction codes · §I.2 failure mechanisms · §I.3 causal precedence ·
§4.1 evidence tracks · §4.2 game window · §4.3 core metrics · §4.4 opportunity
definition · §4.5 human reachability · §4.6 confidence · §5 verbal diagnostic
sequence · §II.A data-quality gates · §II.B–R the code families (B rules,
C board vision, D move safety, E tactics, F calculation, G time/interface,
H opening, I evaluation, J strategy, K pawn play, L attacking, M defensive,
N conversion, O endgame, P performance state, Q learning, R practical) ·
§III history/scope/severity · §IV focus selection · §V resolution criteria ·
§VI required output format.

## Why this file exists

Phases 0–49 are done (`git log`); this plan continues that numbering from
**Phase 50**. The spec asks for **410 atomic diagnosis codes across 18
families + 20 data-quality gates**, each finding expressed as *leaf skill .
mechanism . direction + context + history* (`TA-07.R.D`), backed by
opportunity/episode counting (`O`, `E`, `E/O`), hWDL, severity, spread, human
reachability, confidence tiers, causal precedence and a focus-selection
objective.

Today the repo has **two diagnostic systems that never talk to each other**:

| | A — "coach diagnostics" | B — "game report / stats" |
|---|---|---|
| Source | LLM prose, constrained by a 13-value enum | deterministic, calibrated math |
| Storage | `findings`, `focus_areas` | `analyses.game_report` |
| Reaches the coach prompt | yes | **never** |

`MISTAKE_CATEGORIES` (13 values, `packages/shared/src/constants.ts`) is the
entire diagnostic vocabulary; `findings.description` and `focus_areas.note`
are unvalidated LLM prose; **no programmatic path ever writes a finding.**
Meanwhile accuracy, phase accuracy, ACPL, estimated rating and per-motif
found/prevented counts are computed rigorously and never reach coaching.

**Goal of this plan:** every countable thing in `docs/diagnose.md` is computed
in code with real denominators. The LLM keeps only what genuinely needs
judgment — the failure *mechanism* inferred from the Socratic dialogue the
coach already runs (§5 is, almost word for word, what `howYouRunTheSession`
already instructs), and the prose.

## Scope decisions already taken (do not relitigate)

1. **Full catalog, partial detectors.** All 410 codes + 20 gates ship as typed
   data. Only codes with a detector ever fire programmatically; the rest stay
   nameable from dialogue. Adding a detector later is a data change.
2. **No probe subsystem in this plan.** Mechanism comes from coach dialogue.
   Consequence: the confidence ceiling is **`Probable`** — `Confirmed`
   requires a blinded mechanism-matched probe (§4.6) and **must never be
   emitted**. The whole `RB-*` family (15 rules codes) is out of reach for the
   same reason the spec itself gives in `DQ-17`: online play blocks illegal
   moves, so games cannot test rules knowledge. Schema slots are reserved so
   probes can be added later without a rewrite.
3. **All four missing metrics are captured** (Phase 51): per-move clocks,
   ratings/termination/exact time control, a human-reachability signal, and a
   chess.com import client.
4. **Vertical slice first.** Phase 53 implements ~25–30 codes across `MS-*`,
   `BV-*` and the `TA-*` codes the existing motif registry already covers,
   wired end to end through Phases 54–58, rather than breadth-first.

## What already exists and is reused as-is (verified in code, not assumed)

- **`checksCapturesThreats` is computed and stored on every ply and consumed
  by nothing.** `classify.ts:178` calls `analyzeChecksCapturesThreats` and
  `:211` stores it on the move; `grep` finds no other reader. It is the
  complete engine-independent CCT inventory (every legal check, every capture
  with a `favorable` flag, every quiet move that newly attacks something) and
  it maps almost 1:1 onto the entire `MS-01..MS-14` family. **This is the
  single highest-value unused asset in the repo.**
- **`tactic-detectors/` is the pattern to copy**, not to extend: a
  priority-ordered `registry.ts`, a shared `context.ts`, one file per
  detector, a `types.ts` contract, and a `README.md` documenting the
  five-step "add one" flow. Phase 53 builds `diagnostics/` in that exact
  shape so a new diagnosis detector is a documented one-file change.
- **Both tactical directions already exist.** `tacticOpportunity` (offensive:
  the engine's top move embodied motif X — did the player play it) and
  `tacticPrevention` (defensive: the opponent had X reachable — did the
  player defuse it) are both stored per ply. §I.1's `O`/`D` direction split
  is therefore already computable for every motif in the registry.
- **Motif sub-typing is nearly free.** `tactics.ts`'s `forks()` knows the
  forking piece (→ `TA-07` knight / `TA-08` pawn / `TA-09` king / `TA-10`
  slider) and `tactic-pins.ts`'s `pins()` already returns
  `kind: 'absolute' | 'relative'` (→ `TA-11` / `TA-12`).
- `computeTacticMotifRankHits` (`game-tactic-motifs.ts:126`) is implemented,
  tested and **has no callers**. "The student found it at rank 2" is exactly
  the §4.5 reachability signal — wire it, do not rewrite it.
- `CONFIG` (`packages/chess-analysis/src/config.ts`) is the single calibration
  object §0.3/§10 recalibration depends on. **Every new threshold in this
  plan goes there**, never inline.
- `StatsEntry` + `buildStatsDashboard` + `analysesRepo.listReadyReportsForUser`
  are the established pure-aggregator-over-a-window shape. Phase 55 extends
  that pattern rather than inventing a second one.
- Reused unchanged: `see.ts`, `attack-map.ts`, `piece-safety.ts`,
  `diff-features.ts`, `win-probability.ts`, `classify-miss.ts`,
  `critical-moments.ts`, `phase-segmentation.ts`, `opening-book.ts`,
  `time-control.ts`, `describe-tactic-hit.ts`, `available-motifs-scan.ts`.
- `BOT_ROSTER` (`packages/shared/src/bot-roster.ts`) already ships an
  Elo→depth ladder (300→d3 … 2300→d15). Phase 54 reuses it as the §4.5
  human-reachability proxy rather than inventing a strength model; note the
  engine exposes **no** `Skill Level` / `UCI_Elo` (verified in
  `services/engine/src/uci.ts` — only MultiPV, depth and a timeout), so
  shallow search is the only lever available.

## Layering reminder (AGENTS.md)

All detection, scoring and statistics below are **pure** and belong in
`packages/chess-analysis`; every new persisted or LLM-facing shape is a zod
schema in `packages/shared`; all SQL stays in `apps/api/src/db/repositories/`;
prompt text lives only in `packages/prompts` (run `npm run docs:prompts`
after any change — the checked-in doc is test-enforced); the reachability
re-search (Phase 54) is the one piece of I/O that cannot be pure, so it lives
in a service. TDD is non-negotiable: write the failing test, watch it fail,
implement, watch it pass. Run `npm run lint && npm run typecheck && npm test`
before claiming any task done, and commit per task.

---

## Phase 50 — Input soundness (must land before anything measures anything)

Statistics built on these inputs would be wrong in ways no downstream test
would catch. All four defects are verified in code, with line references.

### Task 50.1: Send `multiPv` on the whole-game batch path

**Read:** nothing in `docs/diagnose.md`; this is a repo bug.

**Files:** `apps/api/src/services/engine-client.ts`,
`apps/api/src/services/engine/native-engine-backend.ts` + tests.

`analyzeGameViaEngine` posts `{ fens, priority }` with **no `multiPv`**
(`engine-client.ts:26`), so the engine service falls back to
`DEFAULT_MULTI_PV = 2` (`services/engine/src/uci.ts:11`, applied at `:78`) —
even though the file's own doc comment says the point of the module is to
request `ENGINE_MULTI_PV = 5`. `NativeEngineBackend.analyzeGame:21-25`
acknowledges this in a comment. Every reachability-rank, alternatives-based
and candidate-generation diagnostic in this plan needs 5 lines.

- [x] Failing test: `analyzeGameViaEngine` sends `multiPv: ENGINE_MULTI_PV`
      in its request body (assert against a mocked `fetch`).
- [x] Add `multiPv` (default `ENGINE_MULTI_PV`) and `depth` parameters to
      `analyzeGameViaEngine`, matching `analyzePositionViaEngine`'s signature.
- [x] Forward `opts?.multiPv`/`opts?.depth` from
      `NativeEngineBackend.analyzeGame`; delete the stale comment.
- [x] Note in the commit body that this only affected `engineMode: 'native'`
      — `chess_api` already requests 5 variants and the Lichess index stores 5.
- [x] Commit: `fix: request ENGINE_MULTI_PV on the whole-game batch path`.

### Task 50.2: Keep the engine's real PV on the classified move

**Read:** nothing; repo bug.

**Files:** `packages/chess-analysis/src/classify.ts` + test.

`buildClassifiedMove` sets `bestLineSan` and `bestLinePvSan` to a
**one-element array** (`classify.ts:158`, `:190`, `:202`). The engine's real
multi-ply `pvSan` is carried on `EngineLine.pvSan` and persisted in
`analyses.engine_evals`, but never copied onto the move. Calculation-depth,
solution-length and reachability detection all read the PV from the move.
This also un-breaks `classify-brilliant.ts`'s `restoresSacrificedMaterial`,
which reads `bestLinePvSan.slice(1, 3)` and therefore always sees an empty
slice today.

- [x] Failing test: given an `EngineEval` whose top line has
      `pvSan: ['Nxe5', 'Nxe5', 'd4']`, the classified move's `bestLinePvSan`
      is that full array, not `['Nxe5']`.
- [x] Failing test: a stored eval with no `pvSan` (the optional field is
      absent on pre-Phase-43 rows) still yields `[bestMoveSan]` — graceful
      degradation, no throw.
- [x] Implement; keep `bestLineSan` as-is (it is the existing API name and
      the UI reads it) and change only `bestLinePvSan`.
- [x] Add a regression test asserting `restoresSacrificedMaterial` now sees a
      non-empty slice for a fixture where material is restored on ply 2.
- [x] Commit: `fix: carry the engine's real PV onto classified moves`.

### Task 50.3: Wire brilliant-soundness into the batch pipeline

**Read:** `docs/algorith.md` §5.5 only (gate B6).

**Files:** `apps/api/src/services/analysis.ts`,
`apps/api/src/services/brilliant-soundness.ts` + test.

`runAnalyzeGameJob` calls `classifyMoves` without
`options.brilliantSoundnessByPly`, so `isBrilliantMove` always sees
`brilliantSoundness === undefined` and returns `false`
(`classify-brilliant.ts:27`). **`'brilliant'` is therefore unreachable in
batch analysis**, which skews `tacticsScore` (+6 per brilliant),
`ClassificationCounts`, and every "instructive moment" the planner sees.
`checkBrilliantSoundness` exists and is tested but has no callers.

- [x] Failing integration test: a fixture game containing a known sound
      sacrifice produces a `'brilliant'` move in the stored report.
- [x] Add a pre-pass in `runAnalyzeGameJob` that collects candidate plies —
      only those already passing the cheap B-gates (not book, `legalMoveCount
      > 1`, `drop <= CONFIG.brilliant.maxDrop`, a real SEE sacrifice) — and
      calls `checkBrilliantSoundness` for each, building the
      `ReadonlyMap<number, boolean>`. Typically 0–2 positions per game.
- [x] Pass the map into `classifyMoves`.
- [x] Assert in the test that a game with no sacrifices makes **zero** extra
      engine calls, so the gate ordering is verified, not just the outcome.
- [x] Commit: `fix: compute brilliant soundness in the batch analysis job`.

### Task 50.4: A separate diagnostic denominator for prevented tactics

**Read:** `docs/diagnose.md` §4.4 only.

**Files:** `apps/api/src/services/tactic-prevention.ts` + test.

`computeTacticMotifPrevented` skips a ply entirely when the played move was
`BEST_OR_BETTER` (`tactic-prevention.ts:94`). That is a **deliberate,
documented product choice** for the shipped "Prevented" stats card — "there
was no better reply, so it was never truly preventable for them" — and it
must **not** be changed. But as an `E/O` denominator it is biased: every case
where the player *did* prevent the threat by finding the best move is
excluded, so the failure rate is systematically inflated.

- [x] Failing test: for a ply where a motif was reachable and the player
      played the best move which defused it, the new diagnostic counter
      records an opportunity with `failed: false`, while the existing
      `counts.preventable` stays unchanged.
- [x] Add an **additive** second output — `diagnosticByPly` — populated for
      every ply with a reachable opponent motif regardless of move quality.
      Leave `counts` and `byPly` byte-identical so nothing shipped regresses.
- [x] Document in the function's doc comment why two counters exist, so the
      next reader does not "unify" them.
- [x] Commit: `feat: unbiased prevented-tactic denominator for diagnostics`.

### Task 50.5: Track the source spec

- [x] `git add docs/diagnose.md` — it is currently untracked (`git status`),
      so every reference in this plan points at a file not in the repo.
- [x] Commit: `docs: track the operational diagnostic glossary`.

---

## Phase 51 — Capture the missing metrics

Everything here is recoverable from the already-stored raw `games.pgn`
(except the chess.com client), so each task ships with a backfill.

### Task 51.1: Stop discarding PGN move comments

**Read:** `docs/diagnose.md` §II.G intro + gate `DQ-04` only.

**Files:** `packages/chess-analysis/src/pgn-move-comments.ts` + test.

`parsePgn`'s `stripAnnotations` deletes every `{...}` comment before chess.js
sees the text, destroying `[%clk]` and `[%eval]`. Per-move clock data is the
precondition for all 17 `TM-*` codes, `MX-04`, `DQ-04`, `DQ-15`, and the
`L`/`S`/`X` mechanisms. Do **not** change `parsePgn` — chess.js must keep
receiving stripped text. Add a separate pure extractor over the raw string.

- [x] Failing test using the Lichess fixture already in `pgn.test.ts:73-78`
      (it is full of `%clk`/`%eval` and currently only asserts that it
      parses): extract `[{ ply: 1, clockMs: 600000, evalCp: -4 }, ...]`.
- [x] Edge cases: no comments at all → empty array; comments on some moves
      only → sparse, ply-indexed, never positional guessing; `h:mm:ss` and
      `h:mm:ss.f` clock formats; `[%eval #3]` mate scores; nested/multiple
      comments after one move; a comment before the first move.
- [x] Derive `timeSpentMs` per ply from consecutive same-colour clock values
      plus the increment from `TimeControl`; first move of each colour has no
      predecessor, so it is `null`, not `0`.
- [x] Commit: `feat: extract per-move clock and eval comments from PGN`.

### Task 51.2: PGN header metadata

**Read:** `docs/diagnose.md` §4.2 and gates `DQ-03`, `DQ-08`, `DQ-12`,
`DQ-13`, `DQ-15` only.

**Files:** `packages/chess-analysis/src/parse-game-headers.ts` + test.

`game-import.ts` captures only White/Black/Result/TimeControl/ECO/Date. Not
captured anywhere: `WhiteElo`, `BlackElo`, `Rated`, `Termination`, `Variant`,
`UTCTime`.

- [x] Failing tests: a full Lichess header block and a full chess.com header
      block each yield the same normalized shape; missing headers yield
      `null`, never `0` or `''`; a provisional rating (`?` suffix) is flagged.
- [x] Return `{ whiteElo, blackElo, ratingsProvisional, rated, termination,
      variant, utcTime }`.
- [x] Commit: `feat: parse rating, rated, termination and variant headers`.

### Task 51.3: Migration `0023_game_metadata`

**Read:** `docs/diagnose.md` §4.2 only.

**Files:** `apps/api/src/db/migrations/0023_game_metadata.ts`,
`apps/api/src/db/schema.ts`, `apps/api/src/services/game-import.ts`,
`packages/shared/src/game.ts`.

- [x] Add to `games`: `white_elo int`, `black_elo int`, `ratings_provisional
      boolean`, `rated boolean`, `termination text`, `variant text`,
      `speed text` (the persisted `classifyTimeControl` result, so speed
      filtering pushes into SQL instead of being recomputed per read),
      `played_at_time time`, and `move_times jsonb` (a PGN fact, so it belongs
      on `games`, not `analyses`).
- [x] Widen the `games.source` CHECK to include `'chesscom'` (Task 51.6).
- [x] Populate all of it in `importGame` from Tasks 51.1/51.2.
- [x] Integration test on Testcontainers (`apps/api/test/helpers/db.ts`):
      importing a Lichess PGN with clocks stores non-null `move_times`.
- [x] Commit: `feat: store game rating, termination, speed and move times`.

### Task 51.4: Backfill job for existing games

**Files:** `apps/api/src/jobs/backfill-game-metadata.ts`,
`apps/api/src/jobs/index.ts`, `apps/api/src/jobs/queue.ts` + test.

- [x] Follow the `createXTask(options): Task` factory pattern exactly (see
      `prune-position-evaluations.ts` for the smallest example); register in
      `createTaskList`.
- [x] Process in batches with a cursor — this re-parses every historical
      `games.pgn` and must never run as a migration.
- [x] Idempotent: a row that already has `move_times` is skipped, so a re-run
      after a partial failure is safe.
- [x] Commit: `feat: backfill game metadata and move times`.

### Task 51.5: Numeric player rating

**Read:** `docs/diagnose.md` §0.1 and §0.2 only.

**Files:** migration `0024_user_rating.ts`, `packages/shared/src/user.ts`,
`apps/api/src/services/user-profile.ts`,
`apps/api/src/services/build-game-report.ts`.

Every rating prior in the spec is a numeric Chess.com Rapid interval, but the
app stores only `users.rating_band` (4 coarse bands). Separately,
`build-game-report.ts` hardcodes `priorRating: null` for both colours, so
`estimateRating` always shrinks toward the 1200 default (§8.5) even when the
PGN carried the player's actual rating.

- [x] Add `users.rating int` and `users.rating_source text` (`'self'`,
      `'pgn'`, `'estimated'`).
- [x] Derive `rating_band` from `rating` when present rather than storing the
      two independently; keep the band as the display/prompt-calibration
      concept it already is.
- [x] Feed the user's rating into `buildGameReportForAnalysis`'s
      `priorRating`, and add a test asserting the estimate shrinks toward the
      real prior, not 1200.
- [x] Commit: `feat: numeric player rating and a real estimated-rating prior`.

### Task 51.6: Chess.com import client

**Read:** nothing; `docs/diagnose.md` is written for Chess.com Rapid and today
those games only arrive by manual paste.

**Files:** `apps/api/src/services/chesscom.ts`,
`apps/api/src/routes/chesscom.ts`, `packages/shared/src/game.ts` + tests.

- [x] Mirror `apps/api/src/services/lichess.ts` exactly — same
      `createXClient(fetchImpl = fetch)` shape, same typed error class. Endpoint:
      `https://api.chess.com/pub/player/{username}/games/{YYYY}/{MM}`.
- [x] Surface `rated`, `time_class`, `time_control` and both ratings on the
      row (the existing Lichess client drops these even though the API
      returns them — do not repeat that).
- [x] Add `'chesscom'` to `ImportableGameSourceSchema`.
- [x] Tests mock `fetch`; never call the real API.
- [x] Commit: `feat: chess.com game import`.

---

## Phase 52 — The taxonomy as typed data

### Task 52.1: Diagnostic axes

**Read:** `docs/diagnose.md` §I.1, §I.2, §III only.

**Files:** `packages/shared/src/diagnosis/axes.ts` + test.

- [x] `MECHANISMS` (`K M V R G J C X L S`), `DIRECTIONS` (`O D B N`),
      `HISTORY_STATUSES`, `SCOPE_TAGS`, `SEVERITIES`, `EVIDENCE_TRACKS`, and
      `CONFIDENCE_LEVELS` as `as const` arrays plus zod enums (no `enum`, per
      AGENTS.md), each with a human label map for rendering.
- [x] `CONFIDENCE_LEVELS` includes `'confirmed'` for completeness, but export
      an `EMITTABLE_CONFIDENCE_LEVELS` that excludes it, and add a test
      asserting nothing in this build can produce `'confirmed'` (see the
      scope decision above).
- [x] Commit: `feat: diagnostic axis vocabularies`.

### Task 52.2: The 410-code catalog

**Read:** `docs/diagnose.md` §II.A–R — but **one family per task step**, not
the whole section at once.

**Files:** `packages/shared/src/diagnosis/families/{rb,bv,ms,ta,ca,tm,mx,op,
ev,st,pw,at,df,cv,eg,ps,lr,pd}.ts` + `packages/shared/src/diagnosis/index.ts`.

One file per family keeps every file well under the 200-line rule. The entry
shape:

```ts
export interface DiagnosisCodeEntry {
  id: DiagnosisCodeId;                    // 'TA-07'
  family: DiagnosisFamily;                // 'TA'
  label: string;                          // 'Knight-fork recognition'
  diagnosis: string;                      // the spec's own sentence, verbatim
  ratingPrior: readonly [number, number];  // §0.1 Primary CR prior
  directions: readonly Direction[];       // which of O/D/B/N apply
  evidenceTrack: EvidenceTrack;           // §4.1
  detectability: 'detector' | 'dialogue' | 'probe' | 'unsupported';
  parentCategory: MistakeCategory;        // keeps the existing 13-value UI working
}
```

`parentCategory` is what makes this non-breaking: the dashboard,
`categoryLabels.ts`, `findings.category` and the coach prompt keep working on
the 13 parents while the codes carry the precision.

- [x] Transcribe each family's table verbatim — `id`, `label`, `diagnosis`
      and `ratingPrior` come straight from the spec's columns. This is
      mechanical; do not paraphrase the `diagnosis` text.
- [x] Set `detectability: 'probe'` for all of `RB-*` (per `DQ-17`) and
      `'unsupported'` for `MX-01..MX-03`; leave the rest `'dialogue'` until a
      detector lands, at which point that task flips the field.
- [x] Tests: every id is unique and matches `/^[A-Z]{2}-\d{2}$/`; every
      `ratingPrior` is ascending and within `[100, 2500]` (§0.1 says use 100,
      not zero, as the floor); every `parentCategory` is a real
      `MistakeCategory`; the catalog has exactly the family counts the spec
      does (RB 15, BV 22, MS 14, TA 45, CA 30, TM 17, MX 4, OP 21, EV 24,
      ST 35, PW 33, AT 20, DF 18, CV 17, EG 54, PS 17, LR 18, PD 6 = 410).
- [x] Commit one per family: `feat: <family> diagnosis code catalog`.
- Note: `directions`/`evidenceTrack`/`detectability`/`parentCategory` have no
  source column in the spec's tables (only `id`/`label`/`diagnosis`/
  `ratingPrior` do) — `packages/shared/src/diagnosis/families/README.md`
  documents the mechanical assignment policy used instead, so 410 rows don't
  become 410 ad-hoc judgment calls. `DiagnosisCodeEntry` lives in a new
  `catalog-types.ts` (not named in this task's Files line, but necessary —
  families import it, and it can't live in `index.ts` without a circular
  import since `index.ts` aggregates the families).

### Task 52.3: Data-quality gates

**Read:** `docs/diagnose.md` §II.A only.

**Files:** `packages/shared/src/diagnosis/data-quality.ts` + test.

- [x] The 20 gates as typed entries `{ id, label, blocking: boolean }`. Per
      §IV override 5, no primary diagnosis may bypass a failed gate, so
      `blocking` drives Phase 55.
- [x] Commit: `feat: data-quality gate catalog`.
- Note: all 20 gates ended up `blocking: true` — §IV override 5 is
  unconditional and the spec gives no gate-specific exception. The field
  stays `boolean` (not simplified to a constant) so a future gate could
  differ.

### Task 52.4: `DiagnosisRef` — parse and render `TA-07.R.D`

**Read:** `docs/diagnose.md` §I.1 only.

**Files:** `packages/shared/src/diagnosis/ref.ts` + test.

- [x] `DiagnosisRefSchema = { code, mechanism, direction, context?: string }`
      with `renderDiagnosisRef` / `parseDiagnosisRef` round-tripping.
- [x] Tests: `TA-07.R.D` round-trips; a code with `direction: 'N'` renders
      without a dangling separator; an unknown code fails validation; the
      parameterized form (`OP-14.M [Sicilian Najdorf, ...]`) preserves its
      context string.
- [x] Commit: `feat: diagnosis reference parsing and rendering`.
- Note: "unknown code" validation is structural (regex, matching how
  `DiagnosisCodeEntrySchema` itself validates `id`), not catalog-membership
  — `TA07` (malformed) fails, `TA-07` never checked against whether it's one
  of the real 410 rows. Keeps `ref.ts` free of a circular import back to
  `index.ts`'s aggregation.

**Phase 52 complete.** The 410-code catalog, 20 data-quality gates, axis
vocabularies and `DiagnosisRef` parsing all ship as typed, zod-validated
data in `packages/shared/src/diagnosis/`, none of it wired to anything yet
(that starts at Phase 53).

---

## Phase 53 — Detector framework and the vertical slice

### Task 53.1: The framework

**Read:** `docs/diagnose.md` §4.4 only. Also read
`packages/chess-analysis/src/tactic-detectors/README.md` — this task
deliberately mirrors it.

**Files:** `packages/chess-analysis/src/diagnostics/{types,context,registry,
README}.ts` + tests.

```ts
export interface DiagnosticDetector {
  code: DiagnosisCodeId;
  direction: Direction;
  priority: number;   // §I.3 causal precedence; gaps of 10 between entries
  detect(ctx: PlyDiagnosticContext): DiagnosticObservation | null;
}
export interface DiagnosticObservation {
  code: DiagnosisCodeId; direction: Direction; ply: number;
  failed: boolean;        // the row's existence IS the opportunity
  hwdl: number; severity: Severity; reachability: number; detail: string;
}
```

- [x] `PlyDiagnosticContext` is built **once per ply** from the stored
      `ClassifiedMove` (features, CCT, motifs, alternatives, PV, clock) plus
      the opponent's CCT on `fenAfter`. No new engine calls on this path.
- [x] Unlike `classifyTacticMotif`, the registry does **not** stop at the
      first match — a ply can present several independent opportunities.
      Precedence is applied later, in Task 54.3.
- [x] Write `README.md` documenting the "add a detector" flow (new file →
      registry entry → catalog `detectability: 'detector'` → fixture test),
      mirroring the tactic-detectors one.
- [x] Commit: `feat: diagnostic detector framework`.

  **Done.** `packages/chess-analysis/src/diagnostics/{types,context,registry,
  README}.ts` + tests. `buildPlyDiagnosticContext` returns `null` when
  `fenBefore`/`fenAfter` are missing (legacy stored analyses only — every
  move from the current `classify.ts` pipeline has both); it computes
  `opponentChecksCapturesThreats` fresh via `analyzeChecksCapturesThreats
  (fenAfter)` since no field stores the opponent's post-move scan, and
  attaches an optional per-ply `moveTime` from a caller-supplied
  `PgnMoveComment[]` (Phase 51's clock data, not itself part of
  `ClassifiedMoveDto`). `DIAGNOSTIC_DETECTORS` starts empty — Task 53.3 adds
  the first entries.

### Task 53.2: CCT opportunity aggregation

**Read:** `docs/diagnose.md` §II.D only.

**Files:** `packages/chess-analysis/src/diagnostics/cct-opportunities.ts` + test.

The primitive every `MS-*` detector needs, built on the already-stored
`checksCapturesThreats` (nothing reads it today — see the reuse notes above).

- [x] For a ply: which profitable captures (`favorable`, or SEE > 0) were
      available and not played; which checks were available and not played;
      which opponent checks/captures/threats existed **after** the move.
- [x] Tests with hand-built FENs, including the empty case (no checks, no
      captures) which must produce no opportunities rather than a zero-count.
- [x] Commit: `feat: CCT opportunity aggregation primitive`.

  **Done.** `computeCctOpportunities` returns `unplayedProfitableCaptures`/
  `unplayedChecks` (the mover's own pre-move `checksCapturesThreats`, minus
  whatever `moveSan` was actually played) and `opponentChecks`/
  `opponentCaptures`/`opponentThreats` (straight from `context.ts`'s
  `opponentChecksCapturesThreats`, unfiltered — profitability of an opponent
  capture is the opponent's decision, not a precondition for the mover
  having had to notice it). "Profitable" is `favorable` (the one-ply
  heuristic already on `CaptureOpportunityDto`) OR a full `see()` > 0, since
  `favorable` alone misses exchanges a second defender changes the sign of.
  A hand-built bare-king FEN proves the empty case returns `[]` everywhere,
  not a sentinel.

### Task 53.3: `MS-*` one-ply move-safety detectors

**Read:** `docs/diagnose.md` §II.D only.

**Files:** one file per code under `diagnostics/detectors/` + tests.

- [x] `MS-01` opponent-check scan omission, `MS-02` opponent-capture scan
      omission, `MS-03` opponent-direct-threat omission (all three from the
      opponent's CCT on `fenAfter`).
- [x] `MS-04` own-check generation, `MS-05` own-capture generation, `MS-06`
      own-direct-threat generation (from the mover's own stored CCT).
- [x] `MS-07` automatic-recapture reflex (played a recapture on the
      just-captured square while a stronger intermediate move existed — this
      is also `TA-27` zwischenzug; precedence handles the overlap).
- [x] `MS-08` final destination-safety omission (SEE < 0 on the move's own
      destination square).
- [x] `MS-14` loose-piece scan omission (a loose own piece from `features`
      was punished within 2 plies).
- [x] Each gets a fixture proving the opportunity fires, one proving it does
      not, and one precedence case against its causal neighbour.
- [x] Flip each code's catalog `detectability` to `'detector'`.
- [x] Commit: `feat: MS one-ply move-safety diagnostic detectors`.

  **Done.** `diagnostics/detectors/ms-{01..08,14}-*.ts` + tests, plus a
  shared `detectors/shared.ts` (`qualityFailed`/`severityFromQuality`/
  `buildObservation`/`buildQualityObservation`, `destinationSquare`,
  `isCaptureSan`, `opponentOf`). MS-01..06/08's `failed` comes straight from
  `ctx.quality` (already the engine's full-search verdict on this exact
  position — no re-scan needed to know whether the CCT resource actually
  mattered); MS-07/14 have their own criteria (whether a stronger
  intermediate went unplayed; whether a loose piece was punished within two
  plies). `hwdl` is a provisional `ctx.drop`-derived proxy and
  `reachability` a flat placeholder — both named as such pending Phase 54.
  Two framework additions the detectors revealed were needed: `context.ts`
  gained `drop`/`previousMove`/`nextMoves` (MS-07 needs the prior ply to
  find "the just-captured square", MS-14 needs the next two plies to check
  whether a loose piece was punished — both optional, undefined when the
  caller only has one move in hand), and `cct-opportunities.ts` gained
  `unplayedThreats` (MS-06's own-generation counterpart to
  `unplayedChecks`/`unplayedProfitableCaptures`). MS-09..13 stay
  `'dialogue'` — no detector for the search-order/fixation/process codes in
  this plan.

### Task 53.4: `BV-*` board-vision detectors

**Read:** `docs/diagnose.md` §II.C only.

- [ ] `BV-01` own hanging-piece blindness, `BV-02` opponent hanging-piece
      blindness, `BV-04` attacker–defender counting failure, `BV-10`
      last-move board-update failure, `BV-12` removed-blocker blindness,
      `BV-15` destination-square safety, `BV-16` self-exposure, `BV-22`
      loose-piece inventory failure.
- [ ] Built from `features` (`hangingPieces`, `underDefendedPieces`,
      `piecesUnderAttack`), `featureDelta` (`newHangingPieces`, `newForks`),
      `attack-map` ray diffs and `see`.
- [ ] Same three-fixture rule per code as Task 53.3.
- [ ] Commit: `feat: BV board-vision diagnostic detectors`.

### Task 53.5: `TA-*` tactical detectors, both directions

**Read:** `docs/diagnose.md` §II.E only.

**Files:** `diagnostics/motif-to-code.ts` + detectors + tests.

- [ ] `motif-to-code.ts`: map a `TacticMotifType` plus its detector detail
      onto the precise code — `fork` splits by forking piece into `TA-07`
      (knight) / `TA-08` (pawn) / `TA-09` (king) / `TA-10` (slider); `pin`
      splits on `PinHit.kind` into `TA-11` / `TA-12`; `skewer`→`TA-14`,
      `discoveredAttack`→`TA-16`, `doubleCheck`→`TA-17`,
      `removesDefender`→`TA-18`, `overloadedDefender`→`TA-19`,
      `trappedPiece`→`TA-26`, `weakBackRank`→`TA-04`, `freePiece`→`TA-43`,
      `checkmate`→`TA-01`.
- [ ] Offensive direction (`O`) from `tacticOpportunity`; defensive (`D`)
      from Task 50.4's unbiased `diagnosticByPly`. One detector pair per code.
- [ ] Wire `computeTacticMotifRankHits` (currently uncalled) so each
      observation carries the rank at which the required move sat — Phase 54
      consumes it.
- [ ] Test that the same ply can yield both an `O` and a `D` observation for
      different codes without either suppressing the other.
- [ ] Commit: `feat: TA tactical diagnostic detectors in both directions`.

---

## Phase 54 — Reachability, hWDL, episodes

### Task 54.1: Human reachability

**Read:** `docs/diagnose.md` §4.5 and gate `DQ-05` only.

**Files:** `packages/chess-analysis/src/diagnostics/reachability.ts` + test;
service-side refinement in `apps/api/src/services/diagnostic-reachability.ts`.

Without this the system reports engine-only tactics as student failures, which
§4.4 explicitly forbids ("do not count an obscure engine tactic as an
opportunity simply because it appears in a best line").

- [ ] Pure score in `[0, 1]` from four free inputs: the required move's
      multiPv rank, forcing-ness (check / capture / mate), solution length
      from `bestLinePvSan` (now real, per Task 50.2), and SEE-obviousness.
- [ ] Optional service-side refinement: re-search the position at the depth
      the `BOT_ROSTER` Elo ladder maps the student's rating to, and check
      whether the required move is the top choice. Run this **only** for
      plies that already produced an episode, so it is a handful of positions
      per game, and put the depth ladder lookup in one named function.
- [ ] Threshold for `DQ-05` into `CONFIG`.
- [ ] Tests: a mate-in-one scores near 1; a rank-5 quiet move at 7 plies
      scores near 0; the score is monotonic in rank.
- [ ] Commit: `feat: human-reachability scoring for diagnostic opportunities`.

### Task 54.2: hWDL and severity

**Read:** `docs/diagnose.md` §4.3 and §III.3 only.

**Files:** `packages/chess-analysis/src/diagnostics/hwdl.ts` + test.

- [ ] hWDL = preventable expected-score loss, from the existing win% series
      (`winPctBefore`/`winPctAfter` are already on every move); reuse
      `expectedPoints` from `classify.ts` rather than re-deriving it.
- [ ] Map to the four severity bands (`minor` / `meaningful` / `major` /
      `decisive`), thresholds in `CONFIG`.
- [ ] Tests including a move in an already-decided position, which must be
      `minor` regardless of raw cp swing (the same principle
      `classify-severity.ts`'s damping already encodes).
- [ ] Commit: `feat: hWDL and severity for diagnostic observations`.

### Task 54.3: Episode resolution — causal precedence and cascades

**Read:** `docs/diagnose.md` §I.3 and gates `DQ-09`, `DQ-11` only.

**Files:** `packages/chess-analysis/src/diagnostics/resolve-episodes.ts` + test.

This is what stops one blunder from being reported as five weaknesses.

- [ ] Apply §I.3's ordering — rules → board model → board update → scan →
      recognition → candidate generation → calculation → judgment → state —
      so that when several observations describe one incident, the upstream
      code wins and the others become secondary manifestations, not
      independent episodes.
- [ ] `DQ-11` cascade collapsing: consecutive plies after a first error where
      the win% never recovers collapse into one episode.
- [ ] `DQ-09`: drop observations in completely lost or trivially won
      positions.
- [ ] Tests: a five-ply collapse after one hang yields exactly one episode; a
      knight-geometry failure and a knight-fork miss on the same ply yield
      `BV-06` primary with `TA-07` secondary, per the spec's own worked
      example in §I.3.
- [ ] Commit: `feat: causal precedence and cascade collapsing for episodes`.

---

## Phase 55 — Statistics

### Task 55.1: Game-clustered beta-binomial

**Read:** `docs/diagnose.md` §4.6 only.

**Files:** `packages/chess-analysis/src/diagnostics/beta-binomial.ts` + test.

§4.6 asks for this explicitly: "an automated implementation should eventually
use a game-clustered beta-binomial or comparable model rather than treating
every opportunity as independent."

- [ ] Aggregate per game, estimate overdispersion by method of moments, and
      compute a posterior mean plus credible interval with the code's rating
      prior as the Beta prior. Pure TypeScript — do not add a stats
      dependency without checking an existing one covers it.
- [ ] Tests: 4-of-8 spread over one game gives a materially wider interval
      than the same 4-of-8 spread over four games (this is the whole point of
      clustering); zero opportunities returns the prior, not `NaN`.
- [ ] Commit: `feat: game-clustered beta-binomial failure-rate estimation`.

### Task 55.2: Data-quality gate evaluation

**Read:** `docs/diagnose.md` §4.2 and §II.A only.

**Files:** `packages/chess-analysis/src/diagnostics/evaluate-gates.ts` + test.

- [ ] Implement the gates the captured data can support: `DQ-01` (window
      size), `DQ-02` (opportunity count), `DQ-03`/`DQ-15` (mixed controls —
      pool by the **exact** `time_control` string, never by speed class),
      `DQ-04` (missing clocks), `DQ-05` (reachability), `DQ-06` (sample
      dominated by one opening/opponent/side), `DQ-08` (provisional rating),
      `DQ-09`, `DQ-11`, `DQ-12` (variants/unrated), `DQ-13` (termination
      says disconnect), `DQ-16` (selection bias).
- [ ] Return the gates that fired with their evidence, never a bare boolean.
- [ ] Commit: `feat: data-quality gate evaluation`.

### Task 55.3: The diagnostic profile

**Read:** `docs/diagnose.md` §4.3, §III.1, §III.2 only.

**Files:** `packages/chess-analysis/src/diagnostics/build-profile.ts`,
`diagnostic-entry.ts` + tests.

Follow the `StatsEntry` + `buildStatsDashboard` shape — a pure aggregator over
a pre-resolved window, with the DB read done by the caller.

- [ ] Per code: `O`, `E`, `E/O`, posterior + interval, confidence tier
      (§4.6's table; **never `Confirmed`**), spread (games / sessions /
      openings / sides), total hWDL, severity mix, mean reachability.
- [ ] Scope tags (§III.2) by comparing subgroup rates against the overall
      rate — opening-, colour-, phase-, clock-, complexity-,
      opponent-strength- and session-bound. Sessions are derived from
      `played_at` + `played_at_time` gaps.
- [ ] Intact control skill: the paired code with a healthy rate (e.g.
      offensive `TA-07` as the control for defensive `TA-07`) — §VI requires
      one in every finding.
- [ ] History status (§III.1) by diffing against the previous stored profile
      window for the same time control.
- [ ] Tests: an empty window yields `Insufficient` everywhere and no
      diagnoses; a code above threshold in two consecutive windows reads
      `Persistent`; a resolved code that reappears reads `Regressed`.
- [ ] Commit: `feat: build the per-user diagnostic profile`.

### Task 55.4: Focus selection

**Read:** `docs/diagnose.md` §IV only.

**Files:** `packages/chess-analysis/src/diagnostics/select-focus.ts` + test.

- [ ] Score by §IV's objective — confidence × preventable impact × recurrence
      × transfer breadth × trainability × measurement feasibility — with the
      seven overrides as **hard filters**, not weights.
- [ ] Return one primary, at most two secondary findings, the intact control,
      and the differentials ruled out (§IV's "normally return" list).
- [ ] Tests: a high-rate but engine-only code is filtered by the
      human-reachability override; a downstream symptom loses to its upstream
      cause via the root-cause override; a code behind a failed blocking gate
      can never be primary.
- [ ] Commit: `feat: 1-2 week focus selection from the diagnostic profile`.

---

## Phase 56 — Persistence and jobs

### Task 56.1: Migration `0025_diagnostics`

**Files:** `apps/api/src/db/migrations/0025_diagnostics.ts`,
`apps/api/src/db/schema.ts`.

- [ ] `diagnostic_observations`: `id`, `user_id`, `game_id`, `ply`, `code`,
      `direction`, `failed`, `hwdl`, `severity`, `reachability`, `detail`,
      `created_at`; index on `(user_id, code, created_at)` and on `(game_id)`
      for the evidence drill-down and for cascade deletes on game removal.
- [ ] `diagnostic_profiles`: `id`, `user_id`, `time_control`, `window_start`,
      `window_end`, `computed_at`, `profile jsonb`; unique on
      `(user_id, time_control, window_end)` — the history status in Task 55.3
      is a row-to-row diff, so windows must be addressable.
- [ ] Commit: `feat: diagnostic observation and profile tables`.

### Task 56.2: Repositories

**Files:** `apps/api/src/db/repositories/diagnostic-observations.ts`,
`diagnostic-profiles.ts` + Testcontainers tests.

- [ ] `insertMany`, `listForUserSince`, `listForGame`, `deleteByGameId`
      (wire into the existing game-delete path alongside
      `analysesRepo.deleteByGameId`), `latestProfile`, `upsertProfile`.
- [ ] Commit: `feat: diagnostic repositories`.

### Task 56.3: Write observations during analysis

**Files:** `apps/api/src/services/analysis.ts`,
`apps/api/src/services/build-diagnostics.ts` + tests.

- [ ] Run the detector registry right after `buildGameReportForAnalysis` —
      that is already the point in `runAnalyzeGameJob` where everything is
      computed — then Task 54.3's episode resolution, then persist.
- [ ] Only the user's own colour produces observations.
- [ ] A detector throwing must not fail the analysis job; log and continue,
      the same way the job already isolates `deepen-analysis`.
- [ ] Commit: `feat: record diagnostic observations during game analysis`.

### Task 56.4: Profile rebuild job

**Files:** `apps/api/src/jobs/rebuild-diagnostic-profile.ts`,
`apps/api/src/jobs/index.ts`, `apps/api/src/jobs/queue.ts` + test.

- [ ] Enqueue via `helpers.addJob` when an analysis reaches `'ready'`, the
      same chaining idiom `analyze-game.ts` already uses for
      `deepen-analysis`.
- [ ] Reads observations + games, builds one profile per exact time control
      with enough games, writes them.
- [ ] Commit: `feat: diagnostic profile rebuild job`.

---

## Phase 57 — Coach integration

### Task 57.1: Structured mechanism on findings

**Read:** `docs/diagnose.md` §5 (including "Targeted test logic") and §I.2 only.

**Files:** migration `0026_finding_diagnosis.ts`,
`packages/shared/src/finding.ts`, `packages/prompts/src/tools.ts`,
`apps/api/src/services/progress.ts` + tests.

This is where the LLM earns its place. `howYouRunTheSession` point 1 already
tells the coach that "their ANSWER is your diagnostic material: a student who
says 'I didn't consider that move at all' has a different problem than one who
saw it but miscalculated" — that is §5's verbal sequence and §Targeted-test
logic, unformalized. Give it the vocabulary.

- [ ] Add `diagnosis_code`, `mechanism`, `direction` to `findings`
      (all nullable, so existing rows stay valid).
- [ ] Extend `FindingSchema` with the three optional fields; derive
      `category` from the code's `parentCategory` when a code is given, so
      the dashboard and trend chart keep working untouched.
- [ ] Validate the code against the catalog in `progress.ts` alongside the
      existing `assertValidCategory` — the LLM must never write an
      out-of-catalog code (AGENTS.md: no LLM output touches the DB without
      zod plus a closed-enum check).
- [ ] Update `record_finding`'s description in `packages/prompts/src/tools.ts`
      to explain the mechanism codes in terms of what the student *said*, and
      re-run `npm run docs:prompts`.
- [ ] Commit: `feat: structured diagnosis code and mechanism on findings`.

### Task 57.2: `get_diagnostic_profile` coach tool

**Read:** `docs/diagnose.md` §VI only.

**Files:** `packages/prompts/src/tools.ts`,
`packages/prompts/src/diagnostic-report.ts`,
`apps/api/src/services/coach-tools.ts` + tests.

- [ ] Returns a **digested text block**, never raw rows — AGENTS.md rule 8:
      anything over ~120 words of non-conversational data gets digested first.
      Top three diagnoses with `E/O`, confidence, severity, scope, intact
      control, and any failed gates.
- [ ] Wrap in `withTurnGuards` with a per-turn budget like
      `get_engine_analysis` has.
- [ ] `diagnostic-report.ts` follows AGENTS.md rule 9: one named constant or
      small function per section, `[...].filter(Boolean).join('\n\n')`
      assembly, data-shaped rendering in pure `render.ts`-style functions with
      empty-list tests.
- [ ] Commit: `feat: get_diagnostic_profile coach tool`.

### Task 57.3: Focus areas on diagnosis codes

**Read:** `docs/diagnose.md` §IV, §V only.

**Files:** migration `0027_focus_area_diagnosis.ts`,
`apps/api/src/services/progress.ts`, `packages/shared/src/dashboard.ts` + tests.

- [ ] Add `focus_areas.diagnosis_code`; relax `UNIQUE (user_id, category)` to
      `UNIQUE (user_id, diagnosis_code)` — today a student can only ever have
      one focus area per broad category, which the code-level taxonomy makes
      far too coarse.
- [ ] Selection becomes programmatic (Task 55.4); the LLM's
      `propose_focus_area_update` writes only the note and the state
      transition. Keep the max-3-active cap.
- [ ] Note in the service doc comment that the summarizer prompt claims
      over-cap creates are "queued" while `applyCreate` silently discards
      them — either implement queueing or correct the prompt text; do not
      leave the two disagreeing.
- [ ] Commit: `feat: focus areas keyed on diagnosis codes`.

### Task 57.4: Scoped code vocabulary in the prompts

**Read:** `docs/diagnose.md` §0.1 only.

**Files:** `packages/prompts/src/render.ts`,
`packages/prompts/src/coach-system.ts`,
`packages/prompts/src/analysis-planner.ts`,
`packages/prompts/src/progress-summarizer.ts` + snapshot tests.

The planner, summarizer and coach system prompt all currently inject
`MISTAKE_CATEGORIES_BLOCK`. **Never inject all 410 codes** — it would wreck
the prompt cache and the token budget.

- [ ] `renderScopedDiagnosisCodes(rating, activeDetectors)` — filters to codes
      whose `ratingPrior` overlaps the student's rating and that have a
      detector or are dialogue-detectable. Pure, unit-tested with edge cases
      (rating at a boundary, no overlapping codes).
- [ ] Keep the block in `staticPart` if it depends only on the rating band,
      or move it to `dynamicPart` if it depends on the numeric rating —
      whichever preserves the §8.1 cache shape; assert the choice in the
      snapshot test.
- [ ] Add the pair to `coach-system.refs.test.ts` if any block references
      another by name.
- [ ] `npm run docs:prompts`.
- [ ] Commit: `feat: scoped diagnosis-code vocabulary in coach prompts`.

---

## Phase 58 — Surfacing it

### Task 58.1: Route

**Files:** `apps/api/src/routes/diagnostics.ts`,
`apps/api/src/services/diagnostics.ts`, `packages/shared/src/diagnosis/api.ts`.

- [ ] `GET /api/users/me/diagnostics?timeControl=&window=` returning the
      stored profile, and `GET /api/users/me/diagnostics/:code/evidence`
      returning the observations behind one code.
- [ ] Commit: `feat: diagnostics API`.

### Task 58.2: Progress page

**Files:** `apps/web/src/features/dashboard/*`,
`apps/web/src/features/dashboard/DiagnosisCard.tsx` + tests.

- [ ] Show code-level diagnoses with `E/O`, confidence and scope alongside
      the existing focus areas.
- [ ] `FocusAreaCard`'s "View evidence" button and `TrendChart`'s
      `onBarClick` are both **no-ops today** — wire them to the evidence
      endpoint so a diagnosis drills down to the actual plies behind it.
- [ ] Components stay presentational and under ~120 lines; fetching lives in
      a TanStack Query hook.
- [ ] Commit: `feat: code-level diagnoses and evidence drill-down`.

---

## Calibration and standing constraints

- **§0.3 and §V require recalibration** of every rating prior and threshold
  against our own sample, at least every six months, version-dated. This is
  only cheap if every constant lives in `CONFIG` — enforce that in review.
- **`Confirmed` must never be emitted** while there is no probe subsystem
  (§4.6). Task 52.1 has a test for this; keep it.
- **Pool by exact time control** (§4.2). Never combine 10+0 with 15+10, never
  combine bullet/blitz/rapid, never let the coarse `speed` column become the
  pooling key.
- **The system must be allowed to return "Insufficient evidence"** (§II.A).
  A profile with no confident diagnosis is a correct output, not a bug.
- **Engine cost**: the reachability re-search (Task 54.1) is the only new
  engine work in this plan, and it is scoped to plies that already produced an
  episode. Anything that would add a per-ply engine call needs a fresh
  product decision, the way `scanPositionTactics` did.
