import { Chess } from 'chess.js';

/** True when `fen` parses as a legal chess position (chess.js validates both
 * the FEN's shape and the position's legality — piece counts, king safety).
 * Used by user-supplied-FEN entry points (e.g. the settings engine ping
 * test) so garbage reaches a validation error instead of the engine. */
export function isLegalFen(fen: string): boolean {
  try {
    new Chess(fen);
    return true;
  } catch {
    return false;
  }
}
