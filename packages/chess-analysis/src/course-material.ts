import { Chess, type PieceSymbol } from 'chess.js';

/** Material points, the king not counted. */
export const MATERIAL_VALUES: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const NAMES: Record<PieceSymbol, [string, string]> = {
  p: ['pawn', 'pawns'],
  n: ['knight', 'knights'],
  b: ['bishop', 'bishops'],
  r: ['rook', 'rooks'],
  q: ['queen', 'queens'],
  k: ['king', 'kings']
};
const ORDER: PieceSymbol[] = ['q', 'r', 'b', 'n', 'p'];
const COUNT_WORDS = ['', 'a', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];

type Side = 'white' | 'black';
const sideOf = (color: 'w' | 'b'): Side => (color === 'w' ? 'white' : 'black');
const capitalise = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

/** The pieces each side captures over a line of SAN moves from `fen`; the
 * walk stops at the first illegal move. */
export function lineCaptures(fen: string, sans: readonly string[]): Record<Side, PieceSymbol[]> {
  const taken: Record<Side, PieceSymbol[]> = { white: [], black: [] };
  const chess = new Chess(fen);
  for (const san of sans) {
    let move;
    try {
      move = chess.move(san);
    } catch {
      break;
    }
    if (move.captured) taken[sideOf(move.color)].push(move.captured);
  }
  return taken;
}

/** The material at the end of a line of SAN moves from `fen`, in
 * `materialBalance`'s words; the walk stops at the first illegal move. */
export function lineBalance(fen: string, sans: readonly string[]): string {
  const chess = new Chess(fen);
  for (const san of sans) {
    try {
      chess.move(san);
    } catch {
      break;
    }
  }
  return materialBalance(chess.fen());
}

/** "Black takes a pawn; White takes the queen and a knight", or "nothing is
 * taken". The first side named is the one that moves first. */
export function captureWords(fen: string, sans: readonly string[]): string {
  const taken = lineCaptures(fen, sans);
  const first: Side = new Chess(fen).turn() === 'w' ? 'white' : 'black';
  const sides: Side[] = first === 'white' ? ['white', 'black'] : ['black', 'white'];
  const parts = sides.filter((side) => taken[side].length).map((side) => `${capitalise(side)} takes ${pieceList(taken[side], true)}`);
  return parts.length ? parts.join('; ') : 'nothing is taken';
}

/** The mover's points after its move and the reply: what the reply captured
 * minus what the move captured. Positive is a loss. */
export function exchangeLoss(fenBefore: string, san: string, replySan: string): number {
  const taken = lineCaptures(fenBefore, [san, replySan]);
  const mover: Side = new Chess(fenBefore).turn() === 'w' ? 'white' : 'black';
  const other: Side = mover === 'white' ? 'black' : 'white';
  const points = (pieces: PieceSymbol[]): number => pieces.reduce((sum, piece) => sum + MATERIAL_VALUES[piece], 0);
  return points(taken[other]) - points(taken[mover]);
}

/** The material on the board in words: "material is level", "White is a
 * pawn up", "Black has a knight for two pawns". */
export function materialBalance(fen: string): string {
  const counts: Record<PieceSymbol, number> = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 };
  for (const row of new Chess(fen).board()) {
    for (const cell of row) if (cell) counts[cell.type] += cell.color === 'w' ? 1 : -1;
  }
  const extra = (sign: 1 | -1): PieceSymbol[] => ORDER.flatMap((piece) => Array<PieceSymbol>(Math.max(0, sign * counts[piece])).fill(piece));
  const white = extra(1);
  const black = extra(-1);
  if (!white.length && !black.length) return 'material is level';
  if (!black.length) return `White is ${pieceList(white, false)} up`;
  if (!white.length) return `Black is ${pieceList(black, false)} up`;
  return `White has ${pieceList(white, false)} for ${pieceList(black, false)}`;
}

/** "the queen and a knight" (captured: the queen is unique) or "a queen
 * and a knight"; "two pawns". */
function pieceList(pieces: PieceSymbol[], definiteQueen: boolean): string {
  const counted = ORDER.flatMap((piece) => {
    const count = pieces.filter((each) => each === piece).length;
    if (!count) return [];
    if (count === 1) return [`${piece === 'q' && definiteQueen ? 'the' : 'a'} ${NAMES[piece][0]}`];
    return [`${COUNT_WORDS[count] ?? count} ${NAMES[piece][1]}`];
  });
  return counted.length > 1 ? `${counted.slice(0, -1).join(', ')} and ${counted.at(-1)}` : (counted[0] ?? '');
}
