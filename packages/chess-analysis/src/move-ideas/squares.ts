import type { Chess, Color, PieceSymbol, Square } from 'chess.js';
import type { PieceAt } from '../board-facts/types.js';

export const FILES = 'abcdefgh';
export const CENTRE: readonly Square[] = ['d4', 'e4', 'd5', 'e5'];
/** The sixteen squares c3–f6. */
export const BIG_CENTRE: readonly Square[] = [...'cdef'].flatMap((file) => [3, 4, 5, 6].map((rank) => `${file}${rank}` as Square));

export const fileIndex = (square: Square): number => FILES.indexOf(square[0] ?? 'a');
export const rankOf = (square: Square): number => Number(square[1]);
/** The rank as `color` counts it: 1 at home, 8 at the far end. */
export const ownRank = (square: Square, color: Color): number => (color === 'w' ? rankOf(square) : 9 - rankOf(square));
export const homeRank = (color: Color): number => (color === 'w' ? 1 : 8);

export function squareAt(file: number, rank: number): Square | null {
  if (file < 0 || file > 7 || rank < 1 || rank > 8) return null;
  return `${FILES[file]}${rank}` as Square;
}

export function pieceAt(board: Chess, square: Square): PieceAt | null {
  const piece = board.get(square);
  return piece ? { piece: piece.type, square } : null;
}

const KNIGHT_JUMPS: readonly [number, number][] = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING_STEPS: readonly [number, number][] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const ROOK_RAYS: readonly [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP_RAYS: readonly [number, number][] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

/** Every square the piece on `from` attacks (pawns: their captures), by its
 * own moves on the board: a slider stops at the first man in the way. */
export function attacksFrom(board: Chess, from: Square): Square[] {
  const piece = board.get(from);
  if (!piece) return [];
  const file = fileIndex(from);
  const rank = rankOf(from);
  const steps = (offsets: readonly [number, number][]): Square[] => offsets.flatMap(([df, dr]) => squareAt(file + df, rank + dr) ?? []);
  const rays = (directions: readonly [number, number][]): Square[] =>
    directions.flatMap(([df, dr]) => {
      const seen: Square[] = [];
      for (let step = 1; step < 8; step++) {
        const square = squareAt(file + df * step, rank + dr * step);
        if (!square) break;
        seen.push(square);
        if (board.get(square)) break;
      }
      return seen;
    });
  if (piece.type === 'p') return steps([[-1, piece.color === 'w' ? 1 : -1], [1, piece.color === 'w' ? 1 : -1]]);
  if (piece.type === 'n') return steps(KNIGHT_JUMPS);
  if (piece.type === 'k') return steps(KING_STEPS);
  if (piece.type === 'b') return rays(BISHOP_RAYS);
  if (piece.type === 'r') return rays(ROOK_RAYS);
  return rays([...ROOK_RAYS, ...BISHOP_RAYS]);
}

export function kingSquare(board: Chess, color: Color): Square | null {
  return board.findPiece({ type: 'k', color })[0] ?? null;
}

/** The king's square and the squares next to it. */
export function kingZone(board: Chess, color: Color): Square[] {
  const king = kingSquare(board, color);
  if (!king) return [];
  const zone: Square[] = [];
  for (let df = -1; df <= 1; df++) {
    for (let dr = -1; dr <= 1; dr++) {
      const square = squareAt(fileIndex(king) + df, rankOf(king) + dr);
      if (square) zone.push(square);
    }
  }
  return zone;
}

export function piecesOf(board: Chess, color: Color, type?: PieceSymbol): PieceAt[] {
  return board
    .board()
    .flat()
    .flatMap((cell) => (cell && cell.color === color && (type === undefined || cell.type === type) ? [{ piece: cell.type, square: cell.square }] : []));
}

/** Whether a pawn of `color` stands, or could still step, where it attacks
 * `square`: pawns only go forward, so one already past it never can. */
export function pawnCanReach(board: Chess, color: Color, square: Square): boolean {
  const target = rankOf(square);
  return [fileIndex(square) - 1, fileIndex(square) + 1].some((file) =>
    piecesOf(board, color, 'p').some((pawn) => fileIndex(pawn.square) === file && (color === 'w' ? rankOf(pawn.square) < target : rankOf(pawn.square) > target))
  );
}

/** A king that has castled, or stands where castling would put it, with its
 * pawn shield's files. */
export function shieldFiles(king: Square): number[] | null {
  const file = fileIndex(king);
  if (file >= 5) return [5, 6, 7];
  if (file <= 2) return [0, 1, 2];
  return null;
}

export const NATURAL_KNIGHT_SQUARES: ReadonlySet<Square> = new Set(['c3', 'f3', 'c6', 'f6']);

/** No queens, or at most a rook and a minor piece a side: the ending, where
 * the king is a fighting piece and castling no longer matters. */
export function isEnding(board: Chess): boolean {
  const pieces = board.board().flat().filter((cell) => cell && cell.type !== 'p' && cell.type !== 'k');
  if (!pieces.some((cell) => cell?.type === 'q')) return true;
  return (['w', 'b'] as const).every((color) => pieces.filter((cell) => cell?.color === color).length <= 2);
}
