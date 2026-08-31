import {
  BEST_OR_BETTER,
  describeTacticHit,
  flipActiveColorFen,
  scanThreatOutcome,
  type PvMotifSighting,
  type ThreatOutcome
} from '@freechesscoach/chess-analysis';
import { TACTIC_MOTIF_TYPES, type ClassifiedMoveDto, type EngineEval, type EngineLine, type TacticMotifType } from '@freechesscoach/shared';
import type { EngineBackend } from './engine/engine-backend.js';

type PositionAnalyzer = Pick<EngineBackend, 'analyzePosition'>;
type Colour = 'white' | 'black';

export interface TacticPreventionCounts {
  preventable: Partial<Record<TacticMotifType, number>>;
  prevented: Partial<Record<TacticMotifType, number>>;
}

export interface TacticMotifPreventionResult {
  counts: Record<Colour, TacticPreventionCounts>;
  /** One entry per ply whose move faced a reachable opponent tactic — the
   * move-list UI's per-ply "prevented" indicator. When more than one motif
   * type was reachable, names only the highest-priority one (TACTIC_MOTIF_TYPES
   * order, which mirrors tactic-detectors/registry.ts's precedence) — `counts`
   * above remains the source of truth for "how many", this is only "what to
   * show on this one move". */
  byPly: Map<number, { type: TacticMotifType; prevented: boolean; detail: string | null }>;
}

/** The earliest-priority motif in `types` (TACTIC_MOTIF_TYPES order), or null
 * when `types` is empty. */
function primaryMotif(types: readonly TacticMotifType[]): TacticMotifType | null {
  return TACTIC_MOTIF_TYPES.find((type) => types.includes(type)) ?? null;
}

/** The concrete piece/square behind `type`'s reachability, from whichever
 * `sightings` entry first matches it — `sightings` carries the exact
 * `{fenBefore, moveSan}` the scan actually saw the motif in, so this can
 * replay and describe it rather than showing the bare type name alone. */
function describeMotifSighting(sightings: readonly PvMotifSighting[], type: TacticMotifType, opponent: Colour): string | null {
  const sighting = sightings.find((s) => s.motif === type);
  if (!sighting) return null;
  return describeTacticHit(type, sighting.fenBefore, sighting.moveSan, opponent);
}

/**
 * Per-game "tactics prevented" tally: for each move, checks which of the
 * opponent's tactic motif types were reachable right before their own last
 * turn and are no longer reachable right after the mover's reply — see
 * `findDefusedThreats`' doc comment (Phase 46) for the type-level
 * reachability semantics this now rests on. Cost-gated by design (direct
 * user instruction — see the plan):
 *
 * - **Free path (always tried first)**: reuses each side's own
 *   already-computed batch eval — `evals[prior.ply - 1]` (exactly the eval
 *   at `prior.fenBefore`, genuinely opponent's turn there, no flip needed)
 *   and `evals[move.ply]` (exactly the eval at `move.fenAfter`, genuinely
 *   opponent's turn there too) — both real positions the engine actually
 *   analyzed, not one-ply-shifted/flipped stand-ins (Phase 47). Zero extra
 *   engine calls.
 * - **Gated fallback (only when the free path finds nothing AND the
 *   position is already flagged tactically sharp)**: one extra null-move
 *   engine call for the "before" probe only, mirroring
 *   `position-tactics.ts`'s `scanPositionTactics` "allowed" half — reused
 *   here from a different call site (batch, not live coach). The "after"
 *   side of the gated branch is free either way (`evals[move.ply]`).
 *
 * A move already classified best-or-better (`BEST_OR_BETTER`) is skipped
 * entirely, crediting neither `preventable` nor `prevented` for it: a threat
 * still reachable after the engine's own top choice isn't something this
 * player should have prevented at this moment — there was no better reply,
 * so it was never truly "preventable" for them here. Only a move that could
 * plausibly have done better (excellent and below) has its move-quality-vs-
 * threat comparison counted at all.
 */
export async function computeTacticMotifPrevented(
  engine: PositionAnalyzer,
  allMoves: ClassifiedMoveDto[],
  evals: EngineEval[]
): Promise<TacticMotifPreventionResult> {
  const counts: Record<Colour, TacticPreventionCounts> = {
    white: { preventable: {}, prevented: {} },
    black: { preventable: {}, prevented: {} }
  };
  const byPly = new Map<number, { type: TacticMotifType; prevented: boolean; detail: string | null }>();
  const movesByPly = new Map(allMoves.map((move) => [move.ply, move]));

  for (const move of allMoves) {
    const prior = movesByPly.get(move.ply - 1);
    if (!prior || prior.mover === move.mover) continue;
    // Best-or-better: no better reply existed, so nothing here was truly
    // preventable for this player — see this function's own doc comment.
    if (BEST_OR_BETTER.has(move.quality)) continue;

    const opponent = prior.mover;
    const freely = findFreelyDefusedThreats(prior, move, opponent, evals);
    const outcome = freely.preventable.length > 0 ? freely : await findGatedDefusedThreats(engine, move, opponent, evals);

    for (const motif of outcome.preventable) {
      counts[move.mover].preventable[motif] = (counts[move.mover].preventable[motif] ?? 0) + 1;
    }
    for (const motif of outcome.defused) {
      counts[move.mover].prevented[motif] = (counts[move.mover].prevented[motif] ?? 0) + 1;
    }

    const primary = primaryMotif(outcome.preventable);
    if (primary) {
      byPly.set(move.ply, {
        type: primary,
        prevented: outcome.defused.includes(primary),
        detail: describeMotifSighting(outcome.sightings, primary, opponent)
      });
    }
  }

  return { counts, byPly };
}

const EMPTY_OUTCOME: ThreatOutcome = { preventable: [], defused: [], sightings: [] };

function findFreelyDefusedThreats(
  prior: ClassifiedMoveDto,
  move: ClassifiedMoveDto,
  opponent: Colour,
  evals: EngineEval[]
): ThreatOutcome {
  const priorEval = evals[prior.ply - 1];
  const afterEval = evals[move.ply];
  if (!priorEval || !afterEval || !prior.fenBefore || !move.fenAfter) return EMPTY_OUTCOME;

  return scanThreatOutcome(prior.fenBefore, move.fenAfter, opponent, priorEval.lines, afterEval.lines);
}

async function findGatedDefusedThreats(
  engine: PositionAnalyzer,
  move: ClassifiedMoveDto,
  opponent: Colour,
  evals: EngineEval[]
): Promise<ThreatOutcome> {
  if (!move.isTacticalPosition) return EMPTY_OUTCOME;

  const flipped = move.fenBefore && flipActiveColorFen(move.fenBefore);
  const afterEval = evals[move.ply];
  if (!flipped || !afterEval || !move.fenAfter) return EMPTY_OUTCOME;

  const threatAnalysis = await engine.analyzePosition(flipped);
  return scanThreatOutcome(flipped, move.fenAfter, opponent, threatAnalysis.lines as EngineLine[], afterEval.lines);
}
