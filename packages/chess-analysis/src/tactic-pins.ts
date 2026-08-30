import type { Chess, PieceSymbol, Square } from 'chess.js';
import { opponentOf, occupiedSquares, type OccupiedSquare } from './attack-map.js';
import { PIECE_VALUES } from './tactics.js';

export interface PinHit {
  /** Square of the pinning sliding piece. */
  by: Square;
  /** Square of the pinned enemy piece (the first piece on the ray). */
  pinned: Square;
  /** Square of the king (absolute) or higher-value piece (relative) behind it. */
  against: Square;
  kind: 'absolute' | 'relative';
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
 * Every pin on the board: a sliding piece with an enemy piece on a ray, and
 * either the enemy king (absolute) or a higher-value enemy piece (relative)
 * directly behind it with nothing in between. Turn-independent — reports
 * pins for both colours' sliders regardless of whose move it is.
 */
export function pins(chess: Chess): PinHit[] {
  const hits: PinHit[] = [];
  for (const piece of occupiedSquares(chess)) {
    const directions = directionsFor(piece.type);
    if (directions.length === 0) continue;

    const opponent = opponentOf(piece.color);
    const [pinnerFile, pinnerRank] = squareCoords(piece.square);
    for (const [df, dr] of directions) {
      const hit = walkRay(chess, pinnerFile, pinnerRank, df, dr, opponent);
      if (hit) hits.push({ by: piece.square, pinned: hit.pinned, against: hit.against, kind: hit.kind });
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
): { pinned: Square; against: Square; kind: PinHit['kind'] } | null {
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
        if (occupant.type === 'k') return { pinned: first.square, against: square, kind: 'absolute' };
        if (PIECE_VALUES[occupant.type] > PIECE_VALUES[first.type]) {
          return { pinned: first.square, against: square, kind: 'relative' };
        }
        return null;
      }
    }
    file += df;
    rank += dr;
  }
}
