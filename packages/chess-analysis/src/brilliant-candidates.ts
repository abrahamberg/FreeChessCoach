import type { EngineEval } from '@freechesscoach/shared';
import { isBrilliantSoundnessCandidate } from './classify-brilliant.js';
import { moveDrop } from './move-metrics.js';
import { moveFlags } from './move-flags.js';
import { inBookWalk } from './opening-book.js';
import type { ParsedGame } from './pgn.js';

/**
 * The positions whose move is a Brilliant candidate (B1/B2/B5, the same cheap
 * gate as the B6 soundness check), as indexes into `game.positions` and
 * `evals`: the position each candidate was played from. B7 looks for a
 * non-sacrificial alternative among every engine line there, so game review
 * searches these few positions (0-2 a game) wider than the rest.
 */
export function brilliantCandidatePositions(game: ParsedGame, evals: readonly EngineEval[]): number[] {
  const bookWalk = inBookWalk(game.positions);
  return game.positions.slice(1).flatMap((position, index) => {
    const before = game.positions[index];
    if (!before || !position.moveSan) return [];
    const mover = position.mover ?? 'white';
    const flags = moveFlags(before.fen, position.moveSan);
    const isCandidate = isBrilliantSoundnessCandidate({
      fenBefore: before.fen,
      fenAfter: position.fen,
      moveSan: position.moveSan,
      mover,
      isBookMove: bookWalk[index]?.classification === 'book',
      legalMoveCount: flags.legalMoveCount,
      isCapture: flags.isCapture,
      drop: moveDrop(evals[index], evals[index + 1], mover, position.moveSan)
    });
    return isCandidate ? [index] : [];
  });
}
