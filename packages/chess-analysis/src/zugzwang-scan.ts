import type { EngineEval } from '@freechesscoach/shared';
import { loosePieces } from './board-facts/loose-pieces.js';
import { CONFIG } from './config.js';
import type { PassEvals, PassScanPly, PassScanWant } from './pass-scan.js';
import { passEvalOf } from './pass-scan.js';
import { toCpWhite, winPctFor, type PlayerColor } from './win-probability.js';

const { maxLegalMoves: MAX_LEGAL_MOVES, minWinPctGap: MIN_WIN_PCT_GAP } = CONFIG.zugzwang;

/** A position worth the pass scan for zugzwang: the move was quiet (no
 * capture, promotion or check), the side to move has few legal moves, and none
 * of its pieces is loose. Measured on Lichess puzzles this lets through about
 * 6% of plies and nearly all the tagged zugzwangs; without the quiet and loose
 * gates the eval alone fires on any lost position. (The side to move being in
 * check is already out: that position cannot be flipped.) */
export const zugzwangWant: PassScanWant = {
  id: 'zugzwang',
  wants: ({ move, after, fenAfter }: PassScanPly) => {
    if (move.captured || move.promotion || after.isCheck() || after.isGameOver()) return false;
    if (after.moves().length > MAX_LEGAL_MOVES) return false;
    return loosePieces(fenAfter, after.turn()).length === 0;
  }
};

/** The side to move after `fenAfter` is in zugzwang: its own eval is worse
 * than `minWinPctGap` below what the same position is worth if it could pass.
 * Both evals are White-perspective, so the pass position needs no sign flip. */
export function inZugzwang(fenAfter: string, actual: EngineEval | undefined, passEvals: PassEvals): boolean {
  const pass = passEvalOf(fenAfter, passEvals);
  const actualLine = actual?.lines[0];
  const passLine = pass?.lines[0];
  if (!actualLine || !passLine) return false;
  const sideToMove: PlayerColor = fenAfter.split(' ')[1] === 'w' ? 'white' : 'black';
  return winPctFor(sideToMove, toCpWhite(passLine)) - winPctFor(sideToMove, toCpWhite(actualLine)) > MIN_WIN_PCT_GAP;
}
