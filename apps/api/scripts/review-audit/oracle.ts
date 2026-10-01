import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';

/** The checker's own small board toolkit, on chess.js only. It deliberately
 * does not import the analysis package's `see`, `loosePieces` or `forks`:
 * a check built on the code it checks agrees with it by construction. */

export const POINTS: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
export const PIECE_BY_NAME: Record<string, PieceSymbol> = { pawn: 'p', knight: 'n', bishop: 'b', rook: 'r', queen: 'q', king: 'k' };

export function colorOf(side: 'white' | 'black'): Color {
  return side === 'white' ? 'w' : 'b';
}

export function other(color: Color): Color {
  return color === 'w' ? 'b' : 'w';
}

export function pieceAt(fen: string, square: string): { type: PieceSymbol; color: Color } | null {
  return new Chess(fen).get(square as Square) ?? null;
}

/** The fen after `san`, or null when it is not legal there. */
export function play(fen: string, san: string): string | null {
  try {
    const chess = new Chess(fen);
    chess.move(san);
    return chess.fen();
  } catch {
    return null;
  }
}

/** Every fen along a line; stops at the first illegal move. `legal` says whether it got to the end. */
export function playLine(fen: string, sans: readonly string[]): { fens: string[]; legal: boolean } {
  const fens = [fen];
  for (const san of sans) {
    const next = play(fens[fens.length - 1] ?? fen, san);
    if (!next) return { fens, legal: false };
    fens.push(next);
  }
  return { fens, legal: true };
}

/** White's material minus Black's, in pawns. */
export function balance(fen: string): number {
  let sum = 0;
  for (const row of new Chess(fen).board()) for (const cell of row) if (cell) sum += (cell.color === 'w' ? 1 : -1) * POINTS[cell.type];
  return sum;
}

/** The side's material gain over a line (positive: it won material). */
export function lineGain(fen: string, sans: readonly string[], side: Color): number {
  const { fens } = playLine(fen, sans);
  const change = balance(fens[fens.length - 1] ?? fen) - balance(fen);
  return side === 'w' ? change : -change;
}

/** Squares of `by`'s pieces that attack `square` (pseudo-legal, pins ignored). */
export function attackersOf(fen: string, square: string, by: Color): Square[] {
  return new Chess(fen).attackers(square as Square, by);
}

/** The same position with the other side to move (en passant cleared). */
export function withTurn(fen: string, turn: Color): string {
  const parts = fen.split(' ');
  parts[1] = turn;
  parts[3] = '-';
  return parts.join(' ');
}

/** Legal captures of `square` by `by`, from a position where `by` is to move. */
export function legalCapturesOf(fen: string, square: string, by: Color): string[] {
  try {
    const chess = new Chess(withTurn(fen, by));
    return chess.moves({ verbose: true }).filter((move) => move.to === square && move.captured).map((move) => move.san);
  } catch {
    return [];
  }
}

export interface Mention {
  color: Color | null;
  piece: PieceSymbol;
  square: string;
  text: string;
}

const MENTION = /\b(?:(white|black)\s+)?(king|queen|rook|bishop|knight|pawn)\s+on\s+([a-h][1-8])\b/gi;

/** "the knight on f3", "the black pawn on e5": every piece a sentence places on a square. */
export function mentions(text: string): Mention[] {
  return [...text.matchAll(MENTION)].map((match) => ({
    color: match[1] ? colorOf(match[1].toLowerCase() as 'white' | 'black') : null,
    piece: PIECE_BY_NAME[(match[2] ?? '').toLowerCase()] ?? 'p',
    square: (match[3] ?? '').toLowerCase(),
    text: match[0]
  }));
}

export function mentionOn(fen: string, mention: Mention): boolean {
  const found = pieceAt(fen, mention.square);
  return Boolean(found && found.type === mention.piece && (mention.color === null || found.color === mention.color));
}

export function isCheckmate(fen: string): boolean {
  return new Chess(fen).isCheckmate();
}

export function inCheck(fen: string): boolean {
  return new Chess(fen).inCheck();
}

export function turnOf(fen: string): Color {
  return fen.split(' ')[1] === 'b' ? 'b' : 'w';
}

export function kingSquare(fen: string, color: Color): string | null {
  const chess = new Chess(fen);
  for (const row of chess.board()) for (const cell of row) if (cell?.type === 'k' && cell.color === color) return cell.square;
  return null;
}

/** What `by` wins by capturing on `square` and then trading off there
 * (each side may stop when going on loses), over real legal moves: pins,
 * checks and x-rays behind a capturer all count. Its own exchange search,
 * independent of the analysis package's `see`. Positive: the piece can be won. */
export function exchangeGain(fen: string, square: string, by: Color): number {
  const start = turnOf(fen) === by ? fen : withTurn(fen, by);
  const captures = capturesOn(start, square);
  if (!captures.length) return 0;
  return Math.max(...captures.map(({ value, fen: after }) => value - Math.max(0, replyGain(after, square, 1))));
}

function replyGain(fen: string, square: string, depth: number): number {
  if (depth > 12) return 0;
  const captures = capturesOn(fen, square);
  if (!captures.length) return 0;
  return Math.max(...captures.map(({ value, fen: after }) => value - Math.max(0, replyGain(after, square, depth + 1))));
}

function capturesOn(fen: string, square: string): { value: number; fen: string }[] {
  const chess = new Chess(fen);
  return chess
    .moves({ verbose: true })
    .filter((move) => move.to === square && move.captured)
    .map((move) => {
      const next = new Chess(fen);
      next.move(move.san);
      return { value: POINTS[move.captured ?? 'p'] + (move.promotion ? POINTS[move.promotion] - 1 : 0), fen: next.fen() };
    });
}
