import { Chess } from 'chess.js';

/**
 * Flips a FEN's active-color field — the standard "null move" trick for
 * asking "what could the side NOT to move do here" without an engine
 * feature for it. En-passant rights are cleared (a null move forfeits them,
 * same as a real one always resets them for the other side); halfmove/
 * fullmove counters are left untouched (this position is never actually
 * played out, so the clocks aren't meaningful here regardless).
 *
 * Returns `null` when the original position has the side to move in check
 * — passing is illegal there, and there's no sound "what if you did
 * nothing" question to ask. This guard is load-bearing, not defensive
 * boilerplate: chess.js does NOT throw when loading a FEN whose
 * side-NOT-to-move is in check (verified directly — it loads cleanly and
 * even reports a legal capture of that king), so a bare try/catch around
 * `new Chess(candidate)` alone would silently accept an illegal null-move
 * position instead of catching it.
 */
export function flipActiveColorFen(fen: string): string | null {
  if (new Chess(fen).inCheck()) return null;

  const [placement, active, castling, , halfmove, fullmove] = fen.trim().split(/\s+/);
  const candidate = [placement, active === 'w' ? 'b' : 'w', castling, '-', halfmove, fullmove].join(' ');

  try {
    new Chess(candidate);
    return candidate;
  } catch {
    return null;
  }
}
