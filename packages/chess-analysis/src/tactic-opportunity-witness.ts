import type { ClassifiedMoveDto, EngineLine, TacticMotifType } from '@freechesscoach/shared';
import { classifyTacticMotif } from './classify-tactic-motif.js';
import { evalGap, playedMoveGap } from './eval-witness.js';
import { moveFlags } from './move-flags.js';
import { toCpWhite } from './win-probability.js';

export type WitnessedMove = Pick<ClassifiedMoveDto, 'fenBefore' | 'mover' | 'cpBefore' | 'cpAfter' | 'isTacticalPosition'>;

/**
 * The eval witness on an opportunity (`docs/plan.md` Task 76.5): the
 * engine's best move carrying a motif makes a ply a chance only when the
 * motif decided something. When the first engine line with a different
 * headline evaluates about as well, the tactic won nothing the position
 * didn't already offer, and "you missed a fork" would be a false sentence.
 *
 * Static and cheap on purpose: `quality: 'best'`, no `pvSan`, and it stops at
 * the first line whose headline differs. A single line, or every line sharing
 * the headline, keeps the opportunity — there is nothing to compare against.
 * Legacy moves (no `cpBefore`/`cpAfter`) skip the gate.
 */
export function isTacticImmaterial(
  move: WitnessedMove,
  lines: readonly EngineLine[],
  bestHeadline: TacticMotifType
): boolean {
  if (!hasStoredEvals(move) || !move.fenBefore) return false;
  const [best, ...rest] = lines;
  if (!best) return false;

  const reference = firstLineWithOtherHeadline(move, move.fenBefore, rest, bestHeadline);
  return reference !== null && !evalGap(toCpWhite(best), toCpWhite(reference), move.mover).meaningful;
}

/**
 * "Missed" needs the played move to have cost something: an unfound motif on
 * a move that kept the value is not a miss, and not a find either. `null`
 * gap (a legacy move) keeps today's verdict.
 */
export function isFalseMiss(move: Pick<ClassifiedMoveDto, 'cpBefore' | 'cpAfter' | 'mover'>, found: boolean): boolean {
  if (found) return false;
  const gap = playedMoveGap(move);
  return gap !== null && !gap.meaningful;
}

/** Whether `moveSan` mates from `fenBefore`; `null` when it can't be replayed. */
export function checkmateFlag(fenBefore: string, moveSan: string): boolean | null {
  try {
    return moveFlags(fenBefore, moveSan).isCheckmate;
  } catch {
    return null;
  }
}

function hasStoredEvals(move: Pick<ClassifiedMoveDto, 'cpBefore' | 'cpAfter'>): boolean {
  return move.cpBefore !== undefined && move.cpAfter !== undefined;
}

/** Line R of `docs/plan.md` Task 77.5: the first of `lines` whose headline
 * differs from `bestHeadline`. Exported for `move-verdict/`. */
export function firstLineWithOtherHeadline(
  move: WitnessedMove,
  fenBefore: string,
  lines: readonly EngineLine[],
  bestHeadline: TacticMotifType
): EngineLine | null {
  for (const line of lines) {
    const isCheckmate = checkmateFlag(fenBefore, line.moveSan);
    if (isCheckmate === null) continue;
    const headline = classifyTacticMotif({
      fenBefore,
      moveSan: line.moveSan,
      mover: move.mover,
      quality: 'best',
      isCheckmate,
      isTacticalPosition: move.isTacticalPosition === true
    });
    if (headline !== bestHeadline) return line;
  }
  return null;
}
