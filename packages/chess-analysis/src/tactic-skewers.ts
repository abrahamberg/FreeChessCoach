import type { Chess, PieceSymbol, Square } from 'chess.js';
import { opponentOf, occupiedSquares, type OccupiedSquare } from './attack-map.js';
import { PIECE_VALUES } from './tactics.js';

export interface SkewerHit {
  /** Square of the skewering sliding piece. */
  by: Square;
  /** Square of the higher-value (or king) piece in front, forced to move. */
  front: Square;
  /** Square of the lower-value enemy piece behind it, exposed once `front` moves. */
  behind: Square;
}

const BISHOP_DIRECTIONS: readonly [number, number][] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ROOK_DIRECTIONS: readonly [number, number][] = [[0, 1], [0, -1], [1, 0], [-1, 0]];

function directionsFor(piece: PieceSymbol): readonly [number, number][] {
  if (piece === 'b') return BISHOP_DIRECTIONS;
  if (piece === 'r') return ROOK_DIRECTIONS;
  if (piece === 'q') return [...BISHOP_DIRECTIONS, ...ROOK_DIRECTIONS];
  return [];
}

function squareCoords(square: Square): [file: number, rank: number] {
  return [square.charCodeAt(0) - 97, Number(square[1]) - 1];
}

function toSquare(file: number, rank: number): Square | null {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return (String.fromCharCode(97 + file) + String(rank + 1)) as Square;
}

/**
 * Every skewer on the board — a pin's mirror image: a sliding piece attacks
 * through an enemy king or higher-value piece to a lower-value enemy piece
 * directly behind it with nothing in between, so moving (or being forced to
 * move) the front piece exposes the one behind to capture. Turn-independent,
 * same convention as `pins()`.
 */
export function skewers(chess: Chess): SkewerHit[] {
  const hits: SkewerHit[] = [];
  for (const piece of occupiedSquares(chess)) {
    const directions = directionsFor(piece.type);
    if (directions.length === 0) continue;

    const opponent = opponentOf(piece.color);
    const [pinnerFile, pinnerRank] = squareCoords(piece.square);
    for (const [df, dr] of directions) {
      const hit = walkRay(chess, pinnerFile, pinnerRank, df, dr, opponent);
      if (hit) hits.push({ by: piece.square, front: hit.front, behind: hit.behind });
    }
  }
  return hits;
}

function walkRay(
  chess: Chess,
  startFile: number,
  startRank: number,
  df: number,
  dr: number,
  opponent: OccupiedSquare['color']
): { front: Square; behind: Square } | null {
  let first: OccupiedSquare | null = null;
  let file = startFile + df;
  let rank = startRank + dr;

  while (true) {
    const square = toSquare(file, rank);
    if (!square) return null;
    const occupant = chess.get(square);
    if (occupant) {
      if (!first) {
        if (occupant.color !== opponent) return null;
        first = { square, type: occupant.type, color: occupant.color };
      } else {
        if (occupant.color !== opponent) return null;
        // A king behind the front piece is a pin (see tactic-pins.ts), not a skewer — the
        // 0 placeholder in PIECE_VALUES is only sound as a lower bound, never an upper one.
        if (occupant.type === 'k') return null;
        const frontIsMoreValuable = first.type === 'k' || PIECE_VALUES[first.type] > PIECE_VALUES[occupant.type];
        if (frontIsMoreValuable) return { front: first.square, behind: square };
        return null;
      }
    }
    file += df;
    rank += dr;
  }
}
