import { Chess } from 'chess.js';

/** Resolves a SAN move's from/to squares by replaying it against `fen` —
 * needed because engine analysis stores a suggested move as SAN
 * (bestMoveSan/alternatives[].san), not UCI, so drawing it as a board arrow
 * means parsing it first. Returns null for an illegal/malformed SAN (a
 * mismatched fen, a corrupt analysis row) rather than throwing. */
export function sanToSquares(fen: string, san: string): { from: string; to: string } | null {
  try {
    const move = new Chess(fen).move(san);
    return move ? { from: move.from, to: move.to } : null;
  } catch {
    return null;
  }
}
