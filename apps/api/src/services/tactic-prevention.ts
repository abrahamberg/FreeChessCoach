import type { PreventionScans } from '@freechesscoach/chess-analysis';
import type { ClassifiedMoveDto, EngineEval } from '@freechesscoach/shared';
import { cachedRealisticScan, type RealisticScanCache } from './tactic-prevention-scans.js';

/** Called once per PV scan that actually runs (a cache miss) — how the
 * benchmark counts the scans the lazy path saved. */
export type OnPreventionScan = (evalIndex: number) => void;

/**
 * The prevention scans behind the `defusedThreat` verdict, built lazily
 * (`docs/plan.md` Task 77.5). Nothing is scanned here: the returned function
 * scans a move's two positions the first time a verdict asks for them, and
 * `decideMoveVerdict` asks only when `defusedThreat` is still a candidate
 * after the stronger reasons were checked. This replaces
 * `computeTacticMotifPrevented`, which scanned both positions of every move
 * up front; its counts now come from the verdicts
 * (`computeTacticPreventionCounts`) and its `diagnosticByPly` from the
 * verdict's diagnostic code (`build-diagnostics.ts`).
 *
 * For a move and the opponent's move before it (`prior`), the two scans are
 * each side's own batch eval — both real positions with the opponent to
 * move, zero engine calls:
 * - before: `evals[prior.ply - 1]` at `prior.fenBefore`;
 * - after: `evals[move.ply]` at `move.fenAfter`.
 *
 * Each is `scanRealisticThreats`' (only threats that win material or mate,
 * on a line the opponent would play), cached by eval index: ply p's
 * "before" is ply (p-2)'s "after". `null` for the first move, a move whose
 * prior is missing or the same colour, or a missing eval.
 */
export function createPreventionScans(
  allMoves: readonly ClassifiedMoveDto[],
  evals: readonly EngineEval[],
  onScan?: OnPreventionScan
): (move: ClassifiedMoveDto) => PreventionScans | null {
  const movesByPly = new Map(allMoves.map((move) => [move.ply, move]));
  const cache: RealisticScanCache = new Map();

  return (move) => {
    const prior = movesByPly.get(move.ply - 1);
    if (!prior || prior.mover === move.mover) return null;

    const priorIndex = prior.ply - 1;
    const afterIndex = move.ply;
    const priorEval = evals[priorIndex];
    const afterEval = evals[afterIndex];
    if (!priorEval || !afterEval || !prior.fenBefore || !move.fenAfter) return null;

    return {
      before: cachedRealisticScan(cache, priorIndex, prior.fenBefore, priorEval.lines, onScan),
      after: cachedRealisticScan(cache, afterIndex, move.fenAfter, afterEval.lines, onScan)
    };
  };
}
