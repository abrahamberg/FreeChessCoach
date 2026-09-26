import { Chess } from 'chess.js';

function otherSideToMove(fen: string): string {
  const fields = fen.split(' ');
  fields[1] = fields[1] === 'w' ? 'b' : 'w';
  // The en-passant square only belongs to the real side to move.
  if (fields.length > 3) fields[3] = '-';
  return fields.join(' ');
}

function tryMoveSan(fen: string, from: string, to: string): string | null {
  try {
    return new Chess(fen).move({ from, to, promotion: 'q' }).san;
  } catch {
    return null;
  }
}

/**
 * The SAN for an arrow drawn from `from` to `to` on `fen` — "Qe3+" rather
 * than "e2→e3" — or null when no piece can make that move. Tries the side to
 * move first, then the other side, since a student often draws the opponent's
 * threat. A pawn reaching the last rank is read as promoting to a queen.
 */
export function arrowMoveSan(fen: string, from: string, to: string): string | null {
  return tryMoveSan(fen, from, to) ?? tryMoveSan(otherSideToMove(fen), from, to);
}
