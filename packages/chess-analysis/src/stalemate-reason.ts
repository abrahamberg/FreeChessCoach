import { Chess } from 'chess.js';
import type { EngineEval } from '@freechesscoach/shared';
import { resultBand } from './classify-severity.js';
import { toCpWhite, winPctFor } from './win-probability.js';

/**
 * A move that stalemates ends the game, and that is the whole note. 36…axb5
 * stalemated a king Black was a queen's worth ahead of and read "Creates a
 * passed pawn on b / Creates a passed pawn on c".
 */
export function stalemateReason(fenAfter: string, mover: 'white' | 'black', evalBefore: EngineEval): string | null {
  if (!new Chess(fenAfter).isStalemate()) return null;
  const stuck = mover === 'white' ? 'Black' : 'White';
  const best = evalBefore.lines[0];
  const wasWinning = best !== undefined && resultBand(winPctFor(mover, toCpWhite({ cp: best.cp, mateIn: best.mateIn }))) === 'winning';
  return `Stalemate: ${stuck} has no legal move, so the game is a draw${wasWinning ? ', and the won game is thrown away' : ''}`;
}
