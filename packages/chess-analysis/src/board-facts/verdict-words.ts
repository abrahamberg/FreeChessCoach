import { Chess } from 'chess.js';
import type { EngineEval, EngineLine } from '@freechesscoach/shared';
import { cpToWords, mateToWords } from '../eval-words.js';
import { saidMateIn } from '../mate-count.js';

/** One engine line in words, never a score ("White is better", "Black has
 * a forced mate in 3"; "Black has a forced mate" when the search the line
 * is from, `searched`, cannot stand behind the count). Scores are
 * White-perspective. */
export function lineWords(line: Pick<EngineLine, 'cp' | 'mateIn'>, searched: Pick<EngineEval, 'fen' | 'depth'>): string {
  if (line.mateIn !== null) return mateToWords(line.mateIn, 'w', saidMateIn(line, searched) !== null);
  return cpToWords(line.cp ?? 0, 'w');
}

/** The position in words: the engine's top line, or the board state when
 * the game is over (a mated or stalemated position has no engine line). */
export function positionWords(fen: string, evaluation: EngineEval | undefined): string {
  const chess = new Chess(fen);
  if (chess.isCheckmate()) return 'checkmate';
  if (chess.isStalemate()) return 'stalemate';
  const top = evaluation?.lines[0];
  return top && evaluation ? lineWords(top, evaluation) : 'no engine verdict';
}
