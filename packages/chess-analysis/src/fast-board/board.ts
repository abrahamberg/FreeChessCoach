import type { Color, PieceSymbol, Square } from 'chess.js';

/**
 * A plain board for the hot paths (exchanges, mate searches, move counts):
 * chess.js builds a SAN string for every move it generates, which means
 * playing each one to look for check and mate, and that cost most of a
 * game's review. Same rules as chess.js; no SAN, no history.
 *
 * Index 0 is a8, 7 is h8, 56 is a1, 63 is h1 (chess.js's `board()` order).
 * A piece is a type code (1 pawn … 6 king) plus 8 for Black; 0 is empty.
 */
export const PAWN = 1;
export const KNIGHT = 2;
export const BISHOP = 3;
export const ROOK = 4;
export const QUEEN = 5;
export const KING = 6;
export const BLACK = 8;

const TYPES: Record<PieceSymbol, number> = { p: PAWN, n: KNIGHT, b: BISHOP, r: ROOK, q: QUEEN, k: KING };
const SYMBOLS: PieceSymbol[] = ['p', 'p', 'n', 'b', 'r', 'q', 'k'];

export const typeOf = (piece: number): number => piece & 7;
export const colorOf = (piece: number): Color => (piece & BLACK ? 'b' : 'w');
export const symbolOf = (piece: number): PieceSymbol => SYMBOLS[piece & 7] ?? 'p';
export const fileOf = (index: number): number => index & 7;
export const rankOf = (index: number): number => 8 - (index >> 3);
export const indexOf = (square: Square | string): number => (8 - Number(square[1])) * 8 + (square.charCodeAt(0) - 97);
export const squareOf = (index: number): Square => `${String.fromCharCode(97 + (index & 7))}${8 - (index >> 3)}` as Square;
export const pieceCode = (type: PieceSymbol, color: Color): number => TYPES[type] | (color === 'b' ? BLACK : 0);

export const KNIGHT_JUMPS: readonly (readonly [number, number])[] = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
export const KING_STEPS: readonly (readonly [number, number])[] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
export const ROOK_RAYS: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const BISHOP_RAYS: readonly (readonly [number, number])[] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

/** The square `df` files and `dr` ranks away, or -1 off the board. */
export function step(index: number, df: number, dr: number): number {
  const file = fileOf(index) + df;
  const rank = rankOf(index) + dr;
  return file < 0 || file > 7 || rank < 1 || rank > 8 ? -1 : (8 - rank) * 8 + file;
}

export interface FastMove {
  from: number;
  to: number;
  piece: number;
  captured: number;
  promotion: number;
  /** The square of a pawn taken en passant, else -1. */
  enPassant: number;
  /** For castling, the rook's from and to squares, else -1. */
  rookFrom: number;
  rookTo: number;
}

interface Undo {
  move: FastMove;
  castling: string;
  ep: number;
  turn: Color;
}

export class FastBoard {
  readonly squares = new Int8Array(64);
  turn: Color = 'w';
  /** chess.js's castling field letters (KQkq), '' for none. */
  castling = '';
  /** The en-passant target square, or -1. */
  ep = -1;
  private readonly undos: Undo[] = [];

  static fromFen(fen: string): FastBoard {
    const board = new FastBoard();
    const [placement = '', turn = 'w', castling = '-', ep = '-'] = fen.trim().split(/\s+/);
    let index = 0;
    for (const char of placement) {
      if (char === '/') continue;
      if (char >= '1' && char <= '8') index += Number(char);
      else board.squares[index++] = pieceCode(char.toLowerCase() as PieceSymbol, char === char.toLowerCase() ? 'b' : 'w');
    }
    board.turn = turn === 'b' ? 'b' : 'w';
    board.castling = castling === '-' ? '' : castling;
    board.ep = ep === '-' ? -1 : indexOf(ep);
    return board;
  }

  /** The position as a FEN (move counters 0 1: nothing here reads them). */
  toFen(): string {
    const rows: string[] = [];
    for (let rank = 0; rank < 8; rank++) {
      let row = '';
      let empty = 0;
      for (let file = 0; file < 8; file++) {
        const piece = this.squares[rank * 8 + file] ?? 0;
        if (!piece) {
          empty++;
          continue;
        }
        if (empty) row += String(empty);
        empty = 0;
        const symbol = symbolOf(piece);
        row += colorOf(piece) === 'w' ? symbol.toUpperCase() : symbol;
      }
      rows.push(empty ? `${row}${empty}` : row);
    }
    return `${rows.join('/')} ${this.turn} ${this.castling || '-'} ${this.ep >= 0 ? squareOf(this.ep) : '-'} 0 1`;
  }

  kingOf(color: Color): number {
    const king = pieceCode('k', color);
    return this.squares.indexOf(king);
  }

  inCheck(color: Color = this.turn): boolean {
    const king = this.kingOf(color);
    return king >= 0 && isAttacked(this, king, color === 'w' ? 'b' : 'w');
  }

  make(move: FastMove): void {
    this.undos.push({ move, castling: this.castling, ep: this.ep, turn: this.turn });
    const { squares } = this;
    squares[move.from] = 0;
    if (move.enPassant >= 0) squares[move.enPassant] = 0;
    squares[move.to] = move.promotion || move.piece;
    if (move.rookFrom >= 0) {
      squares[move.rookTo] = squares[move.rookFrom] ?? 0;
      squares[move.rookFrom] = 0;
    }
    this.ep = typeOf(move.piece) === PAWN && Math.abs(move.to - move.from) === 16 ? (move.to + move.from) / 2 : -1;
    this.castling = remainingRights(this.castling, move);
    this.turn = this.turn === 'w' ? 'b' : 'w';
  }

  unmake(): void {
    const undo = this.undos.pop();
    if (!undo) return;
    const { move } = undo;
    const { squares } = this;
    squares[move.from] = move.piece;
    squares[move.to] = move.enPassant >= 0 ? 0 : move.captured;
    if (move.enPassant >= 0) squares[move.enPassant] = move.captured;
    if (move.rookFrom >= 0) {
      squares[move.rookFrom] = squares[move.rookTo] ?? 0;
      squares[move.rookTo] = 0;
    }
    this.castling = undo.castling;
    this.ep = undo.ep;
    this.turn = undo.turn;
  }
}

/** Castling rights left after a move: a king or rook that moves, or a rook taken on its corner. */
function remainingRights(rights: string, move: FastMove): string {
  if (!rights) return rights;
  let left = rights;
  const drop = (letters: string): void => {
    for (const letter of letters) left = left.replace(letter, '');
  };
  if (move.piece === pieceCode('k', 'w')) drop('KQ');
  if (move.piece === pieceCode('k', 'b')) drop('kq');
  const corners: Record<number, string> = { 63: 'K', 56: 'Q', 7: 'k', 0: 'q' };
  for (const square of [move.from, move.to]) {
    const letter = corners[square];
    if (letter) drop(letter);
  }
  return left;
}

/** Whether `by` attacks `index` (pins ignored, as chess.js's `isAttacked`). */
export function isAttacked(board: FastBoard, index: number, by: Color): boolean {
  return attackersOf(board, index, by, true).length > 0;
}

/** The squares of `by`'s men that attack `index`, pins ignored (chess.js's `attackers`). */
export function attackersOf(board: FastBoard, index: number, by: Color, firstOnly = false): number[] {
  const { squares } = board;
  const found: number[] = [];
  const own = by === 'b' ? BLACK : 0;
  const has = (square: number, type: number): boolean => square >= 0 && squares[square] === (type | own);
  const pawnRank = by === 'w' ? -1 : 1;
  for (const df of [-1, 1]) {
    const from = step(index, df, pawnRank);
    if (has(from, PAWN)) found.push(from);
  }
  for (const [df, dr] of KNIGHT_JUMPS) {
    const from = step(index, df, dr);
    if (has(from, KNIGHT)) found.push(from);
  }
  for (const [df, dr] of KING_STEPS) {
    const from = step(index, df, dr);
    if (has(from, KING)) found.push(from);
  }
  if (firstOnly && found.length) return found;
  for (const [rays, type] of [[ROOK_RAYS, ROOK], [BISHOP_RAYS, BISHOP]] as const) {
    for (const [df, dr] of rays) {
      for (let square = step(index, df, dr); square >= 0; square = step(square, df, dr)) {
        const piece = squares[square] ?? 0;
        if (!piece) continue;
        if (piece === (type | own) || piece === (QUEEN | own)) found.push(square);
        break;
      }
      if (firstOnly && found.length) return found;
    }
  }
  return found;
}
