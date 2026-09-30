import { Chess } from 'chess.js';
import { sideNotToMoveInCheck } from './null-move-fen.js';

/** True when `fen` parses as a legal chess position: chess.js checks the
 * FEN's shape and piece counts, but loads a position whose side NOT to move
 * is in check, which Stockfish segfaults on, so that is checked here too.
 * Used by user-supplied-FEN entry points (the settings engine ping test, a
 * course's [FEN] header, the engine service) so garbage reaches a
 * validation error instead of the engine. */
export function isLegalFen(fen: string): boolean {
  try {
    new Chess(fen);
  } catch {
    return false;
  }
  return !sideNotToMoveInCheck(fen);
}
