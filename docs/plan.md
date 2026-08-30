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



## Context for the next agent (read before starting Phase 42)

Phases 42-49 below are **planned, not yet implemented**. Everything above
this line (through Phase 41) is implemented, tested, and about to be
committed as a clean baseline — `git log` from here on is real history you
can trust; anything before this commit that touched Phases 32-41 was
squashed into a small number of coarse-grained commits during handoff
(package-boundary grouped: chess-analysis/shared/engine, apps/api, apps/web,
docs), not the fine per-phase-per-commit history the "Commit:" lines above
describe — don't go looking for those individual commits in `git log`, they
don't exist as such.

**Why Phases 42-49 exist:** after Phase 41 shipped, the user pointed out a
real gap in "Prevented" (missed a rook-sac → check → fork combo landing 3+
plies out, because the ply-1-only check in Phase 40 can't see it) and
proposed a graduated per-engine-line-rank ply schedule as the fix. While
scoping that, two more real findings came up from actual captured API
responses (not test mocks) that reshaped the plan:

1. **chess-api.com almost certainly never returns more than 1 line in
   practice**, despite our code asking for up to `ENGINE_MULTI_PV` (5).
   There is zero real evidence anywhere in this repo's history of it ever
   returning >1 — every multi-line example is a hand-written test fixture.
   But that one line carries a genuine, deep `continuationArr` (a real
   sample had 15 plies) that `chess-api-engine-backend.ts` currently throws
   away (`pvSan: [raw.san]`). Decision: **don't change the request** (it's
   already tolerant of however many lines come back — changing it risks
   regressing Found/opportunities' "top-N candidate moves" logic for no
   confirmed benefit) — just stop discarding the continuation on whatever
   comes back. See Phase 43.
2. **The Lichess bulk dump (the actual source our `.bin` index is built
   from) genuinely does have multi-pv breadth**, confirmed with a real
   20,000-position statistical sample this session (streamed via
   `zstdcat apps/api/data/lichess_db_eval.jsonl.zst | head -n 20000`, not a
   single anecdote): 54% single-pv, but 46% have 2+, 16.6% have the full 5,
   and pv depth is consistently ~10 plies whenever present. This is a
   *different* data source than `lichess.org`'s live `/api/cloud-eval`
   endpoint (which the user separately found only returns 1 pv per query —
   that endpoint isn't used anywhere in this codebase, it's not what feeds
   our index, don't confuse the two if this comes up again).
3. **Deliberate design philosophy, confirmed with the user**: don't force
   any uniform "N lines" assumption across backends. `ENGINE_MULTI_PV=5` is
   only ever a *request ceiling* — every downstream consumer
   (`scanAvailableMotifs`, `annotatePvTactics`) already degrades gracefully
   to however many lines and however deep a PV a given backend actually
   returns, with no per-backend branching. If a stronger backend shows up
   later, this same code gets proportionally better for free. Don't add
   special-casing per backend beyond what Phases 43/49 already do to
   *capture* real data that's currently being thrown away — the *scanning*
   logic itself should stay backend-agnostic.

**Explicitly deferred, not part of this plan, don't pick it up
unprompted:** the user raised replacing `position_evaluations`' batch-side
cross-game cache with per-game annotated-PGN persistence (reasoning:
positions worth cross-game deduping are mostly already covered by the
Lichess index, so a generic FEN cache buys little for the tail while its
lossy write path actively hurts this feature). Real idea, deliberately
punted — verbatim: *"about database I agree lets go the minimal that keep
the current solution working and then comeback to it when needed."* Phase
44 below is the minimal fix; the bigger redesign is a separate future plan,
only if/when the user asks for it again.

**Played and Found must stay untouched** by Phases 42-49 — both are
single-move literal classifications where depth doesn't apply. Nothing here
should touch `game-tactic-motifs.ts`'s `computeTacticMotifCounts`/
`computeTacticMotifPlayed`, their schema fields, or dashboard aggregation.

**Ordering matters less than it looks**: Phase 42 (shared `pvUciToSan`) is a
real prerequisite for both 43 and 49. Phases 45-47 (schedule, scan
primitive, `findDefusedThreats` redesign, service rewire) are a tight
sequential chain. Phase 48 (live-coach) and Phase 49 (Lichess v3) are each
independent of one another and could be done in either order, or in
parallel by different people, once 42/45 land.

## Phase 42 — Shared multi-move `pvUciToSan` in `chess-analysis`

No multi-move UCI→SAN ("PV walking") utility exists today in a package
`apps/api` depends on. `services/engine/src/uci.ts`'s `pvUciToSan(fen,
pvUci): string[]` is the right model but lives in `@freechesscoach/engine`
(the Stockfish subprocess service — `apps/api` doesn't depend on it, and
adding that dependency for a pure string-conversion utility would be
architecturally odd). `packages/chess-analysis/src/uci-move.ts`'s
`uciToSan(fen, moveUci): string` (already used by `lichess-eval-engine-
backend.ts`) is single-move only.

**Files:** `packages/chess-analysis/src/uci-move.ts` (extend), its test, `src/index.ts`.

- [x] Add `pvUciToSan(fen, pvUci: string[]): string[]` alongside the
      existing single-move `uciToSan` — fold it over the sequence, applying
      each converted move to advance the position for the next conversion,
      stopping (returning the valid prefix, not throwing) at the first
      illegal/malformed UCI token. Same graceful-degradation contract as
      `services/engine/src/uci.ts:38-54`'s version.
- [x] Export from the package barrel.
- [x] Tests: a clean multi-move list converts fully; an illegal move
      partway through returns only the valid prefix; empty input returns
      `[]`; parity against a hand-computed SAN sequence for the
      `continuationArr` sample in Phase 43 below.
- [x] Commit: `feat: pvUciToSan — shared multi-move UCI-to-SAN conversion in chess-analysis (Phase 42)`.

## Phase 43 — chess-api.com: capture the real continuation it already sends

A real captured response (verbatim, from the user):

```json
{ "move": "g1f3", "san": "Nf3", "eval": 0.62, "mate": null,
  "continuationArr": ["e5d4", "f3d4", "g8f6", "b1c3", "f8e7", "g2g3",
    "b8c6", "f1g2", "e8g8", "e1g1", "c6d4", "d1d4", "c7c6", "f1e1", "c8e6"],
  "debug": "info depth 12 seldepth 17 multipv 1 score cp 62 ... pv g1f3 e5d4 f3d4 g8f6 ..." }
```

`continuationArr` is the PV *after* `move` — the full PV is `[move,
...continuationArr]` (confirmed against the same response's own `debug`
field). `chess-api-engine-backend.ts` currently discards it entirely
(`pvSan: [raw.san]`, line ~132).

**Files:** `apps/api/src/services/engine/chess-api-response.ts`,
`chess-api-engine-backend.ts`, their tests.

- [x] `ChessApiLine` gains `continuationArr?: string[]` (optional — some
      lines, e.g. near-terminal positions, may have none).
- [x] `analyzeViaChessApi`: build `pvSan` via `pvUciToSan(fen, [raw.move,
      ...(raw.continuationArr ?? [])])` (Phase 42) instead of `[raw.san]`.
      Falls back to a single-move `pvSan` automatically when
      `continuationArr` is absent/empty.
- [x] Request shape (`{fen, depth, variants}`) stays **unchanged** — this
      phase only changes how a returned line is parsed, not what's
      requested (see "Context for the next agent" above for why).
- [x] Add one low-frequency log (e.g. an "already logged once per process"
      flag) noting when a response comes back with fewer lines than
      `variants` requested — cheap, real production evidence for whether
      `variants` does anything at all, without spamming logs.
- [x] Tests: the exact sample above produces a multi-move `pvSan`; a
      response with no `continuationArr` still produces today's `pvSan:
      [san]` shape (regression pin); the existing multi-variant test
      extended so each mocked line carries its own `continuationArr` and
      gets its own independent `pvSan`.
- [x] Commit: `feat: chess-api backend captures each line's real continuation instead of discarding it (Phase 43)`.

## Phase 44 — Preserve `pvSan` through the batch cache round-trip (native mode)

`caching-engine-backend.ts`'s `toLeanEval` (every `position_evaluations`
cache **hit** inside batch `analyzeGame`) omits `pvSan` entirely. Its
counterpart `toDetailedAnalysis` (the write-back on a batch cache **miss**)
degrades to `pvSan: [line.moveSan]` before persisting — even though
Phase 38 means the raw backend's result passed in may already carry a real
multi-move PV. Net effect: only a genuine first-time native-mode compute in
the *same job run* currently keeps a real multi-ply `pvSan`; anything served
from cache has none. This is the minimal fix — see "Context for the next
agent" above for the bigger caching-architecture idea the user deliberately
deferred.

**Files:** `apps/api/src/services/engine/caching-engine-backend.ts` + test.

- [x] `toLeanEval`: include `pvSan: line.pvSan` untouched (whatever length
      it already is) instead of omitting the field.
- [x] `toDetailedAnalysis`: preserve an already-present multi-move `pvSan`
      (`line.pvSan ?? [line.moveSan]`) instead of unconditionally forcing a
      single-element array. No schema change (`EngineLineSchema.pvSan` is
      already optional).
- [x] Tests: a cache-populate-then-hit round trip preserves a multi-move
      `pvSan`; a line with no `pvSan` still round-trips as `undefined`, not
      a crash or a fabricated array.
- [x] Commit: `fix: stop discarding a fresh multi-ply PV when it passes through the batch eval cache (Phase 44)`.

## Phase 45 — Graduated schedule + scan primitive

One canonical, tunable schedule, formula-derived from `ENGINE_MULTI_PV` (not
a hand-sized literal array that could silently mismatch if that constant
moves between 3 and 5):

```ts
// packages/chess-analysis/src/prevention-scan-schedule.ts
import { ENGINE_MULTI_PV } from '@freechesscoach/shared';

export const PV_SCAN_MAX_DEPTH = 11; // absolute ceiling regardless of ENGINE_MULTI_PV

// rank 0 (engine's best line) gets the deepest walk, tapering 2 plies per
// rank, floor of 1. multiPv=5 -> [7,5,3,1,1] (the user's proposed
// schedule exactly). multiPv=3 -> [3,1,1].
export function scanDepthForRank(rank: number, multiPv: number = ENGINE_MULTI_PV): number {
  return Math.max(1, Math.min(PV_SCAN_MAX_DEPTH, 2 * (multiPv - rank) - 3));
}
```

The scan primitive, built strictly on top of the existing `annotatePvTactics`
(no changes to `pv-tactics.ts` itself — it already computes a general
per-ply `motif` at every step, not just fork):

```ts
// packages/chess-analysis/src/available-motifs-scan.ts
export interface PvMotifSighting { rank: number; ply: number; moveSan: string; motif: TacticMotifType; }
export interface AvailableMotifScan { motifs: ReadonlySet<TacticMotifType>; sightings: PvMotifSighting[]; }

export function scanAvailableMotifs(
  fenBefore: string,
  lines: readonly EngineLine[],
  topN: number = ENGINE_MULTI_PV
): AvailableMotifScan {
  const sightings: PvMotifSighting[] = [];
  lines.slice(0, topN).forEach((line, rank) => {
    const pv = line.pvSan && line.pvSan.length > 0 ? line.pvSan : [line.moveSan];
    const { steps } = annotatePvTactics(fenBefore, pv, scanDepthForRank(rank));
    for (const step of steps) {
      if (step.ply % 2 === 1 && step.motif) sightings.push({ rank, ply: step.ply, moveSan: step.moveSan, motif: step.motif });
    }
  });
  return { motifs: new Set(sightings.map((s) => s.motif)), sightings };
}
```

Only odd plies are collected (the side-to-move's own moves) — even plies
are the engine's intervening hypothetical reply, walked through only to
reach the next real position, never credited. Graceful degradation is
automatic: a missing/single-element `pvSan` produces exactly one step and
stops, identical to today's ply-1-only behavior. `scanTacticsForLines`
(Found/opportunities' underlying primitive) is **not** touched by this
phase — see Phase 48 for the one place it optionally gets an opt-in.

**Files:** `packages/chess-analysis/src/{prevention-scan-schedule,available-motifs-scan}.ts` (new) + tests, `src/index.ts`.

- [x] Schedule shape correct for `multiPv=5` and `multiPv=3`; never returns
      `<1` or `>PV_SCAN_MAX_DEPTH`.
- [x] `scanAvailableMotifs` parity with today's ply-1-only output when every
      line's `pvSan` is single-element; a synthetic fork-at-ply-3 fixture is
      picked up for a rank whose schedule depth ≥3 and missed for a
      lower-ranked line capped at depth 1; an even-ply-only motif is never
      included; empty `lines`/`pvSan` doesn't throw.
- [x] Commit: `feat: graduated per-line-rank ply schedule and scanAvailableMotifs primitive (Phase 45)`.

## Phase 46 — Redesign `findDefusedThreat` → `findDefusedThreats` (sound multi-ply comparison)

**Why the old ply-1 trick can't generalize:** it worked by re-classifying
the *identical* `line.moveSan` at both `beforeFen` and `afterFen` — valid
for one move, since a single SAN token can be meaningfully re-evaluated
against a shifted board. It cannot generalize to ply 3+: the PV's ply-2
move is the engine's own hypothetical reply to itself, not what actually
happened, so there is no real board that is simultaneously "the PV's own
continuation" and "the game's real continuation" to check a ply-3 move
against.

**New semantics — motif-type reachability sets, not move-identity replay:**
compute `scanAvailableMotifs` once at `beforeFen` with its own
genuinely-associated candidate lines, once at `afterFen` with an
independent, freshly-anchored candidate-line set. **A motif type present in
the before-set but absent from the after-set is "prevented."** Sound in the
same sense the ply-1 comparison was: never asserts a specific multi-move
combination "still works," only that a motif *type* is reachable or not,
independently recomputed at two real positions — matching
`TacticMotifCounts`' existing per-type-only granularity. Known, accepted
trade-offs to document in the code comment: (1) type-level comparison means
an unrelated new same-type motif appearing elsewhere reads as "not
prevented" — acceptable for a coarse dashboard tally; (2) even-ply moves are
the engine's guess, so a credited ply-3+ sighting is inherently less certain
than ply-1 — which is exactly why the schedule concentrates depth on the
top-ranked line, so cost control and confidence point the same direction.

```ts
export function findDefusedThreats(
  beforeFen: string,
  afterFen: string,
  opponent: 'white' | 'black',
  candidateLinesBefore: readonly EngineLine[],
  candidateLinesAfter: readonly EngineLine[]
): TacticMotifType[] {
  const before = scanAvailableMotifs(beforeFen, candidateLinesBefore);
  const after = scanAvailableMotifs(afterFen, candidateLinesAfter);
  return [...before.motifs].filter((motif) => !after.motifs.has(motif));
}
```

**Files:** `packages/chess-analysis/src/tactic-prevention-check.ts`, its test.

- [x] Rewrite fixtures for the new two-line-set signature; add a genuine
      multi-ply case (rook sac ply 1 → forced check ply-3-equivalent →
      fork at ply 3) proving a defused *deeper* tactic is now detected —
      impossible before this phase; keep a ply-1-parity case; a case where
      the after-set is a superset returns `[]`; a move defusing two
      distinct motif types returns both.
- [x] Commit: `feat: findDefusedThreats — sound motif-type-set comparison, multi-ply via the graduated schedule (Phase 46)`.

## Phase 47 — Rewire `apps/api`'s prevention service

**Free path — anchor "before" at `prior.fenBefore` (not flipped), not
`prior.fenAfter`-flipped as today.** Walking a PV against the exact FEN the
engine actually computed it for is strictly more sound than replaying it
against a one-ply-shifted position. Needs **no null-move flip on the free
path at all** — one fewer fragile operation than today. **Both branches —
anchor "after" at `move.fenAfter` using `evals[move.ply].lines`** (verified
this session: `evals[move.ply]` is always in-bounds and is exactly the eval
at `move.fenAfter`, opponent genuinely to move, no flip needed — free in
both branches). The gated branch's cost stays exactly one extra engine call
(only for its "before" probe).

```ts
function findFreelyDefusedThreats(prior: ClassifiedMoveDto, move: ClassifiedMoveDto, opponent: Colour, evals: EngineEval[]): TacticMotifType[] {
  const priorEval = evals[prior.ply - 1];
  const afterEval = evals[move.ply];
  if (!priorEval || !afterEval || !prior.fenBefore || !move.fenAfter) return [];
  return findDefusedThreats(prior.fenBefore, move.fenAfter, opponent, priorEval.lines, afterEval.lines);
}

async function findGatedDefusedThreats(engine: PositionAnalyzer, move: ClassifiedMoveDto, opponent: Colour, evals: EngineEval[]): Promise<TacticMotifType[]> {
  if (!move.isTacticalPosition) return [];
  const flipped = move.fenBefore && flipActiveColorFen(move.fenBefore);
  const afterEval = evals[move.ply];
  if (!flipped || !afterEval || !move.fenAfter) return [];
  const threatAnalysis = await engine.analyzePosition(flipped);
  return findDefusedThreats(flipped, move.fenAfter, opponent, threatAnalysis.lines as EngineLine[], afterEval.lines);
}
```

`computeTacticMotifPrevented`: increment counters for **every** motif in
the returned array (not just the first), preserving the existing cost gate
(`freely.length > 0 ? freely : await findGatedDefusedThreats(...)`).

**Files:** `apps/api/src/services/tactic-prevention.ts`, its test.

- [x] Update fixtures to set `prior.fenBefore` explicitly (now
      load-bearing) and add `evals[move.ply]` fixtures for the free
      after-eval.
- [x] Regression test: the gated branch still makes **exactly one**
      `analyzePosition` call, never more.
- [x] A case where one move defuses two distinct motif types increments
      both counters; ply-1-only fixtures (today's shape) still produce the
      same counts as before this phase.
- [x] Commit: `feat: wire graduated multi-ply prevention detection into the batch analysis job (Phase 47)`.

## Phase 48 — Live-coach opt-in graduated depth

`scan_tactics`/`position-tactics.ts`'s "available"/"allowed" checks use the
same ply-1-only `scanTacticsForLines` Found/opportunities do. Add an opt-in
mode, defaulting to today's exact behavior for every existing caller.

**Files:** `apps/api/src/services/position-tactics.ts`, its test,
`investigator-tools.ts` (switch the `scan_tactics` handler's internal call
once verified — no new tool parameter, the model doesn't need to choose
depth itself).

- [x] `scanPositionTactics` gains `options.mode?: 'shallow' | 'graduated'`,
      default `'shallow'` (today's `scanTacticsForLines` call, byte-for-byte
      unchanged). `'graduated'` calls `scanAvailableMotifs` for both
      `available` and `allowed`, adapting `sightings` into the existing
      `TacticSighting[]` shape.
- [x] `game-tactic-motifs.ts` (Played/Found) stays on `scanTacticsForLines`
      regardless of this phase.
- [x] Tests: `'shallow'` mode is byte-identical to pre-Phase-48 behavior
      (regression pin); `'graduated'` mode surfaces a ply-3+ sighting
      `'shallow'` misses on the same fixture; default (no `options.mode`)
      behaves as `'shallow'`.
- [x] Commit: `feat: scanPositionTactics graduated-depth opt-in; wire scan_tactics onto it (Phase 48)`.

## Phase 49 — Lichess eval index v3 (per-line multi-ply continuations)

Justified by the real 20,000-position sample above (46% multi-pv, 16.6%
full 5, ~10-ply depth whenever present) — comfortably enough to harvest the
schedule's 7-ply top-rank target. Sizing, from the real v2 format constants:
v2 slot = 9B/line, value = `2+5×9=47B`, record = `16+47=63B` (matches the
shipped file). v3 slot per rank = `4B header + scanDepthForRank(rank)×5B moveUci`:

| rank | schedule depth | v2 slot | v3 slot |
|---|---|---|---|
| 0 | 7 | 9B | 4+35=39B |
| 1 | 5 | 9B | 4+25=29B |
| 2 | 3 | 9B | 4+15=19B |
| 3 | 1 | 9B | 4+5=9B |
| 4 | 1 | 9B | 4+5=9B |

v3 value = `2+(39+29+19+9+9)=107B`, record = `16+107=123B` — ≈1.95x v2. At
the ~401M full-dataset target: v2 ≈25GB → **v3 ≈49GB**. User confirmed this
size is acceptable ("about the dataset size I am ok with dataset size").

**Files:** `packages/chess-analysis/src/lichess-eval-index-format.ts`,
`apps/api/scripts/build-lichess-eval-index.mjs`, `apps/api/src/services/
engine/{lichess-eval-index,lichess-eval-engine-backend}.ts`, `deploy/helm/
freechesscoach/values.yaml`, `apps/api/data/README.md` (all +tests).

- [x] Bump magic header to `LCEVAL03`; per-rank slot width driven by
      `scanDepthForRank(rank)` (still fixed-stride per file — binary search
      unaffected, just wider constants). Rewrite `packEntry`/`unpackRecord`.
      Version-detect so a stale v2 file degrades gracefully (mirroring the
      v1→v2 magic-header pattern) rather than crash-looping if code ships
      before the rebuilt file does.
- [x] `build-lichess-eval-index.mjs`'s `parseLichessEvalLine`: harvest up to
      `scanDepthForRank(rank)` UCI tokens from `pv.line` per line instead of
      always just the first; a short `pv.line` just yields fewer plies
      (rare per the sample — most present pvs are the full 10 plies).
- [x] `lichess-eval-index.ts` reader: unpack the variable-width per-rank
      slots.
- [x] `lichess-eval-engine-backend.ts`'s `toPositionAnalysis`: convert each
      harvested UCI continuation to a real multi-element `pvSan` via
      **Phase 42's `pvUciToSan`** (shared, not a bespoke conversion here).
- [x] `values.yaml`: `lichessEvalIndex.size` `30Gi` → `~64Gi`, size comment
      updated with this phase's math. `apps/api/data/README.md`: document
      the v3 bump, expected size, and rollout order (code-first is safe —
      the v3 reader soft-skips a still-present v2 file).
- [x] **Explicitly out of scope, same as v1→v2:** actually running
      `fetch-and-build-lichess-eval-index.sh` + `deploy-lichess-eval-index.sh`
      against the live cluster remains a manual, by-hand operation for later.
- [x] Tests: per-rank harvest depth + short-`pv.line` clamping;
      variable-slot pack/unpack round trip for 1/3/5/7-ply slots; a
      v2-shaped buffer is soft-skipped, not thrown; a v3 hit yields a
      genuine multi-move `pvSan`, a short-PV hit still behaves as a
      single-move line.
- [x] Commit: `feat: Lichess eval index v3 — per-line multi-ply continuations, graduated depth-matched (Phase 49)`.

## Verification (end of Phase 49, planned)

- [x] `npx tsc -b && npx eslint . && npx vitest run` across all workspaces,
      green — including the full pre-existing Phase 32-41 suite (regression
      pin for Played/Found, which Phases 42-49 must not change).
- [x] Phase 47's fixture set specifically re-proves: a ply-1-only defused
      tactic still counts identically; a genuinely deeper (ply 3+) defused
      tactic — impossible before this work — now counts; the gated branch
      still spends exactly one extra engine call per move, never more.
- [x] Phase 43: the real `continuationArr` sample produces a multi-move
      `pvSan`, verified end-to-end into `scanAvailableMotifs` picking up a
      deeper sighting.
- [x] Phase 49: a fixture-scale end-to-end build round-trips through
      `buildLichessEvalIndex` → `LichessEvalIndex.open` → `lookup`,
      returning every harvested ply per line; a v2-shaped fixture file is
      soft-skipped, not thrown.
- [ ] Manual, via `npm run dev`: analyze a game containing a real
      rook-sac-then-fork-style deferred tactic (3+ plies to land); confirm
      the Prevented tab now credits it; open a live-coach session on a
      position with the same shape and confirm `scan_tactics` flags it too.
- [ ] Separately, when ready to refresh production data: run
      `fetch-and-build-lichess-eval-index.sh`, confirm the built file starts
      with the `LCEVAL03` magic header and is roughly the ~49GB estimate,
      resize the PVC, then `deploy-lichess-eval-index.sh`.
