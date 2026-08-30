import { findDefusedThreat, flipActiveColorFen } from '@freechesscoach/chess-analysis';
import type { ClassifiedMoveDto, EngineEval, EngineLine, TacticMotifType } from '@freechesscoach/shared';
import type { EngineBackend } from './engine/engine-backend.js';

type PositionAnalyzer = Pick<EngineBackend, 'analyzePosition'>;
type Colour = 'white' | 'black';

/**
 * Per-game "tactics prevented" tally: for each move, checks whether it
 * defused a tactical opportunity the opponent had lurking from their own
 * last turn. Cost-gated by design (direct user instruction — see the plan):
 *
 * - **Free path (always tried first)**: reuses the opponent's own already-
 *   computed analysis from their last actual turn (`evals[prior.ply - 1]`,
 *   the same top-N lines `computeTacticMotifCounts` already reads) — "we
 *   already analysed the opponent's tactics from their top X moves, we
 *   already know what they had." Zero extra engine calls.
 * - **Gated fallback (only when the free path finds nothing AND the
 *   position is already flagged tactically sharp)**: one extra null-move
 *   engine call, mirroring `position-tactics.ts`'s `scanPositionTactics`
 *   "allowed" half — reused here from a different call site (batch, not
 *   live coach).
 *
 * `findDefusedThreat`'s `beforeFen` always needs `opponent` to be the real
 * side to move — the actual board at that point has the mover to move, so
 * it's null-move-flipped; `afterFen` is always the real position after the
 * mover's move, where it genuinely is the opponent's turn, so it's used
 * as-is, no flip.
 */
export async function computeTacticMotifPrevented(
  engine: PositionAnalyzer,
  allMoves: ClassifiedMoveDto[],
  evals: EngineEval[]
): Promise<Record<Colour, Partial<Record<TacticMotifType, number>>>> {
  const counts: Record<Colour, Partial<Record<TacticMotifType, number>>> = { white: {}, black: {} };
  const movesByPly = new Map(allMoves.map((move) => [move.ply, move]));

  for (const move of allMoves) {
    const prior = movesByPly.get(move.ply - 1);
    if (!prior || prior.mover === move.mover) continue;
    if (!prior.fenAfter || !move.fenAfter || !move.fenBefore) continue;

    const opponent = prior.mover;
    const motif = findFreelyDefusedThreat(prior, move, opponent, evals) ?? (await findGatedDefusedThreat(engine, move, opponent));

    if (motif) counts[move.mover][motif] = (counts[move.mover][motif] ?? 0) + 1;
  }

  return counts;
}

function findFreelyDefusedThreat(
  prior: ClassifiedMoveDto,
  move: ClassifiedMoveDto,
  opponent: Colour,
  evals: EngineEval[]
): TacticMotifType | null {
  const priorEval = evals[prior.ply - 1];
  if (!priorEval) return null;

  const beforeFlipped = flipActiveColorFen(prior.fenAfter!);
  if (!beforeFlipped) return null;

  return findDefusedThreat(beforeFlipped, move.fenAfter!, opponent, priorEval.lines);
}

async function findGatedDefusedThreat(engine: PositionAnalyzer, move: ClassifiedMoveDto, opponent: Colour): Promise<TacticMotifType | null> {
  if (!move.isTacticalPosition) return null;

  const flipped = flipActiveColorFen(move.fenBefore!);
  if (!flipped) return null;

  const threatAnalysis = await engine.analyzePosition(flipped);
  return findDefusedThreat(flipped, move.fenAfter!, opponent, threatAnalysis.lines as EngineLine[]);
}
