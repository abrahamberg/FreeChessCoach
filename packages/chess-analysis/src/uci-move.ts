import { Chess } from 'chess.js';

/**
 * Some UCI sources (confirmed in Lichess's own eval dataset — see
 * lichess-eval-index-format.ts) encode castling as the king "capturing" its
 * own rook (e1h1/e1a1/e8h8/e8a8, the Chess960 UCI convention) rather than the
 * king's actual destination square (e1g1/e1c1/e8g8/e8c8). A king can never
 * legally capture its own rook in standard chess, so this remap is always
 * safe and never masks a real illegal move.
 */
const CASTLING_UCI_REMAP: Record<string, string> = {
  e1h1: 'e1g1',
  e1a1: 'e1c1',
  e8h8: 'e8g8',
  e8a8: 'e8c8'
};

/**
 * Converts a UCI move (e.g. "e2e4", "e7e8q") played from `fen` into its SAN
 * representation. Throws if the move is illegal in that position — callers
 * own data they already trust to be legal (an engine's own output, a
 * pre-validated index record), unlike resolveSanMove's free-text LLM input.
 */
export function uciToSan(fen: string, moveUci: string): string {
  const chess = new Chess(fen);
  const normalized = CASTLING_UCI_REMAP[moveUci.slice(0, 4)] ?? moveUci;
  const from = normalized.slice(0, 2);
  const to = normalized.slice(2, 4);
  const promotion = normalized.length > 4 ? normalized.slice(4) : undefined;
  const move = chess.move({ from, to, promotion });
  return move.san;
}
