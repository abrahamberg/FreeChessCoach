import type { EngineLine, TacticMotifType } from '@freechesscoach/shared';
import { classifyCandidateMove } from './classify-candidate-move.js';

/**
 * Pure, engine-free check: does any of `candidateLines` describe a tactic
 * for `opponent` that's available at `beforeFen` but gone by `afterFen`?
 *
 * Both FENs must already have `opponent` as the side to move. `afterFen` is
 * typically the real position right after the other side's move — no
 * flipping needed, since it genuinely is `opponent`'s turn there.
 * `beforeFen` is usually a null-move-flipped position (see
 * `flipActiveColorFen` in null-move-fen.ts), since the real board at that
 * point has the OTHER side to move.
 *
 * Deliberately checks only each line's immediate move, not a multi-ply walk
 * via `annotatePvTactics`: a ply-3 combination's intermediate move is the
 * engine's own hypothetical choice, not necessarily what was actually
 * played in the game, so there is no sound way to ask "is this specific
 * 3-ply combination still available" against the single real continuation
 * that happened. Only "is the immediate move still on the board, and does
 * it still classify as the same motif" is a well-defined before/after
 * comparison — this is that comparison, run per candidate line.
 */
export function findDefusedThreat(
  beforeFen: string,
  afterFen: string,
  opponent: 'white' | 'black',
  candidateLines: readonly EngineLine[]
): TacticMotifType | null {
  for (const line of candidateLines) {
    const motifBefore = classifyCandidateMove(beforeFen, line.moveSan, opponent, {
      linesAtFenBefore: candidateLines as EngineLine[]
    });
    if (!motifBefore) continue;

    const motifAfter = classifyCandidateMove(afterFen, line.moveSan, opponent, {
      linesAtFenBefore: candidateLines as EngineLine[]
    });
    if (motifAfter !== motifBefore) return motifBefore;
  }
  return null;
}
