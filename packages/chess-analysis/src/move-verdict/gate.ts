import type { EngineLine } from '@freechesscoach/shared';
import { evalGap } from '../eval-witness.js';
import { toCpWhite, type PlayerColor } from '../win-probability.js';
import { worseFor } from './eval-pair.js';
import type { MoveVerdictInput, VerdictKind } from './types.js';

/**
 * Step 1 of `docs/plan.md` Task 77.5, read off the stored evals alone. All
 * evals are White-perspective:
 * - B (`best`): the best line's cp — `cpBefore`;
 * - P (`played`): the played move's cp — `cpAfter`;
 * - S (`second`): the best line other than the first and the move played.
 */
export interface VerdictFrame {
  branch: VerdictKind;
  mover: PlayerColor;
  fenBefore: string;
  best: number;
  played: number;
  second: number | null;
  /** The worst line the engine listed — the lowest R can be. */
  lowest: number;
  bestLine: EngineLine;
  afterLine: EngineLine | undefined;
  /** The played move itself mates. The position after it has no engine
   * lines, so P is the mate itself, not the stored `cpAfter` (0). */
  playedMates: boolean;
}

/**
 * The free gate. A meaningful played-move gap is a failure; otherwise a
 * move that mattered (the second line is meaningfully worse than the first)
 * is a credit; otherwise nothing — and no detector runs.
 */
export function frameVerdict(input: MoveVerdictInput): VerdictFrame | null {
  const { move, evals } = input;
  const lines = evals[move.ply - 1]?.lines ?? [];
  const bestLine = lines[0];
  const afterLine = evals[move.ply]?.lines[0];
  if (!bestLine || !move.fenBefore) return null;

  const best = move.cpBefore ?? toCpWhite(bestLine);
  // Same rule as `classify.ts`'s `deliveredMate`: a mate has no eval after it.
  const playedMates = move.moveSan.endsWith('#');
  const played = playedMates ? matedFor(move.mover) : (move.cpAfter ?? (afterLine ? toCpWhite(afterLine) : undefined));
  if (played === undefined) return null;

  const others = lines.slice(1);
  const secondLine = others.find((line) => line.moveSan !== move.moveSan);
  const second = secondLine ? toCpWhite(secondLine) : null;
  const lowest = others.map(toCpWhite).reduce((low, cp) => worseFor(move.mover, low, cp), best);
  const frame = { mover: move.mover, fenBefore: move.fenBefore, best, played, second, lowest, bestLine, afterLine, playedMates };

  const branch = branchOf(best, played, second, move.mover);
  return branch ? { ...frame, branch } : null;
}

/** White-perspective cp of the mover having just mated: mate in 0. */
function matedFor(mover: PlayerColor): number {
  return toCpWhite({ cp: null, mateIn: mover === 'white' ? 1 : -1 });
}

function branchOf(best: number, played: number, second: number | null, mover: PlayerColor): VerdictKind | null {
  if (evalGap(best, played, mover).meaningful) return 'failure';
  // The played move sits at or near B (the gap above wasn't meaningful), so
  // it mattered exactly when the ordinary alternative was meaningfully worse.
  return second !== null && evalGap(best, second, mover).meaningful ? 'credit' : null;
}
