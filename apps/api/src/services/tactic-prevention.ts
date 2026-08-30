import { flipActiveColorFen, scanThreatOutcome, type ThreatOutcome } from '@freechesscoach/chess-analysis';
import type { ClassifiedMoveDto, EngineEval, EngineLine, TacticMotifType } from '@freechesscoach/shared';
import type { EngineBackend } from './engine/engine-backend.js';

type PositionAnalyzer = Pick<EngineBackend, 'analyzePosition'>;
type Colour = 'white' | 'black';

export interface TacticPreventionCounts {
  preventable: Partial<Record<TacticMotifType, number>>;
  prevented: Partial<Record<TacticMotifType, number>>;
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
 */
export async function computeTacticMotifPrevented(
  engine: PositionAnalyzer,
  allMoves: ClassifiedMoveDto[],
  evals: EngineEval[]
): Promise<Record<Colour, TacticPreventionCounts>> {
  const counts: Record<Colour, TacticPreventionCounts> = {
    white: { preventable: {}, prevented: {} },
    black: { preventable: {}, prevented: {} }
  };
  const movesByPly = new Map(allMoves.map((move) => [move.ply, move]));

  for (const move of allMoves) {
    const prior = movesByPly.get(move.ply - 1);
    if (!prior || prior.mover === move.mover) continue;

    const opponent = prior.mover;
    const freely = findFreelyDefusedThreats(prior, move, opponent, evals);
    const outcome = freely.preventable.length > 0 ? freely : await findGatedDefusedThreats(engine, move, opponent, evals);

    for (const motif of outcome.preventable) {
      counts[move.mover].preventable[motif] = (counts[move.mover].preventable[motif] ?? 0) + 1;
    }
    for (const motif of outcome.defused) {
      counts[move.mover].prevented[motif] = (counts[move.mover].prevented[motif] ?? 0) + 1;
    }
  }

  return counts;
}

const EMPTY_OUTCOME = { preventable: [], defused: [] };

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
