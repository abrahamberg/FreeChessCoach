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
 *
 * Not a pin: an exchange offered. A rook facing a rook, a bishop facing a
 * bishop, a queen offered to a queen: the front piece takes the pinner and
 * nothing was held (the audit's dev games, 2026-10-02: 39 of 211 pins could
 * take their pinner, four of them priced as winning the piece). It stays a
 * pin when taking the pinner costs material (a queen pinned by a bishop),
 * or when the front piece had something else to do that the pin, or the
 * exchange, takes away (`pinnedPieceTask`).
 */
export function pins(chess: Chess): PinHit[] {
  const shapes = pinShapes(chess);
  return shapes.filter((hit) => !canTakePinner(chess, hit) || pinnedPieceTask(chess, hit, shapes) !== null);
}

/** Every pin by geometry alone, exchange offers included. */
export function pinShapes(chess: Chess): PinHit[] {
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

/** The front piece attacks the pinner and is worth no more than it. A king
 * in front is in check, not offered an exchange (`PIECE_VALUES` prices it at
 * nothing): that shape is left as it was. */
export function canTakePinner(chess: Chess, hit: PinHit): boolean {
  const front = chess.get(hit.pinned);
  const pinner = chess.get(hit.by);
  if (!front || !pinner || front.type === 'k' || PIECE_VALUES[front.type] > PIECE_VALUES[pinner.type]) return false;
  return chess.attackers(hit.by, front.color).includes(hit.pinned);
}

export type PinnedPieceTask = 'capture' | 'guard' | 'block';

/**
 * What the front piece was there to do, apart from standing on the line
 * (the owner's rule, 2026-10-02; the Englund's 6…Bb4, where the bishop on
 * c3 wants to take the queen on b2 and cannot):
 * - `capture`: it attacks an enemy piece other than the pinner that is
 *   worth more than it (a pawn about to promote counts), one nothing
 *   defends, or one of its own value that is itself attacking something (a
 *   check included);
 * - `guard`: it is the only defender of a man of its own that the enemy
 *   attacks, so it is the one to take back;
 * - `block`: it stands in front of a second line as well.
 * `null`: it had nothing else to do.
 */
export function pinnedPieceTask(chess: Chess, hit: PinHit, shapes: readonly PinHit[] = pinShapes(chess)): PinnedPieceTask | null {
  const front = chess.get(hit.pinned);
  if (!front) return null;
  const enemy = opponentOf(front.color);
  const men = occupiedSquares(chess);
  const attacksFromFront = (square: Square): boolean => chess.attackers(square, front.color).includes(hit.pinned);

  const capture = men.some((man) => {
    if (man.color !== enemy || man.type === 'k' || man.square === hit.by || !attacksFromFront(man.square)) return false;
    if (PIECE_VALUES[man.type] > PIECE_VALUES[front.type] || aboutToPromote(man)) return true;
    // Free: nothing takes back.
    if (chess.attackers(man.square, enemy).length === 0) return true;
    return PIECE_VALUES[man.type] === PIECE_VALUES[front.type] && men.some((own) => own.color === front.color && chess.attackers(own.square, enemy).includes(man.square));
  });
  if (capture) return 'capture';

  // The only defender: with a second one the man is held without it.
  const guard = men.some(
    (own) =>
      own.color === front.color &&
      own.type !== 'k' &&
      own.square !== hit.pinned &&
      chess.attackers(own.square, enemy).length > 0 &&
      chess.attackers(own.square, front.color).every((square) => square === hit.pinned) &&
      attacksFromFront(own.square)
  );
  if (guard) return 'guard';

  return shapes.some((other) => other.pinned === hit.pinned && other.by !== hit.by) ? 'block' : null;
}

/** A pawn one step from promoting is a queen for this purpose: the rook
 * that stops it has the most important job on the board (Lichess pin puzzle
 * CObOW: …Rb4 pins the rook on g4 that holds the pawn on g2). */
function aboutToPromote(man: OccupiedSquare): boolean {
  return man.type === 'p' && man.square[1] === (man.color === 'w' ? '7' : '2');
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
