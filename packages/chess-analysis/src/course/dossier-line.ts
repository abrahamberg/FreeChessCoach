import { Chess, type Color } from 'chess.js';
import type { CourseLineGame } from './line-game.js';
import type { CourseTreeLine } from './tree.js';
import { isBookMoveFrom, resolveOpening } from '../opening-book.js';
import { positionKey } from '../opening-book-key.js';
import { computePositionFeatures } from '../position-features.js';

const QUEENSIDE = new Set(['a', 'b', 'c', 'd']);

export interface CourseLineFacts {
  lineId: string;
  name: string;
  openingName: string | null;
  /** The first move of the line that is not in the opening book. */
  bookExitNodeId: string | null;
  /** The end position's structure in words, to ground talk of plans. */
  endFeatures: string[];
}

export function buildCourseLineFacts(line: CourseTreeLine, game: CourseLineGame): CourseLineFacts {
  const positions = game.game.positions;
  const exitIndex = positions.slice(1).findIndex((position, index) => {
    const before = positions[index];
    return !before || !position.moveSan || !isBookMoveFrom(before.fen, position.moveSan);
  });
  const endFen = positions[positions.length - 1]?.fen ?? '';
  return {
    lineId: line.id,
    name: line.name,
    openingName: resolveOpening(positions.map((position) => positionKey(position.fen)))?.name ?? null,
    bookExitNodeId: exitIndex >= 0 ? (game.nodeIds[exitIndex] ?? null) : null,
    endFeatures: endFen ? endFeatures(endFen) : []
  };
}

function endFeatures(fen: string): string[] {
  const features = computePositionFeatures(fen);
  const facts: string[] = [];
  if (features.openFiles.length) facts.push(`open files: ${features.openFiles.join(', ')}`);
  for (const file of features.semiOpenFiles) facts.push(`the ${file.file}-file is half-open for ${file.openFor}`);
  for (const pawn of features.passedPawns) facts.push(`${pawn.color} has a passed pawn on ${pawn.square}`);
  // A lone pawn is passed, not isolated: knight against pawn read "white has
  // an isolated pawn on b7" and "a queenside pawn majority".
  const pawns = { white: 0, black: 0 };
  for (const cell of new Chess(fen).board().flat()) if (cell?.type === 'p') pawns[cell.color === 'w' ? 'white' : 'black'] += 1;
  for (const pawn of features.isolatedPawns) if (pawns[pawn.color] > 1) facts.push(`${pawn.color} has an isolated pawn on ${pawn.square}`);
  for (const file of features.doubledPawns) facts.push(`${file.color} has doubled pawns on the ${file.file}-file`);
  facts.push(...majorities(fen), ...kingSafety(fen));
  return facts;
}

/** A side with more pawns than the other on one wing, two at least. */
function majorities(fen: string): string[] {
  const count = { w: { queenside: 0, kingside: 0 }, b: { queenside: 0, kingside: 0 } };
  for (const row of new Chess(fen).board()) {
    for (const cell of row) {
      if (cell?.type !== 'p') continue;
      count[cell.color][QUEENSIDE.has(cell.square[0] ?? '') ? 'queenside' : 'kingside'] += 1;
    }
  }
  const facts: string[] = [];
  for (const wing of ['queenside', 'kingside'] as const) {
    if (count.w[wing] > count.b[wing] && count.w[wing] > 1) facts.push(`white has a ${wing} pawn majority`);
    if (count.b[wing] > count.w[wing] && count.b[wing] > 1) facts.push(`black has a ${wing} pawn majority`);
  }
  return facts;
}

/** Where the king stands, while there are pieces to attack it: with two or
 * fewer pieces left the king belongs in the centre, and queen against pawn
 * read "the white king is still in the centre on f6". */
function kingSafety(fen: string): string[] {
  const chess = new Chess(fen);
  const pieces = chess.board().flat().filter((cell) => cell && cell.type !== 'k' && cell.type !== 'p').length;
  if (pieces <= 2) return [];
  return (['w', 'b'] as Color[]).flatMap((color) => {
    const square = chess.findPiece({ type: 'k', color })[0];
    const name = color === 'w' ? 'white' : 'black';
    if (!square) return [];
    if (/^[gh]/.test(square) || /^[abc]/.test(square)) return [`the ${name} king is tucked away on ${square}`];
    return [`the ${name} king is still in the centre on ${square}`];
  });
}
