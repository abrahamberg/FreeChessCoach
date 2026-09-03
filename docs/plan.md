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

- [x] `BV-01` own hanging-piece blindness, `BV-02` opponent hanging-piece
      blindness, `BV-04` attacker–defender counting failure, `BV-10`
      last-move board-update failure, `BV-12` removed-blocker blindness,
      `BV-15` destination-square safety, `BV-16` self-exposure, `BV-22`
      loose-piece inventory failure.
- [x] Built from `features` (`hangingPieces`, `underDefendedPieces`,
      `piecesUnderAttack`), `featureDelta` (`newHangingPieces`, `newForks`),
      `attack-map` ray diffs and `see`.
- [x] Same three-fixture rule per code as Task 53.3.
- [x] Commit: `feat: BV board-vision diagnostic detectors`.

  **Done.** `diagnostics/detectors/bv-{01,02,04,10,12,15,16,22}-*.ts` + tests.
  BV-12/BV-16 reuse `tactic-discovered.ts`'s `discoveredAttackDetail`
  (built for `TA-16`'s offensive discovered attack) called with the
  *opponent's* color — the same function finds the mirror case for free:
  "did the mover's own move vacate a square and expose one of the mover's
  own pieces to a newly-revealed enemy attack," BV-16 narrowed to a king/
  queen target. BV-15 duplicates `MS-08`'s SEE check verbatim (a
  board-vision-layer name for the same fact `MS-08` names at the
  scan/process layer — deliberate, per §I.3, not a bug). BV-02 recomputes
  `computePositionFeatures(fenBefore)` itself since the stored move only
  carries post-move features. Registry reordered: `BV-*` (board model) now
  sits ahead of `MS-*` (scan/process) per §I.3's causal chain, so all 9
  `MS-*` priorities shifted from the 10-90 block to 110-190 to make room for
  `BV-*` at 10-80 — a one-time renumbering, not a behavior change (nothing
  outside `registry.ts`/tests reads literal priority values yet).

### Task 53.5: `TA-*` tactical detectors, both directions

**Read:** `docs/diagnose.md` §II.E only.

**Files:** `diagnostics/motif-to-code.ts` + detectors + tests.

- [x] `motif-to-code.ts`: map a `TacticMotifType` plus its detector detail
      onto the precise code — `fork` splits by forking piece into `TA-07`
      (knight) / `TA-08` (pawn) / `TA-09` (king) / `TA-10` (slider); `pin`
      splits on `PinHit.kind` into `TA-11` / `TA-12`; `skewer`→`TA-14`,
      `discoveredAttack`→`TA-16`, `doubleCheck`→`TA-17`,
      `removesDefender`→`TA-18`, `overloadedDefender`→`TA-19`,
      `trappedPiece`→`TA-26`, `weakBackRank`→`TA-04`, `freePiece`→`TA-43`,
      `checkmate`→`TA-01`.
- [x] Offensive direction (`O`) from `tacticOpportunity`; defensive (`D`)
      from Task 50.4's unbiased `diagnosticByPly`. One detector pair per code.
- [x] Wire `computeTacticMotifRankHits` (currently uncalled) so each
      observation carries the rank at which the required move sat — Phase 54
      consumes it.
- [x] Test that the same ply can yield both an `O` and a `D` observation for
      different codes without either suppressing the other.
- [x] Commit: `feat: TA tactical diagnostic detectors in both directions`.

  **Done.** `motif-to-code.ts` resolves the 9 direct-mapped motif types with
  no replay, and replays the embodying move (`forks()`/`pins()`, a pure
  board computation, not an engine call) for `fork`/`pin`'s piece/kind
  split. `detectors/ta-offensive.ts`/`ta-defensive.ts` are factory-built
  (one shared `detect` per direction, differing only in which code
  `motifToCode` must resolve to) rather than 24 near-identical files — the
  15 codes are a declarative table, not a case for hand-written detectors
  per file. `ctx.tacticOpportunity`/`ctx.tacticDiagnostic`/
  `ctx.tacticRankHits` are all caller-resolved-per-ply inputs (same pattern
  as `previousMove`/`nextMoves`): `tacticDiagnostic` mirrors
  `apps/api`'s `diagnosticByPly` entry shape locally (chess-analysis can't
  depend on apps/api), since that computation needs engine access and the
  full move list. Defensive-direction fork/pin sub-codes (`TA-07..12`) have
  no detector — `diagnosticByPly`'s `{type, failed, detail}` shape carries
  no replay data to sub-type them, and under-counting beats guessing.
  `DiagnosticObservation` gained an optional `rank` field for the wired
  `computeTacticMotifRankHits` signal. Registry priority blocks: `BV-*`
  10-80, `MS-*` 110-190, `TA-*` offensive 210-350, `TA-*` defensive
  410-490.

  **Phase 53 complete.** The detector framework, CCT-opportunity
  primitive, and all three vertical-slice families (`MS-*`, `BV-*`,
  `TA-*`) exist as pure, tested detectors in
  `packages/chess-analysis/src/diagnostics/`, wired into one priority-
  ordered registry — none of it called from anywhere yet (Phase 54 wires
  reachability/hWDL/episodes and Phase 55 wires the registry into an
  actual per-game pass).

---

## Phase 54 — Reachability, hWDL, episodes

### Task 54.1: Human reachability

**Read:** `docs/diagnose.md` §4.5 and gate `DQ-05` only.

**Files:** `packages/chess-analysis/src/diagnostics/reachability.ts` + test;
service-side refinement in `apps/api/src/services/diagnostic-reachability.ts`.

Without this the system reports engine-only tactics as student failures, which
§4.4 explicitly forbids ("do not count an obscure engine tactic as an
opportunity simply because it appears in a best line").

- [x] Pure score in `[0, 1]` from four free inputs: the required move's
      multiPv rank, forcing-ness (check / capture / mate), solution length
      from `bestLinePvSan` (now real, per Task 50.2), and SEE-obviousness.
- [x] Optional service-side refinement: re-search the position at the depth
      the `BOT_ROSTER` Elo ladder maps the student's rating to, and check
      whether the required move is the top choice. Run this **only** for
      plies that already produced an episode, so it is a handful of positions
      per game, and put the depth ladder lookup in one named function.
- [x] Threshold for `DQ-05` into `CONFIG`.
- [x] Tests: a mate-in-one scores near 1; a rank-5 quiet move at 7 plies
      scores near 0; the score is monotonic in rank.
- [x] Commit: `feat: human-reachability scoring for diagnostic opportunities`.

  Done. `computeHumanReachability` in `reachability.ts` blends four
  weighted [0,1] sub-scores (rank, forcing-ness, solution length, SEE
  gain), each saturating independently so under-counting stays the safe
  failure mode per §4.4; weights and the `dq05Threshold` gate constant live
  in `CONFIG.humanReachability`, with `isHumanReachable` as the one place
  that threshold is read. The pure function takes plain numbers/booleans,
  not a `PlyDiagnosticContext` — deriving those four inputs from a real ply
  is deferred to whichever Phase 54.3/55.2 caller first needs it, so this
  stays a free-standing primitive rather than guessing at a shape.
  `apps/api/src/services/diagnostic-reachability.ts` adds the optional
  engine-backed refinement: `depthForRating` (a `BOT_ROSTER.reduce` by
  nearest elo, mirroring `bot-candidates.ts`'s uncached-backend DI pattern)
  and `isReachableAtStudentDepth`, which re-searches one position at that
  depth via an injected `analyzeAtDepth` — callers are responsible for only
  invoking it per-episode, not per-ply, since it's a real engine call.

### Task 54.2: hWDL and severity

**Read:** `docs/diagnose.md` §4.3 and §III.3 only.

**Files:** `packages/chess-analysis/src/diagnostics/hwdl.ts` + test.

- [x] hWDL = preventable expected-score loss, from the existing win% series
      (`winPctBefore`/`winPctAfter` are already on every move); reuse
      `expectedPoints` from `classify.ts` rather than re-deriving it.
- [x] Map to the four severity bands (`minor` / `meaningful` / `major` /
      `decisive`), thresholds in `CONFIG`.
- [x] Tests including a move in an already-decided position, which must be
      `minor` regardless of raw cp swing (the same principle
      `classify-severity.ts`'s damping already encodes).
- [x] Commit: `feat: hWDL and severity for diagnostic observations`.

  Done. `computeHwdl` divides the mover-perspective `winPctBefore`/
  `winPctAfter` gap by 100 — those fields are already win probabilities
  from the identical sigmoid `expectedPoints` wraps (`winPctFor` in
  `win-probability.ts`), so this reuses that existing computation rather
  than calling `expectedPoints` a second time on a re-derived cp value.
  `hwdlSeverity` bands the result via `CONFIG.hwdl`'s thresholds (a direct
  relabeling of `CONFIG.severity`'s existing move-quality drop cutoffs onto
  §III.3's four-tier scale), then caps to `minor` for an already-decided
  position using the exact same three conditions (both-sides-winning,
  both-sides-losing, dead-draw-technical) `classify-severity.ts`'s
  `classifySeverity` damping applies — reusing `CONFIG.severity`'s
  threshold constants directly rather than duplicating magic numbers, but
  implemented independently of that function since its two-tier cap
  ('inaccuracy' vs 'good') doesn't carry over to a 4-band scale and that
  function is load-bearing/tested elsewhere. Like `reachability.ts`, this
  stays a free-standing primitive over plain numbers, not
  `PlyDiagnosticContext`-shaped — wiring into an actual detector/observation
  is for whichever later task first needs it.

### Task 54.3: Episode resolution — causal precedence and cascades

**Read:** `docs/diagnose.md` §I.3 and gates `DQ-09`, `DQ-11` only.

**Files:** `packages/chess-analysis/src/diagnostics/resolve-episodes.ts` + test.

This is what stops one blunder from being reported as five weaknesses.

- [x] Apply §I.3's ordering — rules → board model → board update → scan →
      recognition → candidate generation → calculation → judgment → state —
      so that when several observations describe one incident, the upstream
      code wins and the others become secondary manifestations, not
      independent episodes.
- [x] `DQ-11` cascade collapsing: consecutive plies after a first error where
      the win% never recovers collapse into one episode.
- [x] `DQ-09`: drop observations in completely lost or trivially won
      positions.
- [x] Tests: a five-ply collapse after one hang yields exactly one episode; a
      knight-geometry failure and a knight-fork miss on the same ply yield
      `BV-06` primary with `TA-07` secondary, per the spec's own worked
      example in §I.3.
- [x] Commit: `feat: causal precedence and cascade collapsing for episodes`.

  Done. `resolveEpisodes` walks an already-ply-ordered `EpisodePly[]`
  (win% context + that ply's registry observations — a free-standing input
  shape, like `reachability.ts`/`hwdl.ts`, not `PlyDiagnosticContext`
  itself, since nothing assembles a whole-game batch of those yet).
  `DQ-09` (`isCompletelyDecidedPosition`, reusing `CONFIG.severity`'s
  damping thresholds) filters each ply's observations before anything else
  runs. Cascade collapsing keeps one episode open from a ply's first
  `failed` observation until a later ply's win% climbs back above the
  win% the position stood at right before that first error — every ply in
  between, whether or not it has its own observation, stays part of the
  same incident's span. Precedence among an episode's pooled observations
  is two-tiered: first each code's family rank in `DIAGNOSIS_FAMILIES`
  (already ordered per this same §I.3 chain — settles `BV-*` vs `TA-*`
  even for a catalog code with no live detector yet, e.g. `BV-06`), then
  `DIAGNOSTIC_DETECTORS`' own priority order within a family, per that
  registry's own doc comment ("Task 54.3's precedence pass resolves ties
  by walking this order"). Wiring a real game's registry output into this
  shape is for whichever caller (Phase 55, most likely) first needs it.

  **Phase 54 complete.** Reachability (54.1), hWDL/severity (54.2), and
  episode resolution (54.3) all exist as pure, tested primitives in
  `packages/chess-analysis/src/diagnostics/` — none wired into
  `PlyDiagnosticContext`, the registry, or any caller yet, same "framework
  before wiring" shape Phase 53 closed with. Phase 55 (Statistics) is next:
  O/E/E-over-O aggregation, data-quality gate evaluation, and the
  diagnostic profile these three phases feed.

---

## Phase 55 — Statistics

### Task 55.1: Game-clustered beta-binomial

**Read:** `docs/diagnose.md` §4.6 only.

**Files:** `packages/chess-analysis/src/diagnostics/beta-binomial.ts` + test.

§4.6 asks for this explicitly: "an automated implementation should eventually
use a game-clustered beta-binomial or comparable model rather than treating
every opportunity as independent."

- [x] Aggregate per game, estimate overdispersion by method of moments, and
      compute a posterior mean plus credible interval with the code's rating
      prior as the Beta prior. Pure TypeScript — do not add a stats
      dependency without checking an existing one covers it.
- [x] Tests: 4-of-8 spread over one game gives a materially wider interval
      than the same 4-of-8 spread over four games (this is the whole point of
      clustering); zero opportunities returns the prior, not `NaN`.
- [x] Commit: `feat: game-clustered beta-binomial failure-rate estimation`.

  Done. `computeBetaBinomial` in `beta-binomial.ts` pools each code's
  per-game `{opportunities, failures}` and deflates the pooled count by a
  Kleinman/ANOVA method-of-moments intraclass-correlation estimate
  (`estimateOverdispersion`) before the conjugate Beta update — a single
  game is conservatively treated as fully correlated (`rho = 1`, since one
  cluster gives no evidence a repeat would differ), which alone is enough
  to make 4-of-8 confined to one game report a materially wider credible
  interval than the same 4-of-8 spread over four games. The Beta prior's
  mean comes from `ratingPriorMean`: the code's `ratingPrior` band read as
  §0.1 describes it (a "primary diagnosis" window, not a population base
  rate) — 0.5 at the band's midpoint, pulled up below the band and down
  above it, clamped to `[0.05, 0.95]`; its pseudo-count
  (`CONFIG.betaBinomial.priorStrength`) is weak enough that a few real
  games dominate it but present so zero opportunities still returns a
  sane rating-shaped estimate, never `NaN`. The credible interval uses a
  normal approximation to the posterior Beta rather than an exact
  incomplete-beta inverse — no stats dependency exists in this package and
  §4.6 itself calls these "practical defaults, not immutable statistical
  laws". Free-standing primitive over plain `GameOpportunities[]`, same
  reasoning as `reachability.ts`/`hwdl.ts`/`resolve-episodes.ts` — wiring
  to real per-game aggregates is for whichever caller needs it (likely
  Task 55.3).

### Task 55.2: Data-quality gate evaluation

**Read:** `docs/diagnose.md` §4.2 and §II.A only.

**Files:** `packages/chess-analysis/src/diagnostics/evaluate-gates.ts` + test.

- [x] Implement the gates the captured data can support: `DQ-01` (window
      size), `DQ-02` (opportunity count), `DQ-03`/`DQ-15` (mixed controls —
      pool by the **exact** `time_control` string, never by speed class),
      `DQ-04` (missing clocks), `DQ-05` (reachability), `DQ-06` (sample
      dominated by one opening/opponent/side), `DQ-08` (provisional rating),
      `DQ-09`, `DQ-11`, `DQ-12` (variants/unrated), `DQ-13` (termination
      says disconnect), `DQ-16` (selection bias).
- [x] Return the gates that fired with their evidence, never a bare boolean.
- [x] Commit: `feat: data-quality gate evaluation`.

  Done. `evaluateGates` in `evaluate-gates.ts` runs twelve independent
  checks (`DQ-01/02/03/04/05/06/08/09/11/12/13/16`, `DQ-03` and `DQ-15`
  sharing one mixed-time-control check since §II.A itself groups them)
  over a `GateEvaluationInput` — a plain `GateWindowGame[]` window plus the
  per-code aggregates (`opportunities`, `meanReachability`,
  `cascadeCollapsedCount` from `resolveEpisodes`' collapsing,
  `decidedPositionIncidentCount`/`totalIncidentCount` for DQ-09,
  `selectionBias` since a pre-filtered sample is indistinguishable from an
  unfiltered one at the schema level) — and returns every gate that fired
  with a human-readable `evidence` string, never a boolean. `DQ-06`
  (dominance) and `DQ-08` (rating stability) each check several conditions
  and return on the first that trips, rather than only ever reporting one
  cause. Thresholds with no spec-given number (`dominanceShareThreshold`,
  `ratingSwingThreshold`, `maxClockMissingRatio`) live in
  `CONFIG.dataQualityGates`, documented as practical defaults pending
  recalibration, same precedent as `ratingEstimate`'s own arbitrary
  constants; `DQ-05` reuses `CONFIG.humanReachability.dq05Threshold`
  directly. `DataQualityGateId`/`DATA_QUALITY_GATES` already existed in
  `packages/shared/src/diagnosis/data-quality.ts` (Task 52.1) — reused for
  the `code` type rather than re-declaring the twenty-gate ID union. Free-
  standing primitive over plain inputs, same pattern as every other Phase
  54/55 module — wiring real per-game/per-code queries into
  `GateEvaluationInput` is Task 55.3's job.

### Task 55.3: The diagnostic profile

**Read:** `docs/diagnose.md` §4.3, §III.1, §III.2 only.

**Files:** `packages/chess-analysis/src/diagnostics/build-profile.ts`,
`diagnostic-entry.ts` + tests.

Follow the `StatsEntry` + `buildStatsDashboard` shape — a pure aggregator over
a pre-resolved window, with the DB read done by the caller.

- [x] Per code: `O`, `E`, `E/O`, posterior + interval, confidence tier
      (§4.6's table; **never `Confirmed`**), spread (games / sessions /
      openings / sides), total hWDL, severity mix, mean reachability.
- [x] Scope tags (§III.2) by comparing subgroup rates against the overall
      rate — opening-, colour-, phase-, clock-, complexity-,
      opponent-strength- and session-bound. Sessions are derived from
      `played_at` + `played_at_time` gaps.
- [x] Intact control skill: the paired code with a healthy rate (e.g.
      offensive `TA-07` as the control for defensive `TA-07`) — §VI requires
      one in every finding.
- [x] History status (§III.1) by diffing against the previous stored profile
      window for the same time control.
- [x] Tests: an empty window yields `Insufficient` everywhere and no
      diagnoses; a code above threshold in two consecutive windows reads
      `Persistent`; a resolved code that reappears reads `Regressed`.
- [x] Commit: `feat: build the per-user diagnostic profile`.

  Done. Three files. `diagnostic-entry.ts` defines `DiagnosticEntry`, the
  `StatsEntry`-shaped input — one already-resolved opportunity (`failed`
  episodes are expected to already be one post-`resolveEpisodes` primary,
  same "caller does the DB read and the collapsing" contract as every
  other Phase 54/55 module). `scope-tags.ts`'s `detectScopeTags` covers the
  seven data-supportable §III.2 dimensions by comparing each bucket's rate
  against the *rest* of the sample (not the raw overall rate, which the
  bucket itself would dilute), gated on a minimum bucket size so small
  samples can't trip a tag; clock/complexity/opponent-strength split on
  their own median rather than a hardcoded threshold, since "low clock" has
  no fixed meaning across time controls; `'general'` when nothing clears
  the bar. `deriveSessions` walks games sorted by `playedAt` and starts a
  new session whenever the gap exceeds `CONFIG.diagnosticProfile.sessionGapMs`
  (`playedAt` is expected to already combine the DB's separate
  `played_at`/`played_at_time` columns — the caller's job). `build-profile.ts`'s
  `buildDiagnosticProfile` groups entries by `code:direction`, computes
  O/E/E/O and severity mix/total hWDL/mean reachability over the group, the
  posterior via Task 55.1's `computeBetaBinomial` (one `GameOpportunities`
  per distinct `gameId`, `ratingPrior` from `DIAGNOSIS_CODES_BY_ID`), and
  confidence via §4.6's table read literally into
  `CONFIG.diagnosticProfile`'s thresholds. Control skill looks up the same
  code's opposite direction group and reports it only when that group's own
  failure rate clears `controlHealthyMaxFailureRate`. History status
  (`nextHistoryStatus`) diffs against a caller-supplied
  `PreviousProfileEntry[]`: no prior record is always `'newly_observed'`;
  above threshold with a `'resolved'` prior is `'regressed'`; above
  threshold with any other `aboveThreshold: true` prior is `'persistent'`;
  dropping below threshold after being above it is `'monitoring'` (§III.1:
  "durable transfer is unproven") and only becomes `'resolved'` after a
  *second* consecutive clean window — a narrower reading than the task
  bullet asked for tests on, but directly required by §III.1's own
  definitions, so it's tested too. Note on Task 55.2's own done-note: it
  speculated wiring `evaluate-gates.ts` into this task; that didn't happen
  — `evaluateGates` and `buildDiagnosticProfile` stay independent pure
  modules for now (same "framework before wiring" precedent as reachability/
  hWDL/episodes), since neither this task's checklist nor §4.3/§III.1/§III.2
  called for gate-driven filtering here. Actually wiring a fired gate into
  suppressing a profile entry is Task 55.4 (focus selection)'s
  data-quality override, or a later persistence-layer caller.

### Task 55.4: Focus selection

**Read:** `docs/diagnose.md` §IV only.

**Files:** `packages/chess-analysis/src/diagnostics/select-focus.ts` + test.

- [x] Score by §IV's objective — confidence × preventable impact × recurrence
      × transfer breadth × trainability × measurement feasibility — with the
      seven overrides as **hard filters**, not weights.
- [x] Return one primary, at most two secondary findings, the intact control,
      and the differentials ruled out (§IV's "normally return" list).
- [x] Tests: a high-rate but engine-only code is filtered by the
      human-reachability override; a downstream symptom loses to its upstream
      cause via the root-cause override; a code behind a failed blocking gate
      can never be primary.
- [x] Commit: `feat: 1-2 week focus selection from the diagnostic profile`.

  **Done:** `selectFocus(input)` takes `FocusCandidate[]` — each a
  `DiagnosticProfileEntry` (Task 55.3) joined with that same code's own
  `FiredGate[]` (Task 55.2's `evaluateGates`, which is called per-code, not
  once per window — its `opportunities`/`meanReachability`/etc. inputs are
  the code's own), since the two modules stay independent pure primitives
  per 55.3's done note; `select-focus.ts` is the caller that finally joins
  them. Applies all seven §IV overrides as hard filters (`applyOverrides`,
  run before any scoring) plus an eighth precondition (insufficient
  confidence can never be primary/secondary — not one of the seven named
  overrides, but required by §4.6's "the system must be allowed to return
  Insufficient evidence"):

  - Overrides 1 (prerequisite) + 2 (root-cause) merged into one pass, same
    reasoning `evaluate-gates.ts` used to merge DQ-03/DQ-15: both reduce to
    "test the more upstream cause first" per §I.3's chain (rules → board
    model → board update → scan/process → recognition → candidate
    generation → calculation → judgment → state). Deliberately narrower
    than `resolve-episodes.ts`'s `familyRank` (all 18 families, used to
    break ties *within one already-linked incident*): here only `RB`/`BV`/
    `MS`/`TA`/`CA` — the five families §I.3's own text and examples
    actually name — participate, so two unrelated content domains (e.g.
    `EG` vs `PW`) are never filtered against each other on an arbitrary
    tie-break order. Covered by a dedicated test asserting exactly that.
  - Override 3 (human-reachability) reuses `isHumanReachable` from
    `reachability.ts` (Task 54.1) directly rather than re-checking the
    threshold.
  - Override 4 (scope: "must fit a focused cycle") has no code to write —
    every `FocusCandidate` is already one atomic code+direction skill from
    the §II catalog, which is this codebase's own operational definition of
    "fits a focused cycle." Documented as a deliberate no-op in
    `select-focus.ts`'s own doc comment rather than silently skipped.
  - Override 5 (data-quality) disqualifies a candidate outright whenever its
    `firedGates` is non-empty — every §II.A gate is `blocking: true` with no
    exception (`data-quality.ts`'s own doc comment), so this is unconditional.
  - Override 6 (state) suppresses a `clock_bound`/`stress_sensitive`-tagged
    chess-concept candidate whenever an eligible `PS-*` (§I.2's "S"
    mechanism) candidate is also present, on the reading that the same
    incidents are more likely one state-conditioned pattern than an
    independent concept gap.
  - Override 7 (curriculum-value) reuses `evidenceTrack` (Task 52.2) rather
    than a new heuristic: a `'curriculum_only_gap'` candidate loses to any
    `'game_leak'` candidate with more episodes. The spec's own "...unless
    strategically important" exception is not implemented — no signal in
    this codebase currently distinguishes "strategically important"
    curriculum content from any other, so implementing it would mean
    guessing; documented as a known gap rather than a silent omission.

  §IV's scoring objective is computed from fields Task 55.3 already
  produces: preventable impact is mean hWDL per failed episode (hWDL is
  already "preventable expected-score loss") times `meanReachability`, so
  impact that wasn't actually preventable scores low without inventing a
  second weight; recurrence and measurement feasibility both saturate at 8
  opportunities/episodes, reusing `diagnosticProfile.confidenceProbableMinOpportunities`'s
  own scale rather than a new number; transfer breadth reads
  `detectScopeTags`'s own `'general'` vs bound output; trainability reads
  whether `controlSkill` is present (§VI's own reasoning for requiring one).
  Most of §IV's "reduce priority when" list turned out to already be
  structurally satisfied by the hard filters and the confidence gate
  (documented in `scoreOf`'s doc comment) rather than needing separate soft
  penalties — only "already improving" needed one
  (`improvingPriorityMultiplier`).

  `differentials` records *why* every non-selected candidate was ruled out
  (the override/gate/score reason), not just which codes were — every
  exclusion path in `applyOverrides` writes a reason string before dropping
  a candidate. `controlSkill` is mirrored at the top level from
  `primary.controlSkill` since §IV's "normally return" list names it as its
  own item.

  This is Phase 55's last task — all four of `beta-binomial.ts`,
  `evaluate-gates.ts`, `build-profile.ts`/`scope-tags.ts`, and
  `select-focus.ts` remain independent pure primitives; wiring them into one
  real pipeline against DB-backed game data is Phase 56's job, starting with
  Task 56.1's migration.

---

## Phase 56 — Persistence and jobs

### Task 56.1: Migration `0025_diagnostics`

**Files:** `apps/api/src/db/migrations/0025_diagnostics.ts`,
`apps/api/src/db/schema.ts`.

- [x] `diagnostic_observations`: `id`, `user_id`, `game_id`, `ply`, `code`,
      `direction`, `failed`, `hwdl`, `severity`, `reachability`, `detail`,
      `created_at`; index on `(user_id, code, created_at)` and on `(game_id)`
      for the evidence drill-down and for cascade deletes on game removal.
- [x] `diagnostic_profiles`: `id`, `user_id`, `time_control`, `window_start`,
      `window_end`, `computed_at`, `profile jsonb`; unique on
      `(user_id, time_control, window_end)` — the history status in Task 55.3
      is a row-to-row diff, so windows must be addressable.
- [x] Commit: `feat: diagnostic observation and profile tables`.

**Done:** `code` is left as unconstrained `text` (no CHECK), matching
`findings.category`'s existing precedent — the catalog has 410 entries
validated at the app layer, not a DB constraint that would need editing on
every catalog change. `direction`/`severity` are small, stable vocabularies
(4 values each) so they got CHECK constraints, matching
`analyses.status`/`findings.severity`. `hwdl`/`reachability` are
`double precision` (both are `[0, 1]` probabilities, no existing float-
column precedent to match). `detail jsonb` holds the rest of
`DiagnosticEntry`'s context (opening, phase, clock, complexity, opponent
rating) that has no dedicated column — read-only evidence-drilldown
payload for Task 58.1, never queried on. No `ON DELETE CASCADE` on either
FK: every existing user/game-scoped table (`analyses`, `findings`,
`game_move_qualities`) relies on the app layer to cascade deletes
explicitly, and Task 56.2's `deleteByGameId` wires into that same existing
path rather than introducing the first DB-level cascade. No dedicated
migration test exists (none of this task's files are a test file) —
verified via `npm run lint && npm run typecheck`; applying it against a
real Postgres isn't possible in this sandbox (no Docker for Testcontainers),
so first real application happens under Task 56.2's repository tests.

### Task 56.2: Repositories

**Files:** `apps/api/src/db/repositories/diagnostic-observations.ts`,
`diagnostic-profiles.ts` + Testcontainers tests.

- [x] `insertMany`, `listForUserSince`, `listForGame`, `deleteByGameId`
      (wire into the existing game-delete path alongside
      `analysesRepo.deleteByGameId`), `latestProfile`, `upsertProfile`.
- [x] Commit: `feat: diagnostic repositories`.

**Done:** `insertMany` batches via Kysely's array-values insert (this repo
had no prior bulk-insert precedent) and no-ops on an empty array so a game
with zero surviving episodes never issues a round trip. `diagnostic_profiles.
profile` round-trips as the literal `DiagnosticProfileEntry[]` Task 55.3's
`buildDiagnosticProfile` returns — `upsertProfile` JSON-stringifies it once
and `onConflict` targets the `(userId, timeControl, windowEnd)` unique
constraint from 0025_diagnostics.ts, replacing `windowStart`/`profile`/
`computedAt` on a repeat rebuild of the same window rather than duplicating
rows. `deleteByGameId` (diagnostic-observations.ts) is wired into
`services/games.ts`'s existing `deleteGameForUser` transaction, right after
`analysesRepo.deleteByGameId`, matching that function's own dependency-order
convention. Testcontainers tests are written for every function (round-trip,
empty-array no-op, since-cutoff filtering, per-game deletion scoping,
per-time-control pooling, repeat-upsert replacement) but unrun — no Docker
in this sandbox, same limitation as Task 56.1; `npm run lint && npm run
typecheck` are clean, and `tsc -b` type-checks the test files as part of the
build.

### Task 56.3: Write observations during analysis

**Files:** `apps/api/src/services/analysis.ts`,
`apps/api/src/services/build-diagnostics.ts` + tests.

- [x] Run the detector registry right after `buildGameReportForAnalysis` —
      that is already the point in `runAnalyzeGameJob` where everything is
      computed — then Task 54.3's episode resolution, then persist.
- [x] Only the user's own colour produces observations.
- [x] A detector throwing must not fail the analysis job; log and continue,
      the same way the job already isolates `deepen-analysis`.
- [x] Commit: `feat: record diagnostic observations during game analysis`.

**Done:** `build-diagnostics.ts`'s `buildDiagnosticObservations` is the
orchestration layer this task called for: it filters to `userColor`'s own
plies (only these ever produce rows), builds each ply's
`PlyDiagnosticContext` (wiring in `previousMove`/`nextMoves` from a
ply-keyed lookup over the whole game, `extractPgnMoveComments` for
`moveTimes`, `computeTacticMotifRankHits` for `TA-*` direction-`O`'s "found
it at rank N" signal, and `prevention.diagnosticByPly` — already computed
earlier in the job — for direction-`D`'s unbiased source), runs the
registry, then `resolveEpisodes`. Only each episode's `primary` becomes a
row (secondaries are folded into the same incident, never persisted
separately, per §I.3) plus one row per non-failed observation (§4.4's O
denominator) — this mirrors `diagnostic-entry.ts`'s own doc comment on what
a "surviving" entry is. `detail` currently holds only the detector's
human-readable text; the richer per-opportunity context
(opening/phase/clock/complexity/opponent rating) is game/session-level, so
it's deferred to Task 56.4 joining `games`/`analyses` at read time rather
than duplicating it onto every row here — noted as a deliberate scope
decision, not an oversight.

Two isolation layers exist, not one: `buildDiagnosticObservations` itself
catches each individual detector's exception (a `detectors` DI parameter,
defaulting to the real registry, exists solely so a test can inject a
throwing fake without needing a live registry entry that misbehaves) so one
bad detector never blanks out the rest of that ply or the rest of the game;
`services/analysis.ts`'s new `recordDiagnosticObservations` then wraps the
whole build-and-persist step in its own try/catch, logging and continuing
exactly like the task's checklist asks, since this step runs inline inside
`runAnalyzeGameJob` rather than as its own queued job the way
`deepen-analysis` is isolated.

Tests: `build-diagnostics.test.ts` (6 tests, all passing) unit-tests the
orchestration with injected fake detectors — user-colour filtering, a
throwing detector not stopping its ply-mates or the rest of the game,
episode collapse to one primary row, non-failed rows surviving
independently, and the DB-row field mapping. `analysis-diagnostics.test.ts`
and `analysis-diagnostics-failure.test.ts` (real-DB, Testcontainers, same
convention as Task 56.2) prove observations land in the table only for the
user's plies, and that a persist-step failure (mocked at the module
boundary in its own file, via `vi.mock`, so it can't affect the
happy-path file's real-persistence assertion) still leaves the analysis
`ready` with no `error` set. Unrun here — no Docker in this sandbox, same
limitation as Tasks 56.1/56.2 — but `npm run lint && npm run typecheck` are
clean, and the full non-DB suite (2108 tests) still passes with zero
regressions.

### Task 56.4: Profile rebuild job

**Files:** `apps/api/src/jobs/rebuild-diagnostic-profile.ts`,
`apps/api/src/jobs/index.ts`, `apps/api/src/jobs/queue.ts` + test.

- [x] Enqueue via `helpers.addJob` when an analysis reaches `'ready'`, the
      same chaining idiom `analyze-game.ts` already uses for
      `deepen-analysis`.
- [x] Reads observations + games, builds one profile per exact time control
      with enough games, writes them.
- [x] Commit: `feat: diagnostic profile rebuild job`.

**Done:** This is the first place Phase 54/55's independent pure primitives
actually run end-to-end: `buildDiagnosticProfile` (Task 55.3) already calls
`computeBetaBinomial` (Task 55.1) internally per code, so `rebuild-
diagnostic-profile.ts` itself is pure assembly — group a user's rated games
by exact `time_control` (§4.2), rebuild each surviving observation's
`DiagnosticEntry` context, run `buildDiagnosticProfile`, upsert. "Enough
games" reuses `CONFIG.dataQualityGates.minRatedGames` (30) directly — it's
the same number §4.2's own text gives ("start with 30 recent rated games").
The window's upper bound (§4.2: "expand to 60–100 when opportunities are
rare") is collapsed to a fixed 100-game cap rather than the spec's adaptive
per-code expansion, which would need iterative re-querying per code — a
documented, deliberate simplification, same "known gap" precedent as Task
55.4's curriculum-value exception. `window_start`/`window_end` are the
earliest/latest `playedAt` (falling back to `createdAt`) among the included
games, not a calendar window — this is also what makes `upsertProfile`'s
`(user_id, time_control, window_end)` unique constraint idempotent: re-
running against an unchanged game set upserts the same row.

The richer per-opportunity context `build-diagnostics.ts` (Task 56.3)
deliberately deferred — opening, phase, clock, opponent rating — gets
joined here: `opening` from `games.eco`, `opponentRating` from
`whiteElo`/`blackElo` by `userColor`, `phase` from
`analysesRepo.findClassifiedMovesByGameId` keyed by ply, `clockRemainingMs`
from `extractPgnMoveComments` over the game's own PGN. `complexity` stays
`null` — `rating-estimate.ts`'s `complexity` is a whole-game scalar, not a
per-ply one, and inventing a new per-ply primitive is out of scope for a
persistence/wiring task. `studentRating` falls back to a neutral `1200`
when `users.rating` (Task 51.5) is unset. Gate evaluation (Task 55.2) is
deliberately NOT run here: `evaluateGates` needs `resolveEpisodes`'s own
cascade/decided-position counts (Task 54.3), which are never persisted onto
a `diagnostic_observations` row, so there's nothing to evaluate gates
against without re-running detection — Task 57.2's coach tool is the
documented next place that decision gets made.

`queue.ts` gained `enqueueRebuildDiagnosticProfile`, matching
`enqueueBackfillGameMetadata`'s precedent (a job normally auto-chained, but
also operator-triggerable through the same queue). The auto-chain itself
lives in `analyze-game.ts` right next to the existing `deepen-analysis`
enqueue, both firing once `runAnalyzeGameJob` reaches `'ready'`. Every
existing test that constructs a `JobQueue` object literal needed the new
required method added — mechanical, no behavior change.

Tests: `rebuild-diagnostic-profile.test.ts` (7 tests, pure, no DB — ran and
passed) covers `windowByTimeControl`'s grouping/threshold/cap logic
directly, since that's the actually-risky new composition logic here.
`rebuild-diagnostic-profile-integration.test.ts` (Testcontainers, real DB,
same convention as Tasks 56.1-56.3) proves the full pipeline end-to-end:
below-minimum time controls get no profile, a cleared minimum builds and
persists one with correctly joined fields, unrelated time controls stay
pooled separately, re-running upserts rather than duplicates, and unrated
games are excluded from both the window and the built profile. Unrun here —
no Docker in this sandbox, same limitation as every prior Phase 56 task —
but `npm run lint && npm run typecheck` are clean, and the full non-DB
suite (2115 tests, up from 2108) passes with zero regressions; the 57
Docker-dependent failures (56 pre-existing + this task's own new
integration file) all fail identically with "Could not find a working
container runtime strategy", not a code error.

**Phase 56 — Persistence and jobs is now complete.** All four tasks
(migration, repositories, write-path, rebuild job) are implemented, tested,
linted, and typechecked. The diagnostics pipeline built across Phases
52-56 — catalog, detectors, episode resolution, statistics, focus
selection, and now persistence — is wired end-to-end from game analysis to
a stored per-user profile, though nothing outside this pipeline reads it
yet. Phase 57 (coach integration) is next.

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

- [x] Add `diagnosis_code`, `mechanism`, `direction` to `findings`
      (all nullable, so existing rows stay valid).
- [x] Extend `FindingSchema` with the three optional fields; derive
      `category` from the code's `parentCategory` when a code is given, so
      the dashboard and trend chart keep working untouched.
- [x] Validate the code against the catalog in `progress.ts` alongside the
      existing `assertValidCategory` — the LLM must never write an
      out-of-catalog code (AGENTS.md: no LLM output touches the DB without
      zod plus a closed-enum check).
- [x] Update `record_finding`'s description in `packages/prompts/src/tools.ts`
      to explain the mechanism codes in terms of what the student *said*, and
      re-run `npm run docs:prompts`.
- [x] Commit: `feat: structured diagnosis code and mechanism on findings`.

**Done:** §I.2 supplies the closed 10-value mechanism vocabulary directly
(`K`/`M`/`V`/`R`/`G`/`C`/`J`/`X`/`L`/`S`) — already typed as `Mechanism` in
`packages/shared/src/diagnosis/axes.ts` from Task 52.1, so this task reuses
it rather than redefining anything; same for `Direction`
(`O`/`D`/`B`/`N`, §I.1). Migration `0026_finding_diagnosis.ts` adds all three
columns nullable, `mechanism`/`direction` with CHECK constraints (small
stable vocabularies, same convention `0025_diagnostics.ts` set), and
`diagnosis_code` left unconstrained `text` (410-entry catalog, app-validated
— same convention as `diagnostic_observations.code`). Also fixed a bug found
while wiring this: Task 56.1's `0025_diagnostics.ts` was never registered in
`apps/api/src/db/migrate.ts`'s provider map (no Docker was available in that
task's sandbox to catch it by actually running the migrator) — both
`0025_diagnostics` and `0026_finding_diagnosis` are now registered.

`FindingSchema` keeps `category` required (no schema break) and adds
`diagnosisCode`/`mechanism`/`direction` as optional; a `.transform` derives
`category` from `DIAGNOSIS_CODES_BY_ID.get(diagnosisCode)?.parentCategory`
when it resolves, overriding whatever `category` was supplied so the two can
never disagree — falling back to the given `category` when `diagnosisCode`
doesn't resolve (malformed or out-of-catalog). `DiagnosisCodeIdSchema` is
still only a format check (`XX-99`, Task 52.2's own precedent — never
inlining all 410 ids into a zod enum); `progress.ts`'s new
`assertValidDiagnosisCode` is the actual closed-enum gate, thrown as
`ValidationError` alongside `assertValidCategory`, same treatment. Both
`findings.ts` (repository) and `apps/api/src/db/schema.ts`'s `FindingsTable`
carry the three new nullable columns through to persistence.

`record_finding`'s description now spells out the mechanism codes in terms
of the student's own words from §5's verbal sequence ("I didn't even look at
that move" → G, "I saw it but thought it lost material" → C/J, "I knew that
a week ago but blanked" → M, a clock-pressure-only pattern → S) rather than
listing the taxonomy abstractly, per `docs/diagnose.md` §5's own framing that
this is diagnostic material already sitting in the student's answer, not a
separate judgment call. `npm run docs:prompts` regenerated `docs/prompts.md`
and the 20 `coach-system.snapshot.test.ts` snapshots were updated
(`npx vitest run -u`) — diffed to confirm the only change in every snapshot
is the `record_finding` description line.

Verification: `npm run lint && npm run typecheck` clean; full non-DB suite
2119 passed (up from 2115), 349 skipped, zero regressions — the 57 failing
files are the same Testcontainers-dependent set as Task 56.4 ("Could not
find a working container runtime strategy", no Docker in this sandbox).

### Task 57.2: `get_diagnostic_profile` coach tool

**Read:** `docs/diagnose.md` §VI only.

**Files:** `packages/prompts/src/tools.ts`,
`packages/prompts/src/diagnostic-report.ts`,
`apps/api/src/services/coach-tools.ts` + tests.

- [x] Returns a **digested text block**, never raw rows — AGENTS.md rule 8:
      anything over ~120 words of non-conversational data gets digested first.
      Top three diagnoses with `E/O`, confidence, severity, scope, intact
      control, and any failed gates.
- [x] Wrap in `withTurnGuards` with a per-turn budget like
      `get_engine_analysis` has.
- [x] `diagnostic-report.ts` follows AGENTS.md rule 9: one named constant or
      small function per section, `[...].filter(Boolean).join('\n\n')`
      assembly, data-shaped rendering in pure `render.ts`-style functions with
      empty-list tests.
- [x] Commit: `feat: get_diagnostic_profile coach tool`.

**Done:** "Top three diagnoses" ranks by confidence tier (`probable` >
`signal`) then episode count, dropping `insufficient` entries entirely — the
plan's own standing constraint that "no confident diagnosis" is a correct,
reportable answer, not a slot to pad. This is a deliberately narrower
ranking than `select-focus.ts`'s (Task 55.4) full §IV override machinery: an
eligible primary/secondary there can never carry a fired gate (override 5
excludes it), so it could never render a "Failed gates" line — but the
checklist explicitly asks for one per diagnosis, meaning this digest reports
raw standing, caveats included, rather than the "what to work on next" pick
`select_focus` already owns.

Gate evaluation (Task 55.2's `evaluateGates`) was never wired anywhere
through Phase 56 — `rebuild-diagnostic-profile.ts`'s own doc comment named
Task 57.2 as where that decision gets made. Answer: on demand, inside the
coach tool itself, against a freshly recomputed window (`windowByTimeControl`
+ `toGateWindowGame`, factored out of the rebuild job into
`apps/api/src/services/diagnostic-window.ts` so both share one definition of
"the window"). `cascadeCollapsedCount`/`decidedPositionIncidentCount` are
always `0` here — that per-incident bookkeeping lives only transiently
inside `resolveEpisodes` at analysis time (Task 56.3) and was never
persisted onto a `diagnostic_observations` row, so DQ-09/DQ-11 structurally
can never fire from this reconstruction; every other gate (DQ-01/02/03/04/
05/06/08/12/13/16) evaluates against real, freshly-queried data. A known,
accepted edge case: if the live window has drifted from the one the stored
profile was actually computed against (games deleted/added since the last
rebuild), window-level gates like DQ-01 read the CURRENT window, not the
profile's original one — a documented staleness gap, not a bug.

Per-turn budget: `1`, matching `get_user_profile`'s own "read the student's
standing evidence once" budget rather than `get_engine_analysis`'s `2` — one
profile read per turn is all a coaching plan needs. `diagnostic-report.ts`
renders `{ entry, firedGates }[]` (the `DiagnosticReportItem` the caller
assembles), never selecting on its own — six unit tests cover the empty-list
fallback, per-field rendering, multi-item ordering/spacing, the no-control
case, and the failed-gates line appearing only when gates actually fired.
`coach-tools.test.ts` gained a `get_diagnostic_profile` describe block
(Testcontainers, unrun here — no Docker, same precedent as every prior
Phase 56/57 task) covering both graceful-degradation paths (no time control,
no stored profile) and the DQ-05 reachability gate actually firing.

**Verified once Docker became available (post Task 57.4):** running the full
suite for real (2494 tests) surfaced two real bugs in this task's own
Testcontainers-only fixtures, invisible until `evaluateGates` actually ran
against them for the first time — `seedRatedGames` in `coach-tools.test.ts`
seeded every game with the same `userColor: 'white'` and no `moveTimes`, so
DQ-04 (missing clock data) and DQ-06 (one side is 100% of the window) fired
spuriously on every "healthy window" fixture, on top of whatever gate the
test actually meant to exercise. Fixed by alternating `userColor` and giving
every seeded game real clock data. `propose_focus_area_update`'s one test
was also still testing the pre-Task-57.3 `'create'` action (removed by that
task) — rewritten to progress/resolve an existing focus area by
`diagnosisCode`, and to assert the no-existing-focus-area no-op.

### Task 57.3: Focus areas on diagnosis codes

**Read:** `docs/diagnose.md` §IV, §V only.

**Files:** migration `0027_focus_area_diagnosis.ts`,
`apps/api/src/services/progress.ts`, `packages/shared/src/dashboard.ts` + tests.

- [x] Add `focus_areas.diagnosis_code`; relax `UNIQUE (user_id, category)` to
      `UNIQUE (user_id, diagnosis_code)` — today a student can only ever have
      one focus area per broad category, which the code-level taxonomy makes
      far too coarse.
- [x] Selection becomes programmatic (Task 55.4); the LLM's
      `propose_focus_area_update` writes only the note and the state
      transition. Keep the max-3-active cap.
- [x] Note in the service doc comment that the summarizer prompt claims
      over-cap creates are "queued" while `applyCreate` silently discards
      them — either implement queueing or correct the prompt text; do not
      leave the two disagreeing.
- [x] Commit: `feat: focus areas keyed on diagnosis codes`.

**Done:** `focus_areas.diagnosis_code` is nullable (legacy category-only rows
stay valid; Postgres treats multiple `NULL`s as distinct, so they coexist
under the new `UNIQUE (user_id, diagnosis_code)`). Selection is now
`progress.ts`'s `syncProgrammaticFocusAreas`, called from
`rebuild-diagnostic-profile.ts` right after each time control's
`upsertProfile`: it builds one `FocusCandidate` per code by running
`evaluateGates` (Task 55.2, `cascadeCollapsedCount`/
`decidedPositionIncidentCount` fixed at 0 — same documented gap as Task
57.2, since that per-incident bookkeeping is never persisted), feeds them to
`selectFocus` (Task 55.4), and inserts a focus area for the primary +
secondary picks that don't already have one, re-checking the max-3-active
cap before each insert (a per-user cap, so it holds across time controls
even though this runs once per time control). `applyFocusAreaUpdate` (the
LLM-facing `propose_focus_area_update` handler) lost its `'create'` action
entirely — it now only applies `progress`/`regress`/`resolve` to a focus
area addressed by `diagnosisCode`; naming a code with no existing focus area
is a no-op, not an error. This resolves the "queued" mismatch by deletion
rather than implementation: since the LLM no longer proposes creates at
all, there is nothing left for the summarizer prompt to describe as queued
or discarded — `progress-summarizer.ts`'s system prompt was rewritten to
say the system selects focus areas automatically from measured evidence.

### Task 57.4: Scoped code vocabulary in the prompts

**Read:** `docs/diagnose.md` §0.1 only.

**Files:** `packages/prompts/src/render.ts`,
`packages/prompts/src/coach-system.ts`,
`packages/prompts/src/analysis-planner.ts`,
`packages/prompts/src/progress-summarizer.ts` + snapshot tests.

The planner, summarizer and coach system prompt all currently inject
`MISTAKE_CATEGORIES_BLOCK`. **Never inject all 410 codes** — it would wreck
the prompt cache and the token budget.

- [x] `renderScopedDiagnosisCodes(rating, activeDetectors)` — filters to codes
      whose `ratingPrior` overlaps the student's rating and that have a
      detector or are dialogue-detectable. Pure, unit-tested with edge cases
      (rating at a boundary, no overlapping codes).
- [x] Keep the block in `staticPart` if it depends only on the rating band,
      or move it to `dynamicPart` if it depends on the numeric rating —
      whichever preserves the §8.1 cache shape; assert the choice in the
      snapshot test.
- [x] Add the pair to `coach-system.refs.test.ts` if any block references
      another by name.
- [x] `npm run docs:prompts`.
- [x] Commit: `feat: scoped diagnosis-code vocabulary in coach prompts`.

**Done:** Measured before committing to a design: the checklist's literal
"has a detector OR is dialogue-detectable" filter matches 300+ of the
410-code catalog at ratings 900-1500 (most codes are `dialogue` by design —
see `DETECTABILITIES`'s doc comment), directly violating "never inject all
410 codes." Dropped the dialogue branch — `renderScopedDiagnosisCodes` only
ever includes `detectability: 'detector'` codes present in the caller's
`activeDetectorCodes` set (currently `ACTIVE_DETECTOR_CODES`, ~30 codes
total), rating-filtered on top; a dialogue-only code is never listed even if
wrongly passed in `activeDetectorCodes` (the catalog's own `detectability`
is the actual gate, not caller discipline — see `render.test.ts`). Real
rendered lists this size (0-30 lines) confirmed via `npm run docs:prompts`'s
diff. `dialogue`-only codes stay reachable the way they already were before
this task — the coach reasons about them ad hoc (`record_finding`'s
existing tool description), no injected list.

Depends only on the numeric rating (not `band`), so it lives in
`dynamicPart`/the per-call `user` message in all three prompts, never in
`staticPart`/the shared `SYSTEM_PROMPT` — asserted directly in
`coach-system.test.ts` (`staticPart` byte-identical across two different
numeric ratings in the same band; `dynamicPart` differs when only rating
differs). A user's numeric rating can be `null` (not yet known) —
`ratingForPromptScoping(rating, band)` (`packages/shared/src/user.ts`) falls
back to a representative rating at the middle of the user's band (picked
from docs/diagnose.md §0.2's anchors), threaded in at all three call sites
(`coach-agent-system-prompt.ts`, `analysis.ts`'s planner input,
`summarize-session.ts`).

`analysis-planner.ts`'s `CoachingMomentSchema` has no `diagnosisCode` field
(only `category`), so its scoped-codes block is context only (grounds
`whatHappened` in the same vocabulary, doesn't feed the JSON schema) —
`progress-summarizer.ts`'s `findings[].diagnosisCode` and
`coach-system.ts`'s live `record_finding`/`propose_focus_area_update` are
where the vocabulary is actually addressable. No cross-references needed in
`coach-system.refs.test.ts` — the new section doesn't name another block by
name, so nothing to add there; the checkbox above is satisfied by
confirming that, not by adding a pair.

---

## Phase 58 — Surfacing it

### Task 58.1: Route

**Files:** `apps/api/src/routes/diagnostics.ts`,
`apps/api/src/services/diagnostics.ts`, `packages/shared/src/diagnosis/api.ts`.

- [x] `GET /api/users/me/diagnostics?timeControl=&window=` returning the
      stored profile, and `GET /api/users/me/diagnostics/:code/evidence`
      returning the observations behind one code.
- [x] Commit: `feat: diagnostics API`.

**Done:** `timeControl` is optional — omitted, the route auto-picks the
user's most recently computed profile across every time control
(`latestProfileAnyTimeControl`), so the frontend never needs to already know
which time controls exist before it can show anything. `window` is the
stored profile's own `windowEnd` (ISO date) — each rebuild run upserts a
distinct `(userId, timeControl, windowEnd)` row (0025_diagnostics.ts), so
history genuinely accumulates and `window` picks a specific past snapshot
(`profileAt`) instead of always the latest; omitted, it's ignored. No stored
profile for the resolved pool is a normal "empty" 200 (entries: []), the
same "no confident diagnoses yet" precedent as the coach tool, not a 404.

Reuses Task 57.2's on-demand gate-evaluation pattern (`toGateWindowGame` +
`windowByTimeControl` against a freshly queried window, same documented
`cascadeCollapsedCount`/`decidedPositionIncidentCount: 0` simplification)
but over every stored entry, not just the coach tool's top three — this is
the student's own full-detail view, so `insufficient`-confidence entries
stay in the list (sorted after `probable`/`signal`) rather than being
dropped. `code`/`controlSkill.code` and each fired gate's `code` all get a
resolved `label` server-side (`DIAGNOSIS_CODES_BY_ID`, `DATA_QUALITY_GATES`)
so the frontend never needs the 410-code catalog just to render a heading —
same choice `diagnostic-report.ts` already made for the coach-tool digest.
`packages/shared/src/diagnosis/api.ts` is the wire-shape counterpart of the
internal `DiagnosticProfileEntry`/`FiredGate` types (`chess-analysis` stays
a backend-only dependency).

The evidence route validates `:code` in two steps before touching the DB:
format (`DiagnosisCodeIdSchema`) → 400, then catalog membership
(`DIAGNOSIS_CODES_BY_ID`) → 404 — `diagnosticObservationsRepo.listForUserAndCode`
is scoped by `userId` so a guessed code can never surface another user's
observations, capped at 50 (newest first; a drill-down list, not an
export).

### Task 58.2: Progress page

**Files:** `apps/web/src/features/dashboard/*`,
`apps/web/src/features/dashboard/DiagnosisCard.tsx` + tests.

- [x] Show code-level diagnoses with `E/O`, confidence and scope alongside
      the existing focus areas.
- [x] `FocusAreaCard`'s "View evidence" button and `TrendChart`'s
      `onBarClick` are both **no-ops today** — wire them to the evidence
      endpoint so a diagnosis drills down to the actual plies behind it.
- [x] Components stay presentational and under ~120 lines; fetching lives in
      a TanStack Query hook.
- [x] Commit: `feat: code-level diagnoses and evidence drill-down`.

**Done:** `DashboardPage` gained a third query (`useDiagnostics`, its own
TanStack Query hook) alongside the existing dashboard one — a separate
fetch, not merged server-side, so a fresh user with no stored profile yet
still gets a fully working dashboard (the new "Measured diagnoses" section
just doesn't render when `entries` is empty, same pattern as the other
sections' empty states). `DiagnosisCard` reuses `FocusAreaCard`'s
`.focus-area-card` CSS class wholesale (same card-in-a-list shape, a
different data axis) rather than a parallel stylesheet.

`FocusAreaCard.onViewEvidence` is optional and gated on
`area.diagnosisCode !== null` — a legacy pre-Task-57.3 row with no code has
nothing to open, so the button doesn't render rather than wiring a dead
click. Also fixed, in passing: `DashboardPage`'s focus-area `key` was
`area.category`, which can now collide (Task 57.3 dropped the
one-focus-area-per-category constraint) — changed to
`area.diagnosisCode ?? area.category`.

`TrendChart.onBarClick` receives a `MistakeCategory`, but the evidence
endpoint is keyed by `DiagnosisCodeId` — no 1:1 mapping exists (one category
can have many codes). Resolved by matching the clicked category against the
already-loaded `diagnostics` query's `entries` via
`DIAGNOSIS_CODES_BY_ID.get(code)?.parentCategory` (client-side; the catalog
is small and already a `@freechesscoach/shared` dependency) and opening the
first match — `entries` is already confidence-then-episodes ranked (Task
58.1), so the first match is the most relevant one. A category with no
code-level data yet (still `dialogue`-only, or simply unmeasured) has
nothing to drill into and the click is a no-op, same as before this task.

`EvidenceModal` (opened from all three: `DiagnosisCard`, `FocusAreaCard`,
and a matching trend bar) lists each observation's move reference
(`plyToMoveRef`, the same ply→move-pair convention `describeMoveRef` uses
server-side, reimplemented locally rather than importing the `prompts`
package into the frontend), severity, and date — informational only, no
navigation to the game/session it's from: no route in this app addresses a
specific ply today, and inventing that deep-link wasn't in scope for this
task.

---

## Phase 59 — Coach-assigned puzzle training

Not sourced from `docs/diagnose.md` — a new feature, not a diagnostics-plan
task. Puzzle *solving* already exists on Lichess; the point here isn't to
duplicate that. It's the same thing Phase 56-58 built for games: the coach
picks material based on what it has actually measured about a specific
student, and walks through it with them — except the material is a batch
of real Lichess puzzles instead of the student's own game, chosen from
`packages/chess-analysis/src/puzzle-selection.ts`'s `selectPuzzles` against
their diagnostic profile.

**Entry point (decided):** assignment happens in the background — the
coach doesn't hand-pick puzzles live inside a game-review chat. A job
(piggybacking `rebuild-diagnostic-profile`, Task 56.4) creates a
`puzzle_assignments` row when a student's profile has a `probable`-or-
better diagnosis with no open assignment already covering it. The
dashboard shows a "Practice ready" card; opening it starts a dedicated
puzzle session — its own chat + board, structurally parallel to
`SessionPage`/`sessions`/`session_messages`, not a mode grafted onto them.

**Why a parallel session table, not a nullable `sessions.gameId`:**
`sessions.gameId` is `NOT NULL` and `currentPly`/`subjectPly`/episodes/
findings/focus-area recording/homework all key off a real game's plies —
making it nullable would mean every one of those code paths gaining a
"what if there's no game" branch for a feature that structurally never has
one. A puzzle session's shape is much simpler (a short, linear list of
puzzles, no episodes/subjects/flashbacks), so a parallel
`puzzle_sessions`/`puzzle_session_messages` pair reusing the *streaming*
coach-agent machinery (not the game-review-specific tooling) is the
smaller change, even though it duplicates two small tables.

**Why an in-memory pool, not a disk-backed binary-search index like
`lichess-eval-index.ts`:** that index is disk-backed because its access
pattern (point lookup by exact position hash across ~394M positions, tens
of GB) doesn't fit in memory. Puzzle selection's access pattern is
"filter a few hundred thousand rows by theme + rating band," and even the
full set of puzzles tagged with a theme this plan ever selects on is a low-
hundred-thousands-row pool — comfortably loaded once into memory at
process start, no on-disk binary search needed. It still lands on the same
PVC as the eval index (`lichessEvalIndex`'s mount, not a new volume — see
Task 59.1) and still ships as a prebuilt binary `.bin` file, matching the
"offline batch job, deployed by hand, never rebuilt on a normal app
deploy" shape `apps/api/data/README.md` already documents — it just gets
read whole into memory, not `open()`-and-seek'd.

### Task 59.1: Puzzle pool format, builder, and loader

**Files:** `packages/chess-analysis/src/puzzle-pool-format.ts` (+ test),
`apps/api/scripts/build-puzzle-pool.mjs` (replaces `build-puzzle-index.mjs`
and its `.csv` output), `apps/api/src/services/puzzle-pool.ts` (+ test),
`apps/api/data/README.md`.

- [x] A fixed-per-record-header binary format: magic header (own constant,
      matching `LICHESS_EVAL_MAGIC`'s convention of a versioned 8-byte tag,
      not reusing that one), record count, then each record as
      `puzzleId` (5 fixed ASCII bytes — every Lichess puzzle ID is exactly
      5 base62 characters), `rating` (uint16), `themes` (uint32 bitmask
      over a fixed, versioned theme list — the 23 themes
      `puzzle-selection.ts`'s `DIAGNOSIS_CODE_PUZZLE_THEMES` references),
      then length-prefixed `fen` and `moves` (UTF-8). Encode/decode both
      live in `chess-analysis` (pure, unit-testable) — same package/test
      split `lichess-eval-index-format.ts` already established for the
      eval index.
- [x] `build-puzzle-pool.mjs`: same source (`lichess_db_puzzle.csv`, not
      committed) and same filters as today's `build-puzzle-index.mjs`
      (rating/popularity/plays thresholds, the 23-theme allowlist), but a
      substantially larger per-theme-per-rating-band cap than the current
      demo's 15 — repeat assignments for the same code need fresh puzzles,
      not the same 40-150.
- [x] `apps/api/src/services/puzzle-pool.ts`: reads the `.bin` file whole
      at boot (env var, same "missing file logs a warning and the tier is
      skipped" shape `openLichessEvalIndexFromEnv` uses — a student simply
      can't be assigned puzzles yet, not a crash), decodes every record
      once, holds the resulting `PuzzleRecord[]` in memory for the process
      lifetime.
- [x] Reuses `deploy-lichess-eval-index.sh`'s `kubectl cp`-onto-the-PVC
      approach (parameterized on file name, or a near-identical sibling
      script) rather than inventing a second deploy mechanism — same PVC,
      second file alongside `lichess-eval-index.bin`.
- [x] Commit: `feat: binary puzzle pool format and loader`.

**Done:** `build-puzzle-index.mjs`/`puzzle-index.csv` (the earlier demo
from before this task existed) are gone, replaced outright rather than
kept alongside — `select-puzzles.mjs` now reads the `.bin` pool via
`PuzzlePool.open`. `PUZZLE_POOL_THEMES` (the format's own fixed theme
list) is imported by `build-puzzle-pool.mjs` rather than the builder
keeping a second copy, so the two can't drift out of sync the way the
doc comment above worried about. `puzzle-pool.ts`'s
`openPuzzlePoolFromEnv` exists and is tested but isn't wired into
`bootstrap.ts` yet — nothing calls it until Task 59.3 exists to consume
it, and threading an unused dependency through the app's DI chain isn't
worth doing ahead of that. Built and deployed-tested for real against the
actual ~6.1M-row Lichess dataset (not just a synthetic fixture): 22,441
unique puzzles, 2.0MB, `npm run select-puzzles -- MS-01 700 3` and `--
TA-07 1500 3` both returned sensible, rating-close results, and the
missing-pool-file path was verified to fail with the documented "build it
first" message rather than a stack trace. `deploy-puzzle-pool.sh` exists
but its `kubectl cp` path is unverified against a real cluster (no cluster
access in this environment) — same untested-until-first-real-deploy status
the eval index's own deploy script's "Version pin: not yet built from a
real snapshot" note already carries.

### Task 59.2: `puzzle_assignments` schema and repository

**Files:** `apps/api/src/db/migrations/00NN_puzzle_assignments.ts`,
`apps/api/src/db/schema.ts`, `apps/api/src/db/repositories/puzzle-
assignments.ts` (+ test).

- [x] `puzzle_assignments`: `id`, `user_id`, `diagnosis_code`, `reason`
      (rendered label text, shown on the dashboard card — not
      recomputed from the code at read time, so it stays stable even if
      the catalog label changes later), `items jsonb` (array of
      `{puzzleId, fen, moves, rating, themes, result: 'pending' |
      'solved' | 'failed' | 'skipped'}` — puzzles are *snapshotted* into
      the assignment at creation time, not referenced by ID against the
      pool, so an assignment stays stable across a later pool rebuild),
      `status` (`'pending' | 'in_progress' | 'completed'`), `created_at`,
      `started_at`, `completed_at`.
- [x] One open (`pending`/`in_progress`) assignment per `(user_id,
      diagnosis_code)` at a time — the creating job checks this before
      inserting, no DB constraint (matches `diagnostic_observations`'
      app-layer-only discipline, Task 56.1).
- [x] Commit: `feat: puzzle assignment table`.

**Done:** Implemented and committed as `a15c05f` — checkboxes above were
left unchecked at the time by an oversight, corrected here (by the Task
59.6 fork, while touching this same file) rather than left stale for a
Phase 59 that is otherwise fully checked off. Migration
`0028_puzzle_assignments.ts`, repository at `apps/api/src/db/repositories/
puzzle-assignments.ts` with 7 passing tests against a real test DB.

### Task 59.3: Background assignment creation

**Files:** `apps/api/src/jobs/rebuild-diagnostic-profile.ts`,
`apps/api/src/services/puzzle-assignment.ts` (+ test).

- [x] After a profile rebuild, for each `probable`-or-better entry with no
      open assignment for that code: `selectPuzzles` against the
      in-memory pool (Task 59.1) and the student's current rating, and
      insert an assignment (Task 59.2) if it returned any puzzles — a
      genuinely empty pool for that code/rating is a skip, not a partial
      assignment.
- [x] Cap on assignments created per rebuild run (avoid flooding a
      student who has several `probable` diagnoses at once from one
      rebuild) — a small fixed number, revisit once this ships and there's
      real usage to look at.
- [x] Commit: `feat: background puzzle assignment on profile rebuild`.

**Done:** `services/puzzle-assignment.ts`'s `createPuzzleAssignmentsForProfile`
caps new assignments at `MAX_NEW_ASSIGNMENTS_PER_RUN = 3` per call — a
first-pass number, not measured. `runRebuildDiagnosticProfileJob` now
accumulates every time control's `DiagnosticProfileEntry[]` across the
whole rebuild (not per-window) and calls this once at the end, so the cap
is meaningful across a student's whole rebuild rather than resetting per
time control. `reason` text is built from the diagnosis catalog's own
`label`/`diagnosis` fields ("Practice puzzles for <label>: <diagnosis
sentence>"), frozen onto the row at creation. The puzzle pool reaches this
job the same way the Lichess eval index reaches `resolveEngineBackend`:
`openPuzzlePoolFromEnv()` (Task 59.1) is called once in `worker.ts`'s
`main()` and threaded through `createTaskList`'s options
(`RebuildDiagnosticProfileTaskOptions.puzzlePool`) — `server.ts` doesn't
need it since it never constructs a task list. `pool === null` (unset
`PUZZLE_POOL_PATH`, or a missing/stale file) is a clean skip, matching
every other optional-data-tier convention in this repo.

### Task 59.4: Puzzle session backend

**Files:** `apps/api/src/db/migrations/0029_puzzle_sessions.ts`,
`apps/api/src/db/schema.ts`, `apps/api/src/db/repositories/puzzle-
sessions.ts` (+ test), `apps/api/src/routes/puzzle-sessions.ts` (+ test),
`apps/api/src/services/puzzle-session-tools.ts` (+ test),
`apps/api/src/services/puzzle-session.ts` (+ test),
`apps/api/src/services/puzzle-session-turn.ts` (+ test).

- [x] `puzzle_sessions` (`id`, `assignment_id`, `user_id`, `status`,
      `current_item_index`, `started_at`, `ended_at`) and
      `puzzle_session_messages` (mirrors `session_messages`, `item_index`
      instead of `ply`).
- [x] `POST /api/puzzle-sessions` (from an assignment id) and `POST
      /api/puzzle-sessions/:id/messages`, reusing the streaming
      infrastructure `routes/sessions.ts`/`llm/stream-response.ts` already
      provide rather than a parallel implementation.
- [x] Tool set for this session kind: reuse `annotate_board`, `expect_move`,
      `hypothetical_line` as-is; drop `check_position`/`recall_move`/
      `record_move_note` (address a game's plies, meaningless here); add
      `advance_puzzle` (records the current item's `result` on the
      assignment, moves `current_item_index` forward, ends the session on
      the last item).
- [x] Commit: `feat: puzzle session backend`.

**Done:** One real correction to this task's own premise, caught while
actually reading `packages/prompts/src/tools.ts`'s parameter schemas rather
than trusting the earlier summary: `show_position` is addressed by
`{ moveNumber, color }` — real-game move-pair numbering — not a FEN, so it
is NOT "already generic over any FEN" as this task originally assumed. A
puzzle set has no move-pair numbering (one puzzle = one starting position,
walked forward only via `hypothetical_line`), so `show_position` is
**dropped entirely**, not reused — the client renders the current item's
own `fen` directly whenever a session opens or `advance_puzzle` moves it
forward, no tool round-trip needed. `packages/prompts/src/puzzle-coach-
system.ts` (Task 59.5) still referenced `show_position` in its tool
guidance when this task started (that fork ran concurrently and flagged
the mismatch itself, correctly, rather than guessing) — fixed here as part
of this task's own commit, along with its test and `docs/prompts.md`.

Architecture notes not spelled out above: `puzzle_sessions.status` reuses
`sessions.status`'s exact four values including `paused_no_credits` —
puzzle-session turns go through the same credits-metered
`getModelForUser`/`assertCanSpend`/`recordUsage` path as every other coach
turn (`services/puzzle-session-turn.ts`'s `startPuzzleTurn`, a deliberately
much simpler sibling of `coach-agent-turn.ts`'s `startTurn`: no episodes,
no `subjectPly`, no position-jump resolution — `messages` is just the
session's whole history replayed as-is, since a puzzle session is linear).
A brand-new session's opening turn (empty history, empty request body)
synthesizes an unpersisted `"Begin the puzzle session."` user message
rather than seeding a stored `[session_start]`-style marker row — nothing
to strip on read, unlike `getSessionDetail`'s `filterBackstageMessages`.
`advance_puzzle`'s `execute` does the DB write immediately (same
"server tool commits inside its own execute" shape as `play_coach_move`);
`onFinish` reads the result back via `findSuccessfulToolResult` to decide
whether to advance `current_item_index` or complete the session +
assignment together, mirroring `advancePlyForPlayMove`.

Added one route beyond this task's original file list, since nothing else
in Phase 59 exposes it and Task 59.6 needs it: `GET /api/puzzle-
assignments` (`apps/api/src/routes/puzzle-assignments.ts` + test) lists the
caller's own open assignments, for the dashboard's "Practice ready" card.
Also added `CreatePuzzleSessionRequestSchema` to `packages/shared/src/
session.ts` (this task's own request-validation need, same file the
existing session request schemas already live in).

### Task 59.5: Puzzle session prompt

**Files:** `packages/prompts/src/puzzle-coach-system.ts` (+ test),
`docs/prompts.md`.

- [x] A dedicated system prompt (not `coach-system.ts`'s reused verbatim —
      the "reacting to the student's own game" framing throughout that
      prompt doesn't fit "walking through a puzzle set"), built the same
      static/dynamic-part way (§8.1 cache-shape discipline) as the
      existing coach prompts.
- [x] States the assignment's `reason` up front (why these puzzles, in the
      student's own diagnosed terms) and the current item's known solution
      (`items[i].moves`) so the coach can judge the student's attempt
      without a second engine call.
- [x] Commit: `feat: puzzle-session coach prompt`.

**Done:** `buildPuzzleCoachSystemPrompt({ reason, totalCount, currentItem: {
fen, moves, index } })` in `packages/prompts/src/puzzle-coach-system.ts`,
mirroring `buildCoachSystemPrompt`'s name/shape. Unlike the game-review
prompt, `staticPart` here is a plain fixed constant, not a function of
band/mode/persona — there's no such axis for a puzzle session, so every
session in the product shares one cached copy (tested: identical across
two different `reason`s). `dynamicPart` replays `moves` with `chess-
analysis`'s `pvUciToSan`/`applySanSequence` to (a) resolve the real
puzzle-start position — Lichess's own puzzle format stores `fen` as the
position BEFORE the opponent's forced setup move, `moves[0]` — so the
dynamic part shows the coach the position AFTER that move, matching what
the student actually sees, and (b) render the rest of the line labeled
"Student plays" / "Opponent's expected reply" in SAN, explicitly marked
"for YOUR reference only — never show this line to the student directly."
Tool-use guidance for `show_position`/`annotate_board`/`expect_move`/
`hypothetical_line` is hand-written fresh for this prompt rather than
imported from `tools.ts`'s `COACH_TOOL_SPECS` — those canonical
descriptions are written in terms of game-review's `{moveNumber, color}`
addressing scheme, which doesn't describe a single-FEN puzzle position;
Task 59.4 should double-check the tool-call framing here still matches
whatever wire schema it lands on for reusing these tools in a puzzle
session, since this task deliberately didn't need or commit to that
schema. `advance_puzzle`'s three `result` values (`solved`/`failed`/
`skipped`) are described in prose only, same reason. `docs/prompts.md` is
generated (`npm run docs:prompts`), not hand-edited — added a new "## 6.
Puzzle-session coach system prompt" section (renumbering the old "## 6.
Rating-band calibration" to "## 7") and a `basePuzzleCoachInput` fixture
in `fixtures.ts`, both consumed by `generate-doc.ts` the same way every
other prompt already is; `generate-doc.test.ts`'s drift check passes.

### Task 59.6: Dashboard and puzzle session page

**Files:** `apps/web/src/features/dashboard/PracticeCard.tsx` (+ test),
`apps/web/src/features/dashboard/DashboardPage.tsx`, `apps/web/src/
features/puzzle-session/PuzzleSessionPage.tsx` (+ test) and its supporting
hooks, `apps/web/src/app/routes` (new `/practice/:assignmentId` route).

- [x] `PracticeCard` lists open assignments (`reason`, puzzle count,
      progress) with a "Start"/"Continue" action; empty state renders
      nothing (matches every other dashboard section's empty-state
      precedent, Task 58.2).
- [x] `PuzzleSessionPage` mirrors `SessionPage`'s board + chat layout,
      swapped onto the puzzle-session endpoints (Task 59.4) — reuse
      `CoachBoard`/`MoveExplorer`-equivalent pieces where they're already
      generic over a FEN, don't reuse the parts that assume a game (move
      list, `SessionPeekBar`, etc.).
- [x] Commit: `feat: practice dashboard card and puzzle session page`.

**Done:** No `apps/web/src/app/routes` directory exists in this repo —
routes live in `App.tsx` (a flat `<Routes>` block), so the new
`/practice/:assignmentId` route was added there instead, matching
`/session/:id`'s own `key={id}`-wrapped-route pattern (`PracticeRoute`).

`PracticeCard` is self-contained (owns its own `usePracticeAssignments`
query, `GET /api/puzzle-assignments` — a route this task added beyond
59.4's original file list, since nothing else exposed it) rather than
receiving server data as props the way `FocusAreaCard`/`DiagnosisCard` do:
it's an independent, optional data source, same "distinct section, works
fine with none of it yet" reasoning as `useDiagnostics.ts`. Renders `null`
on loading and on a failed fetch too, not just an empty list — a missing
"you should practice" nudge is a much smaller problem than an error box on
an otherwise-working dashboard.

`show_position` genuinely has no equivalent in `PuzzleSessionPage` (Task
59.4 already dropped it server-side): the board's FEN comes directly from
`assignment.items[currentItemIndex].fen` on load and after every
`advance_puzzle`-triggered refetch, never from a tool call. The coach's
"open every puzzle it hasn't spoken about yet" behavior (a fresh session's
first item, or a freshly-advanced one) is detected from persisted
`itemIndex` tags on stored messages (`hasMessageForCurrentItem`), not from
"history is empty" — the latter would incorrectly skip re-opening on a
resumed session's second-or-later puzzle, since the session's message
history is never actually empty past the first item.

Reused directly, unmodified: `CoachBoard`, `ChatPane`/`MessageList` (with
`positions`/`onSelectPly` simply omitted — both optional, and a puzzle
session has no move list to resolve mentions against), `useDivergedLine`,
`useAnnotationLayer`, `DivergedLinePanel`, `readCoachStream`, and
`SessionPage.css`'s layout classes (`.session-page`, `.session-body[.
desktop]`, `.session-board-column`) — genuinely structural, not
game-specific. NOT reused: `useCoachChat` (new sibling
`usePuzzleCoachChat` instead — different endpoint, no `show_position`
branch, a different single server-tool name); `useSessionBoardState`/
`SessionBoardColumn`/`MoveExplorer`/`SessionPeekBar`/`MobileSessionBody`
(all game-ply-shaped). The student's own board move while
`hypothetical_line`/`expect_move` is armed skips `SessionBoardColumn`'s
2-second "undo pill" affordance (sends immediately instead) — a deliberate
scope trim, not an oversight. `hypothetical_line`'s announcement text
(`encodeDivergedLine`/`DivergedLineStart`) still renders a "move N (white/
black)" phrase derived from the item index treated as an opaque ply —
cosmetically odd for a puzzle set (there's no real move-numbering
concept), but harmless: the model and the UI both still get the right SAN
moves and resulting FEN, only that one framing sentence reads oddly. Left
as a known rough edge rather than building a parallel encoding scheme for
one cosmetic string.

Verification: `npm run typecheck` (repo-wide) clean; `eslint` on
`apps/web/**` and `packages/shared/**` clean; full `apps/web` suite green
(101 files / 692 tests, including the two new test files and the
`DashboardPage.test.tsx`/existing-suite update to stub `GET /api/puzzle-
assignments`). Also exercised for real, not just under vitest: ran this
branch's `0028`/`0029` migrations against the actual running dev Postgres
(`docker compose run --rm migrate`, previously stale since the dev stack
predated these files), confirmed the three new tables exist, then drove
the full HTTP flow with `curl` against the live dev `api` container —
`POST /api/puzzle-sessions`, `GET /api/puzzle-sessions/:id`, and a real
SSE turn against `LLM_FAKE=1`'s canned model — for a manually-seeded
`puzzle_assignments` row, confirming the assistant's reply persisted with
the correct `itemIndex` and that `GET /api/puzzle-assignments` reflected
it; test data was deleted afterward. The dev `web-dev` Vite container also
hot-reloaded every changed file with zero build errors. What this does
**NOT** cover: no actual pixels were seen — the Claude-in-Chrome browser
extension wasn't connected in this environment, so the click-through
(dashboard → card → board renders → send a message → see a reply) was
never visually confirmed, only its HTTP/data layer.

This closes out Phase 59 — all six tasks (59.1-59.6) are now checked off.

---

## Phase 60 — Probability-driven bot move selection

Replaces `selectBotMove`'s current score-then-softmax model
(`packages/chess-analysis/src/bot-candidate-score.ts`'s `scoreBotCandidates`
+ `sampleBotMove`, plus the AI-tiebreak path in `bot-move-selector.ts`) with
a literal dice-roll model, per user decision (not a tuning pass on the
existing system): each move, roll against a directly-configured
"play the engine's actual best move" probability for the bot's current game
phase; on a miss, pick from the full legal-move field weighted by the bot's
personality traits, not the engine's own evaluation. The engine is still
consulted every move (it defines the candidate pool and which one is
"best") — what changes is that *whether* the bot uses that verdict is now an
explicit per-phase percentage instead of a temperature-scaled blend of
engine score and personality bonus.

**Decided (from the design conversation):** full replacement, not an
additive layer — `bot.temperature`, `bot.aiEnabled`, and the LLM tiebreak
call (`apps/api/src/llm/bot-tiebreak.ts`, `packages/prompts/src/bot-move-choice.ts`)
are removed, not kept alongside the new model. The user's own worked
examples ("level 200 → 95% obvious/short-sighted move, 5% good move";
"level 500 → 50% good moves") are honored as a *validation check* on the
roster-regeneration formula (Task 60.5), not as literal per-bot constants —
this roster's elo floor is 300, not 200, and hand-typing 30 bots × 3 phases
would fight the roster's existing "curated, hand-tuned personality" design
instead of preserving it.

**Game phase, not hand-rolled:** reuses `phaseUnits`/`ENDGAME_PHASE_UNIT_THRESHOLD`
(`packages/chess-analysis/src/phase-signals.ts`, `CONFIG.phaseSegmentation`)
— the same material-based endgame boundary the coach's own phase-accuracy
dashboards already use — so a bot's "which phase am I in" reasoning agrees
with the rest of the app's definition of phases instead of inventing a
second one. `phaseForPly`/`endgameStartPly` in `phase-segmentation.ts` are
NOT reused directly — those resolve boundaries retrospectively from a
finished game's full position list, and a bot needs a live, incremental
classification as the game is being played.

**"Short board sight" comes from search breadth, not a hand-authored
blunder table:** today's `bot.multiPv` (1-8) only lets the selector choose
among the engine's own top few lines — a real blunder (hanging a queen) is
rarely one of Stockfish's top-8 lines even at low depth, so the *old* model
could bias toward personality-flavored suboptimal moves but couldn't
produce a genuine "didn't see the tactic" mistake. The new model requests a
much wider `multiPv` (effectively the full legal-move list) at the bot's
phase-appropriate depth, so a truly bad move can appear in the pool the
"miss" branch samples from — shallow depth and narrow personal calculation
account for weak play, not a second layer of fabricated mistakes.

**Checkmate-completion guarantee:** when the engine's own top candidate
carries `mateIn`, the roll uses `max(phaseProfile.bestMoveChance,
bot.mateConversionChance)` instead of the phase's own (possibly very low)
chance — so even the weakest bot usually takes a forced mate it can
actually see, while `mateConversionChance` staying below 1.0 for the
lowest tiers keeps "some challenge" (per the user's own phrasing) rather
than a flawless finish. This is scoped to mates the bot's own
phase-appropriate depth search actually finds — it is not a claim that a
depth-3 search sees an arbitrarily long technical mate. The endgame phase
profile's depth boost (Task 60.5) is what extends how far even a weak bot
can see once material simplifies, which is exactly when most real mating
technique is needed.

### Task 60.1: Live game-phase classification for bot play

**Files:** `packages/chess-analysis/src/bot-game-phase.ts` (+ test).

- [x] `classifyBotGamePhase(fen: string, plyCount: number, bookPlies: number): MovePhase`
      — `endgame` once `phaseUnits(fen) <= CONFIG.phaseSegmentation.endgamePhaseUnitThreshold`;
      else `opening` while `plyCount < Math.min(CONFIG.phaseSegmentation.openingMaxPly, bookPlies * 2 + 4)`;
      else `middlegame`. Pure, no engine call.
- [x] Commit: `feat: live game-phase classification for bot move selection`.

### Task 60.2: New phase-keyed BotConfig schema

**Files:** `packages/shared/src/bot.ts` (+ any test), `packages/shared/src/constants.ts`
(if the depth ceiling needs raising for endgame — see below).

- [x] `BotPhaseProfileSchema = z.object({ depth: z.number().int().min(1).max(24),
      bestMoveChance: z.number().min(0).max(1) })` — 24, not
      `ENGINE_DEFAULT_DEPTH` (16), because endgame search over a handful of
      pieces is cheap enough to justify searching deeper than the
      shared default; keep `ENGINE_DEFAULT_DEPTH` itself unchanged (it's
      used elsewhere for unrelated defaults).
- [x] `BotConfigSchema` gains `phases: z.object({ opening: BotPhaseProfileSchema,
      middlegame: BotPhaseProfileSchema, endgame: BotPhaseProfileSchema })`
      and `mateConversionChance: z.number().min(0).max(1)`. Keeps `personality`
      (`BotPersonalitySchema`, unchanged — a bot's character is global, only
      how often it's overridden by the engine's verdict is phase-scoped),
      `bookPlies`, `bookMistakeChance`. Drops the top-level `depth`, `multiPv`,
      `aiEnabled`, `temperature`.
- [x] Update the doc comment above `BotConfigSchema` (currently references a
      `docs/architecture.md` "Play vs Bot" plan section that no longer exists
      — don't perpetuate that stale pointer).
- [x] Commit: `feat: phase-keyed bot config schema`.

### Task 60.3: Broaden candidate generation, drop personality scoring/softmax

**Files:** `apps/api/src/services/bot/bot-candidates.ts` (+ test),
`packages/chess-analysis/src/bot-candidate-score.ts` → deleted, replaced by
`packages/chess-analysis/src/bot-move-pick.ts` (+ test),
`packages/chess-analysis/src/index.ts` (export swap).

- [x] `bot-candidates.ts`: `buildBotCandidates` calls `analyzeBotPosition`
      with a fixed wide `multiPv` constant (e.g. `BOT_CANDIDATE_BREADTH = 40`)
      instead of `bot.multiPv`, at `depth` from the caller's resolved phase
      profile (now passed in directly rather than read off `bot.depth`).
      Verify the engine backend clips gracefully when `multiPv` exceeds the
      position's actual legal-move count (check `services/engine/src/uci.ts`'s
      `setoption name MultiPV` handling / add a defensive `Math.min` against
      a computed legal-move count if it doesn't).
- [x] `bot-move-pick.ts` (new): `pickBotMove({ candidates, personality,
      bestMoveChance, mateConversionChance, random }): BotCandidate` —
      `candidates[0]` is the engine's top-ranked line (already sorted by the
      engine's own eval). If `candidates[0].mateIn` is a positive number, roll
      against `max(bestMoveChance, mateConversionChance)`; otherwise roll
      against `bestMoveChance`. On a hit, return `candidates[0]`. On a miss,
      call `pickPersonalityWeightedMove` — reuses the *existing* per-candidate
      signal flags (`createsHangingPiece`, `createsFork`, `forkInPlies`,
      `createsUnderDefendedPiece`, `mobilityDelta`, already computed by
      `annotateCandidateMoves`/`annotatePvTactics` and untouched by this task)
      as literal weighted-random sampling weights keyed off
      `personality.aggression`/`trapSeeking`/`defensiveness` — no engine score
      blended in this branch at all, per the "replace, don't blend" decision.
      Keep a small floor weight (e.g. 0.05) per candidate so no legal move is
      literally unreachable.
- [x] Delete `bot-candidate-score.ts` and its test; port over
      `BOT_SCORE_WEIGHTS`-equivalent tunable constants into `bot-move-pick.ts`
      under a new name reflecting their new role (selection weights, not score
      bonuses).
- [x] Commit: `feat: replace bot score-softmax with weighted personality sampling`.

### Task 60.4: Rewrite selectBotMove around the dice-roll model

**Files:** `apps/api/src/services/bot/bot-move-selector.ts` (+ test),
`apps/api/src/routes/sessions.ts` (drop `callTiebreak` wiring),
`apps/api/src/llm/bot-tiebreak.ts` → deleted (+ test),
`packages/prompts/src/bot-move-choice.ts` → deleted (+ test),
`packages/prompts/src/index.ts` (export removal), `docs/prompts.md`
(regenerate via `npm run docs:prompts`).

- [x] `selectBotMove`: book check unchanged (`selectBookMove`, still
      opening-only via `bookPlies`/`bookMistakeChance` — those two fields are
      untouched by this phase). Otherwise: `phase = classifyBotGamePhase(fen,
      plyCount, bot.bookPlies)`, `profile = bot.phases[phase]`, candidates via
      `buildBotCandidates(deps, fen, profile.depth)` (Task 60.3's signature),
      `pickBotMove({ candidates, personality: bot.personality,
      bestMoveChance: profile.bestMoveChance, bot.mateConversionChance,
      random: deps.random })`.
- [x] Remove `TIEBREAK_SCORE_MARGIN`, `closeScoringCluster`, the
      `deps.callTiebreak` dependency, and `SelectedBotMove.usedAi` (or keep the
      field but it's now always `false` — prefer removing it and updating
      every caller that reads it, since a dead-always-false field is worse
      than no field).
- [x] Delete `apps/api/src/llm/bot-tiebreak.ts` and
      `packages/prompts/src/bot-move-choice.ts` plus their tests, and every
      import of them (`apps/api/src/routes/sessions.ts`'s dependency wiring
      for `POST /api/sessions/play-bot` and the move/request-bot-move routes).
- [x] Commit: `feat: rewrite bot move selection around explicit probability rolls`.

### Task 60.5: Regenerate the 30-bot roster's phase profiles

**Files:** `packages/shared/src/bot-roster.ts`.

- [x] For each of the 30 existing bots, derive the new fields from its
      *current* `depth`/`temperature` (preserving each bot's already-hand-tuned
      character instead of retyping 90 numbers from scratch):
      `middlegame.bestMoveChance = clamp(1 - temperature * 1.4, 0.05, 0.95)`,
      `opening.bestMoveChance = clamp(middlegame.bestMoveChance + 0.15, 0, 0.97)`,
      `endgame.bestMoveChance = clamp(middlegame.bestMoveChance + 0.25, 0, 0.98)`,
      `opening.depth = middlegame.depth = <bot's current depth>`,
      `endgame.depth = min(<bot's current depth> + 6, 24)`,
      `mateConversionChance = clamp(endgame.bestMoveChance + 0.15, 0.55, 0.99)`.
      Validation check: `nate-brooks` (elo 300, temperature 0.7) should land
      near 5% middlegame best-move chance and `sophie-chen` (elo 500,
      temperature 0.3) near 50-60% — both matching the user's own worked
      examples from the design conversation.
- [x] Drop `multiPv`, `aiEnabled`, `temperature` from every entry (schema no
      longer has them — Task 60.2).
- [x] Spot-check a handful of bots across all five tiers by eye (not just the
      two validation-check bots) for reasonable monotonic progression —
      `bestMoveChance` and `depth` should both trend upward with `elo` within
      each phase, with no inversions.
- [x] Commit: `feat: regenerate bot roster for phase-keyed probability model`.

### Task 60.6: Test sweep and integration check

**Files:** every `apps/api/src/services/bot/*.test.ts`, `apps/web` tests
that construct a `BotConfig` fixture (search for `personality:`/`temperature:`
literals in `apps/web/src/**/*.test.ts`), `apps/api/src/routes/sessions.test.ts`.

- [x] Update every test fixture that builds a `BotConfig` object with the old
      flat shape to the new phase-keyed shape.
- [x] Full-repo `npm run typecheck`, `npx eslint .`, `npx vitest run` (no
      workspace scoping) — confirm clean before closing out the phase.
- [x] Commit: `test: update bot config fixtures for phase-keyed model` (or
      fold into 60.5/60.4's commits if the diffs end up small enough to not
      warrant a separate commit — call this at commit time, not up front).

**Done:** All six tasks landed as planned, split across two parallel forks
(60.3: candidate breadth + `bot-move-pick.ts`; 60.5: roster regeneration —
disjoint file sets, no shared-file conflict) plus 60.1/60.2/60.4/60.6 done
directly, mirroring Phase 59's split. One dependency neither task list nor
the original grep sweep caught: `apps/api/src/services/diagnostic-reachability.ts`'s
`depthForRating` (Task 54.1's human-reachability proxy) read `nearest.depth`
off a `BOT_ROSTER` entry — fixed to `nearest.phases.middlegame.depth`
(documented in that file: middlegame specifically, not the endgame phase's
deliberately-boosted depth, since middlegame depth is what actually
represents "how deep would a player at this rating calculate"). Full-repo
verification after all six tasks: `npm run typecheck` clean, `npx eslint .`
clean, `npx vitest run` (unscoped) — 371/371 test files, 2604/2604 tests
passing (down from 2607 at the end of Phase 59, net of deleting
`bot-candidate-score.test.ts` and `bot-move-choice.test.ts` wholesale and
adding `bot-game-phase.test.ts`/`bot-move-pick.test.ts` and a rewritten
`bot-move-selector.test.ts`). The one "Unhandled Error" in that run — a
Postgres connection dropped during test-DB teardown — is the same
pre-existing, unrelated teardown flake noted at the end of Phase 59 (same
symptom, different attributed test file this time, consistent with it being
a random teardown race rather than anything this phase touched).

This closes out Phase 60 — all six tasks are now checked off.

---

## Phase 61 — Bots documented with real diagnosis codes

Per user decision: a bot's "character" (Phase 60's personality/phase
profiles) should also be documented against the same diagnosis-code
taxonomy the coach uses to diagnose real students (`packages/shared/src/diagnosis/`,
410 codes across 18 families — `docs/diagnose.md`), not just free-text
personality traits. "Documented" is taken literally: a code a bot is
tagged with must be something its actual move-selection logic can be shown,
in a test, to exhibit — not flavor text layered on top.

**Scope decision (deliberately narrow):** a bot may only be tagged with a
code `packages/chess-analysis/src/diagnostics/motif-to-code.ts`'s
`motifToCode` can actually resolve from a candidate move's tactic motif —
15 `TA-*` codes: `TA-01` (mate-in-one), `TA-04` (back-rank), `TA-07`/`08`/
`09`/`10` (knight/pawn/king/sliding-piece fork), `TA-11`/`12` (absolute/
relative pin), `TA-14` (skewer), `TA-16` (discovered attack), `TA-17`
(double check), `TA-18` (removes defender), `TA-19` (overloaded defender),
`TA-26` (trapped piece), `TA-43` (free/hanging piece). Every other family
(BV/MS/CA/TM/MX/OP/EV/ST/PW/AT/DF/CV/EG/PS/LR/PD/RB — 395 of the 410 codes)
describes a mechanism — scanning failures, calculation depth, time
management, psychology, opening prep, endgame technique knowledge,
learning habits — a single-position, dice-roll-based move selector has no
way to distinguishably manifest. Tagging a bot with e.g. `PS-09
Lower-rated-opponent overconfidence` or `TM-05 Opening-time sink` would be
documentation that overclaims what the code does. `motifToCode` is the
exact function the real per-ply diagnostic detectors
(`diagnostics/ta-offensive.ts`/`ta-defensive.ts`) use to resolve a
position's tactic motif to a code — reusing it means a bot's documented
weakness is checked through the identical code path a real student's is,
not a parallel one that could quietly drift out of sync.

**Mechanism:** `BotCandidate` gains `diagnosisCode: DiagnosisCodeId | null`,
resolved once per candidate in `bot-candidates.ts` via `motifToCode(motif,
{ fenBefore: fen, moveSan: line.moveSan })` (the `MotifReplay` shape
`motif-to-code.ts` already defines — fork/pin need the replay to recover
which piece/kind embodies them; every other motif resolves directly,
replay unused). `BotConfig` gains `diagnosisCodes: DiagnosisCodeId[]`. In
`pickBotMove`, when `candidates[0].diagnosisCode` is non-null and appears
in `bot.diagnosisCodes`, the roll uses a dampened `DIAGNOSED_BLIND_SPOT_CHANCE`
instead of (and capping, via `Math.min`, even over the existing
mate-conversion boost) the phase's own `bestMoveChance` — a bot documented
with `TA-01` mate-in-one blindness should specifically be the one that
sometimes still fumbles a mate-in-one, even though the general
mate-completion guarantee (Phase 60) would otherwise favor taking it. This
mirrors the existing mate-conversion override's shape exactly (a candidate
property triggers a different chance), it just caps downward instead of
boosting upward.

**Why `Math.min` against the mate-boosted chance rather than a separate
branch:** keeps exactly one dice roll per move (no double-rolling), and
makes the interaction legible as a single sentence — "a documented blind
spot always wins the tug-of-war, even against the mate-completion
guarantee" — rather than a priority list of special cases.

**Guardrail, not just prose:** `motif-to-code.ts` exports a new
`MOTIF_RESOLVABLE_DIAGNOSIS_CODES: readonly DiagnosisCodeId[]` (every code
`DIRECT_CODE_BY_MOTIF`/`FORK_CODE_BY_PIECE`/`PIN_CODE_BY_KIND` can produce,
deduplicated) — computed from the same private tables `motifToCode` itself
reads, so it can't drift out of sync with what the function actually
resolves. A roster test asserts every `BOT_ROSTER` entry's `diagnosisCodes`
is a subset of it, enforcing the scope decision above in code, not only in
this prose.

**Out of scope for this phase:** no UI surfacing (a bot's page/card doesn't
yet show "known weaknesses" to the student) — the user asked for the
diagnostics to be brought into the picture and documented, not for a new
UI element; add that separately if wanted. No dampening of the
personality-weighted "miss" branch's own candidate weights (only
`candidates[0]` is checked against `bot.diagnosisCodes`) — a documented
bot still *can* stumble into playing its own weak tactic via the miss
branch's ordinary weighting, just not specifically biased toward or away
from it there. Revisit both if the simpler version doesn't feel like
enough once it's live.

### Task 61.1: Resolve a candidate's motif to a diagnosis code

**Files:** `packages/chess-analysis/src/diagnostics/motif-to-code.ts` (+ test),
`packages/chess-analysis/src/bot-move-pick.ts` (+ test),
`apps/api/src/services/bot/bot-candidates.ts` (+ test).

- [x] `motif-to-code.ts`: export `MOTIF_RESOLVABLE_DIAGNOSIS_CODES`, derived
      from `DIRECT_CODE_BY_MOTIF`/`FORK_CODE_BY_PIECE`/`PIN_CODE_BY_KIND`'s
      own values (`Object.values`, deduplicated, `null` filtered out, sorted
      for a stable snapshot) — never hand-typed as a separate literal list.
- [x] `BotCandidate` gains `diagnosisCode: DiagnosisCodeId | null`.
- [x] `bot-candidates.ts`: for each line, `diagnosisCode: annotation?.motif
      != null ? motifToCode(annotation.motif, { fenBefore: fen, moveSan:
      line.moveSan }) : null`.
- [x] Commit: `feat: resolve bot candidate moves to diagnosis codes`.

### Task 61.2: Diagnosed-blind-spot dampening in pickBotMove

**Files:** `packages/chess-analysis/src/bot-move-pick.ts` (+ test),
`packages/shared/src/bot.ts`.

- [x] `BotConfig` gains `diagnosisCodes: z.array(DiagnosisCodeIdSchema)`
      (import from `../diagnosis/catalog-types.js` — reuse the existing
      schema, don't redeclare the `[A-Z]{2}-\d{2}` pattern).
- [x] `PickBotMoveInput` gains `diagnosisCodes: readonly DiagnosisCodeId[]`.
      `DIAGNOSED_BLIND_SPOT_CHANCE` — a single module-level tunable
      constant (not yet another per-bot number), e.g. `0.25`, named next to
      `BOT_PICK_WEIGHTS`.
- [x] `pickBotMove`: `let chance = bestMoveChance; if (best.mateIn !== null
      && best.mateIn > 0) chance = Math.max(chance, mateConversionChance);
      if (best.diagnosisCode !== null && diagnosisCodes.includes(best.diagnosisCode))
      chance = Math.min(chance, DIAGNOSED_BLIND_SPOT_CHANCE);` — one roll
      against the final `chance`, same as today.
- [x] Tests: a documented code on `candidates[0]` dampens the roll even when
      `bestMoveChance` is 1; an undocumented code on `candidates[0]` leaves
      `bestMoveChance` untouched; a mate-in-1 that's ALSO the bot's
      documented `TA-01` caps down to `DIAGNOSED_BLIND_SPOT_CHANCE` even
      though the mate-conversion boost alone would have pushed it up.
- [x] Commit: `feat: dampen bot's documented diagnosis-code blind spots`.

### Task 61.3: Wire selectBotMove and document the roster

**Files:** `apps/api/src/services/bot/bot-move-selector.ts` (+ test),
`packages/shared/src/bot-roster.ts`.

- [x] `selectBotMove` passes `diagnosisCodes: bot.diagnosisCodes` into
      `pickBotMove`'s input.
- [x] For each of the 30 `BOT_ROSTER` entries, assign 2-4 codes from
      `MOTIF_RESOLVABLE_DIAGNOSIS_CODES` that cohere with the bot's existing
      `description`/`personality` (e.g. a high-`trapSeeking`,
      low-`defensiveness` beginner reads naturally as fork-blind —
      `TA-07`/`TA-08`; a bot whose description calls out forgetting threats
      fits `TA-43`; a solid, low-aggression/high-defensiveness bot may
      warrant none at all — an empty list is a legitimate, honest answer,
      not a gap to fill). Update the file's top doc comment to explain what
      `diagnosisCodes` means and point at Phase 61 for the full rationale,
      so a reader doesn't have to reconstruct the scope decision from the
      data alone.
- [x] Test: every `BOT_ROSTER` entry's `diagnosisCodes` is a subset of
      `MOTIF_RESOLVABLE_DIAGNOSIS_CODES` and every id exists in
      `DIAGNOSIS_CODES_BY_ID` (belt-and-suspenders — the first check is the
      real guardrail per the scope decision above, the second catches a
      typo'd code id that happens to still match the `[A-Z]{2}-\d{2}` shape).
- [x] Commit: `feat: document bot roster with real diagnosis codes`.

### Task 61.4: Test sweep and integration check

**Files:** every `apps/api/src/services/bot/*.test.ts` fixture that builds a
`BotConfig` (needs a `diagnosisCodes: []` default), plus whatever else the
schema change touches.

- [x] Update every `BotConfig` test fixture across `apps/api`/`packages/*`
      with the new required field.
- [x] Full-repo `npm run typecheck`, `npx eslint .`, `npx vitest run` (no
      workspace scoping) — confirm clean before closing out the phase.
- [x] Commit: fold into the task above's commit if the diffs are small
      enough, otherwise a standalone `test: update bot config fixtures for
      diagnosisCodes`.

**Done:** All four tasks landed — 61.1/61.2 (core mechanism: `BotCandidate.diagnosisCode`,
`MOTIF_RESOLVABLE_DIAGNOSIS_CODES`, `pickBotMove`'s dampening) done directly
given they touch shared/critical files; 61.3's roster half (assigning 0-4
codes per bot across all 30, with rationale) forked out as an isolated,
single-file, judgment-heavy task once the schema shape was fixed. One
placement deviation from the original task text: the roster-validation
guardrail test (`every BOT_ROSTER entry's diagnosisCodes is a subset of
MOTIF_RESOLVABLE_DIAGNOSIS_CODES`) couldn't live in `packages/shared` as
originally written — `packages/shared` cannot depend on
`packages/chess-analysis` (dependency direction is the reverse), so it
lives in `packages/chess-analysis/src/bot-roster-diagnosis-codes.test.ts`
instead, importing `BOT_ROSTER` from `@freechesscoach/shared`. 7 of 30
bots ended up with an empty `diagnosisCodes` (Sophie Chen, Steven Anders,
Ella Fischer, Marco Silva, Viktor Hahn, Elias Grant, Yuna Seo) — each
explicitly described as accurate/disciplined/clinical, an honest "no
documented blind spot" rather than a gap. Full-repo verification:
`npm run typecheck` clean, `npx eslint .` clean, `npx vitest run`
(unscoped) — 371/372 test files passed outright, one
(`apps/api/src/routes/stats.test.ts`) failed on a `beforeAll` DB-setup
hook timeout under full-suite resource contention; re-run in isolation it
passed cleanly in 5.4s, confirming this is the same class of pre-existing
full-suite test-DB flakiness noted at the end of Phases 59 and 60, not a
regression from this phase (stats.test.ts has no relation to bots).
2608/2612 tests passed (4 skipped, unrelated to this phase).

This closes out Phase 61 — all four tasks are now checked off.

---

## Phase 62 — Elo-calibrated diagnosis-driven bot weaknesses

Per user decision: two gaps remain after Phase 60/61. First,
`bestMoveChance` (Phase 60) is 30 hand-picked numbers derived once from the
now-deleted `temperature` field (Task 60.5) — not calibrated to how often a
player of a given rating actually finds the engine's top move in reality.
Second, a documented `diagnosisCode` (Phase 61) only ever dampens *whether*
the bot plays the engine's own best move (`pickBotMove`,
`bot-move-pick.ts:97-99`) — it never steers the bot toward actually
*playing* a move that exhibits one of its own documented weaknesses. The
roster's `diagnosisCodes` are also drawn only from the 15 `TA-*` codes
`motifToCode` resolves (`bot-roster.ts:20-27`'s "every other family has no
way to distinguishably manifest" claim), which is now false for two
families: `packages/chess-analysis/src/diagnostics/registry.ts` already
wires 8 real `BV-*` (board vision / hanging pieces) and 9 real `MS-*`
(one-ply scan omission) detectors, currently used only by the whole-game
batch pipeline (`apps/api/src/services/build-diagnostics.ts`).

**Family scope (decided):** `TA` ∪ `BV` ∪ `MS` only — the only families
with a real per-move detector. The other 15 families in `docs/diagnose.md`
(ST, PS, EG, OP, CA, EV, DF, AT, PW, CV, LR, PD, RB, TM, MX) have no
per-move detector; out of scope for this phase, flagged as future work.

**Detector cost (decided):** real BV/MS/TA detectors only ever classify the
move the bot actually chose (one extra engine search, mirroring the
existing `apps/api/src/services/play-move-quality.ts` pattern), never all
~40 candidates — detector output *tags* the chosen move for the record, it
doesn't drive selection. Selection is driven by the elo curves (Task 62.1)
plus a cheap per-candidate proxy (Task 62.2) that approximates the same
code families without a second search.

**Three elo-parameterized curves, not per-bot constants (decided):**
`P(best move)`: 300→0.05, 500→0.60, 800→0.80, rising toward the existing
top-tier ~0.97+ by 2300. `P(manifest | not best move)`: 300→0.95, 800→0.30,
1200→0.02, falling toward ~0 by top tier — conditional on the miss branch,
not a fraction of all moves (the only reading that keeps 800's two given
numbers, 0.80 best + 0.30 manifest, from summing past 100%).
`diagnosisCodes` breadth: 300→ the full `TA∪BV∪MS` eligible pool ("all
diagnose"), 400→ noticeably fewer, 1500→ much fewer, 0 by top tier.

**Plausible-move shortlist (decided):** humans don't weigh all 40 legal
moves — they narrow to what looks forcing or relevant. The middlegame miss
branch builds a shortlist from the position's CCT (checks/captures/
threats) analysis before sampling, capped 3-5, falling back to the full
field when fewer than 2 candidates qualify.

### Task 62.1: Elo-calibrated probability curves

**Files:** `packages/chess-analysis/src/bot-skill-curve.ts` (+ test) — pure
logic, per AGENTS.md's layering rule, not `packages/shared`.

- [x] `bestMoveChanceForElo(elo: number, phase: MovePhase): number` and
      `diagnosisManifestChanceForElo(elo: number): number` — monotonic
      curves fit through the anchors above (piecewise log/power
      interpolation between anchors, clamped outside 300-2300). Test
      asserts every given anchor within ~2 percentage points and strict
      monotonicity (non-decreasing / non-increasing respectively) across
      the full elo range.
- [x] Preserve today's existing *shape* of phase differences (every bot
      currently gets a higher `bestMoveChance` and deeper search in the
      endgame than opening/middlegame, so weak bots don't shuffle forever
      in king endings) as a phase multiplier applied on top of the elo
      curve, not a second set of hand-picked absolutes — document the
      reasoning inline the way the roster's endgame-depth comment does.
- [x] `mateConversionChance` (Phase 60) is untouched — a separate,
      already-tuned floor, not part of this recalibration.
- [x] Commit: `feat: elo-calibrated bot move-accuracy curves`.

### Task 62.2: Cheap per-candidate diagnosis-code proxy

**Files:** `packages/chess-analysis/src/candidate-moves.ts`,
`packages/chess-analysis/src/bot-move-pick.ts`,
`apps/api/src/services/bot/bot-candidates.ts` (+ tests).

- [x] `BotCandidate.diagnosisCode: DiagnosisCodeId | null` →
      `diagnosisCodes: readonly DiagnosisCodeId[]`, still computed with no
      extra engine calls (same single multiPv-40 search
      `buildBotCandidates` already runs).
- [x] Fix the existing ownership blur: `candidate-moves.ts`'s
      `createsHangingPiece` (`delta.newHangingPieces.length > 0`) doesn't
      distinguish the mover's own piece from the opponent's — split into
      own/opponent variants (`PositionFeatures.hangingPieces` already
      carries per-piece `color`) so an "aggressive" personality rewarding a
      genuine attacking threat is never confused with a genuine
      self-blunder. Also added `ignoresOwnHangingPiece`/
      `ignoresOpponentHangingPiece` (an existing, pre-move threat left
      unaddressed — a different signal than "newly created").
- [x] Add cheap positional proxies for `BV-01`/`BV-02`
      (own/opponent hanging-piece blindness, from the split above) and
      `MS-02`/`MS-03` (opponent capture/threat already present in
      `fenBefore` and still unaddressed in `fenAfter`, plus the "creates"
      signal for the direct-threat-omission reading) — new
      `diagnostics/candidate-diagnosis-proxy.ts`'s `candidateDiagnosisCodes`,
      with `CANDIDATE_PROXY_RESOLVABLE_DIAGNOSIS_CODES` mirroring
      `motif-to-code.ts`'s `MOTIF_RESOLVABLE_DIAGNOSIS_CODES`.
- [x] `TA` stays exactly as-is (`motifToCode`, already cheap, unchanged).
- [x] Commit: `feat: cheap per-candidate diagnosis-code proxy for bots`
      (combined with Task 62.3 below — they turned out inseparable in
      `bot-move-pick.ts`; see that commit).

### Task 62.3: Steer the miss-branch toward a documented weakness

**Files:** `packages/chess-analysis/src/bot-move-pick.ts`,
`apps/api/src/services/bot/bot-candidates.ts`,
`apps/api/src/services/bot/bot-move-selector.ts` (+ tests).

- [x] Middlegame plausible-move shortlist: `analyzeChecksCapturesThreats(fenBefore)`
      (already a cheap pure-position function, no engine call) — keep only
      candidates that are a check, a capture, or a reply to one of the
      position's threats, cap to 5 (spread evenly across the qualifying
      pool when more qualify, not truncated to the top-N by eval — see
      `buildPlausibleMoveShortlist`'s doc comment for why). Fewer than 2
      qualifying candidates → fall back to the full field unchanged.
- [x] Restructured `pickBotMove`: roll `bestMoveChance` (Task 62.1,
      `bestMoveChanceForElo`) → hit → `candidates[0]` (mate-conversion
      floor unchanged). Miss → roll `diagnosisManifestChance` (Task 62.1,
      `diagnosisManifestChanceForElo`) → hit → sample only among
      shortlisted candidates whose `diagnosisCodes` (Task 62.2) intersect
      `bot.diagnosisCodes`, falling back to the full shortlist if none
      match (the roll must never dead-end) → miss → existing
      personality-weighted sample over the shortlist.
- [x] Removed Phase 61's `DIAGNOSED_BLIND_SPOT_CHANCE` dampening on
      `candidates[0]` entirely — this steering step supersedes it
      (dampening only ever affected whether the best move was played at
      all; it never chose a matching candidate).
- [x] `bot-move-selector.ts` now calls `bestMoveChanceForElo(bot.elo, phase)`/
      `diagnosisManifestChanceForElo(bot.elo)` instead of reading
      `profile.bestMoveChance` — that roster field is now dead and gets
      removed from the schema/roster in Task 62.5.
- [x] Also fixed `personalityWeight`'s "aggression" term to read the new
      `createsOpponentHangingPiece` (a real threat) instead of the old
      unsplit `createsHangingPiece`, which it had been using as if it only
      ever meant "attacks the opponent" — see Task 62.2's split.
- [x] Commit: `feat: steer bot move selection toward documented weaknesses`.

### Task 62.4: Real detector pass on the chosen move (tagging only)

**Files:** `apps/api/src/services/play-move-quality.ts`,
`apps/api/src/services/play-moves.ts`,
`apps/api/src/db/repositories/game-move-qualities.ts`,
`apps/api/src/db/schema.ts`, new
`apps/api/src/db/migrations/0030_bot_move_diagnosis_codes.ts` (+ tests).

- [x] **Scope correction from the plan draft**: no new `classify-bot-move.ts`
      was needed. `apps/api/src/services/play-moves.ts`'s shared `commitMove`
      helper — used by `commitPlayerMove`, `commitCoachMove`, *and*
      `commitBotMove` alike — already calls `classifyAndRecordMove`
      (`play-move-quality.ts`) for every mover, including the bot, doing its
      own before/after `analyzePosition` pair unconditionally. Building a
      second, bot-specific classification path would have duplicated engine
      calls already happening; the real gap was that nothing turned the
      already-computed `ClassifiedMove` into diagnosis codes.
- [x] `classifyAndRecordMove` gained an opt-in `computeDiagnosisCodes`
      argument: when true, `buildPlyDiagnosticContext` + all of
      `DIAGNOSTIC_DETECTORS` (`BV`/`MS`/`TA`) run against the classified
      move, keeping only `failed: true` observations (a detector reporting
      an opportunity the move *handled* is the opposite of a weakness
      manifesting). `BV-10`/`MS-07`/`MS-14` need `ctx.previousMove`/
      `ctx.nextMoves`, always undefined in this single-live-move call —
      all three already treat that as "can't determine, don't fire" rather
      than throwing, so no explicit filtering was needed after all.
      Defaults to `false` — real players already have a fuller,
      cross-ply-aware diagnosis pipeline (the batch job, Phase 53+), and
      this live path would only ever see a strictly weaker single-ply
      signal for them, so only `commitBotMove` opts in.
- [x] New `diagnosisCodes jsonb NOT NULL DEFAULT '[]'` column on
      `game_move_qualities` (migration `0030`, mirroring `0017_move_reasons.ts`'s
      pattern exactly), persisted on every row — `[]` for player/coach
      moves, the real registry's output for a bot's move. This is "the
      bot's move record" the plan draft referred to: an existing table
      already keyed by `(gameId, ply)`, not a new one.
- [x] Commit: `feat: tag bot moves with real diagnosis-code detectors`.

### Task 62.5: Widen and re-tier the roster

**Files:** `packages/shared/src/bot-roster.ts`, `packages/shared/src/bot.ts`
(dropped `BotPhaseProfileSchema.bestMoveChance`, now dead — derived live by
Task 62.3), `packages/chess-analysis/src/bot-roster-diagnosis-codes.test.ts`
(extended, pre-existing from Phase 61).

- [x] New `ELIGIBLE_DIAGNOSIS_CODES` (19 codes: 15 `TA-*` +
      `BV-01`/`BV-02`/`MS-02`/`MS-03`) in `bot-roster.ts` — a hand-maintained
      literal, not an import, since `packages/shared` cannot depend on
      `packages/chess-analysis` (AGENTS.md layering); a new roster test
      asserts it stays in sync with the union of
      `MOTIF_RESOLVABLE_DIAGNOSIS_CODES`/`CANDIDATE_PROXY_RESOLVABLE_DIAGNOSIS_CODES`.
      Rewrote the doc comment to name this scope and what's still excluded
      (the other 15 families: no detector; `TA`-defensive/`MS-07`/`MS-14`:
      need cross-ply context a single live move doesn't have).
- [x] `diagnosisCodeBreadthForElo(elo)`: piecewise-linear anchors
      (300→19 "all", 400→14, 600→9, 800→6, 1200→3, 1500→2, 2300→0).
      `documentedDiagnosisCodes(signature, elo)` fills a bot's existing
      hand-picked "signature" codes up to that target from
      `ELIGIBLE_DIAGNOSIS_CODES`'s fixed order, never dropping a signature
      code even when the curve alone would call for fewer. Every one of
      the 30 roster entries now calls this instead of a literal array.
- [x] One deliberate content fix during verification: `adrian-laurent`
      (elo 2150)'s 2-code signature exceeded `william-hart` (elo 2050)'s
      1, breaking strict monotonicity — trimmed to his single
      strongest-fitting code (`TA-10`) rather than weakening the
      never-drop-signature guarantee for every bot.
- [x] Extended the pre-existing Phase 61 roster test
      (`bot-roster-diagnosis-codes.test.ts`) rather than writing a new one:
      subset check now against `ELIGIBLE_DIAGNOSIS_CODES`, plus new checks
      for the sync-with-chess-analysis invariant, non-increasing breadth by
      elo, and the lowest-elo bot documenting the full pool.
- [x] Swept every `bot-*.test.ts` fixture that still built a `BotPhaseProfile`
      literal with the now-dropped `bestMoveChance` field — most were inert
      noise (mechanically stripped), but `bot-move-selector.test.ts`'s core
      scenarios ("a roll under bestMoveChance...", "forced mate uses
      mateConversionChance even when bestMoveChance would otherwise
      miss") had gone quietly vacuous: they set the now-ignored fixture
      field and were passing only because `baseBot()`'s fixed `elo: 800`
      happened to produce a real chance that still satisfied each
      assertion by coincidence. Rewrote them to control the elo-derived
      chance directly via `elo` and assert against `bestMoveChanceForElo`'s
      real output, so they test what they claim again.
- [x] Commit: `feat: widen and re-tier bot roster diagnosis codes`.

**Done:** All five tasks landed. One task-boundary correction happened
mid-flight (noted in Task 62.4): the plan draft's `classify-bot-move.ts`
was never built — `play-moves.ts`'s shared `commitMove` already ran
`classifyAndRecordMove` for every mover including the bot, so the real gap
was turning that already-computed classification into diagnosis codes, not
a second classification path. Full-repo verification after all five tasks:
`npm run typecheck` clean, `npx eslint .` clean, `npx vitest run`
(unscoped) — 374/374 test files, 2641/2641 tests passing. One CLI script
test (`build-lichess-eval-index.test.mjs`) timed out once under full-suite
load and passed cleanly in isolation — a pre-existing subprocess-timing
flake unrelated to this phase, not investigated further.

This closes out Phase 62 — all five tasks are now checked off.

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
