import type { EngineEval, EngineLine, OnlyMoves } from '@freechesscoach/shared';
import { CONFIG } from '../config.js';
import { moverMateIn } from '../mover-mate.js';
import { toCpWhite, winPctFor } from '../win-probability.js';

/** The engine's best, and clearly: `onlyMoveGap` ahead of the second, or a
 * mate where the second mates later or not at all. A slower mate is no
 * second answer: the smothered-mate run flagged every move of a mate in 4.
 * One rule for the course quiz and for the "only moves found" stat. */
export function isOnlyMove(evaluation: EngineEval | undefined, san: string, side: 'white' | 'black'): boolean {
  const [first, second] = evaluation?.lines ?? [];
  if (!first || !second || first.moveSan !== san) return false;
  const mates = moverMateIn(first, side);
  if (mates !== null) {
    const next = moverMateIn(second, side);
    return next === null || next > mates;
  }
  const moverCp = (line: EngineLine): number => (side === 'white' ? 1 : -1) * toCpWhite(line);
  return winPctFor(side, toCpWhite(first)) - winPctFor(side, toCpWhite(second)) > CONFIG.courses.onlyMoveGap || moverCp(first) - moverCp(second) >= CONFIG.courses.onlyMoveCpGap;
}

/** The side's positions with one clearly best move, and how many the side
 * found. `evals[i]` is the evaluation of position `i` (the one before ply
 * `i + 1`), as the game report indexes them. Positions without an engine
 * eval of two lines are not counted. */
export function countOnlyMoves(moves: readonly { ply: number; moveSan: string }[], evals: readonly EngineEval[], side: 'white' | 'black'): OnlyMoves {
  const counts = { positions: 0, found: 0 };
  for (const move of moves) {
    const evaluation = evals[move.ply - 1];
    const best = evaluation?.lines[0]?.moveSan;
    if (!best || !isOnlyMove(evaluation, best, side)) continue;
    counts.positions += 1;
    if (move.moveSan === best) counts.found += 1;
  }
  return counts;
}
