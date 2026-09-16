import type { Chess, PieceSymbol, Square } from 'chess.js';

const BISHOP_DIRECTIONS: readonly [number, number][] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ROOK_DIRECTIONS: readonly [number, number][] = [[0, 1], [0, -1], [1, 0], [-1, 0]];

export interface Ray {
  direction: [number, number];
  /** The occupied squares along the ray, nearest first — at most the two the
   * x-ray/battery motifs care about. */
  occupants: Square[];
}

/**
 * The first two occupied squares along each of a slider's own directions.
 *
 * `tactic-pins.ts` and `tactic-skewers.ts` each walk their own rays with
 * their own stop conditions baked in (a pin stops at a king, a skewer refuses
 * one); this is the same walk with no motif opinion attached, for the motifs
 * that look *through the mover's own* pieces rather than the opponent's.
 * Returns `[]` for a non-slider.
 */
export function raysFrom(chess: Chess, from: Square): Ray[] {
  const piece = chess.get(from);
  if (!piece) return [];
  const directions = directionsFor(piece.type);

  return directions.map((direction) => ({ direction, occupants: walk(chess, from, direction) })).filter((ray) => ray.occupants.length > 0);
}

function directionsFor(piece: PieceSymbol): readonly [number, number][] {
  if (piece === 'b') return BISHOP_DIRECTIONS;
  if (piece === 'r') return ROOK_DIRECTIONS;
  if (piece === 'q') return [...BISHOP_DIRECTIONS, ...ROOK_DIRECTIONS];
  return [];
}

function walk(chess: Chess, from: Square, [df, dr]: readonly [number, number]): Square[] {
  const occupants: Square[] = [];
  let file = from.charCodeAt(0) - 97 + df;
  let rank = Number(from[1]) - 1 + dr;

  while (file >= 0 && file <= 7 && rank >= 0 && rank <= 7 && occupants.length < 2) {
    const square = (String.fromCharCode(97 + file) + String(rank + 1)) as Square;
    if (chess.get(square)) occupants.push(square);
    file += df;
    rank += dr;
  }
  return occupants;
}
