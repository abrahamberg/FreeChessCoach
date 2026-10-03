import { Chess, type Square } from 'chess.js';
import { canBeTaken } from './board-facts/safety.js';
import { PIECE_NAMES } from './piece-names.js';
import { see } from './see.js';
import { PIECE_VALUES } from './tactics.js';

/**
 * What a capture that is not a trade won, said plainly: 14…Nxf4 "Wins the
 * queen on f4", 15.Bxe7 "Wins the queen for the bishop on e7". Both read as
 * nothing before (`trade-description.ts` names only even exchanges).
 *
 * The shared SEE decides: a piece no pawn's worth or more ahead is not won,
 * and a capture taken back must still come out at the two pieces' difference
 * (a queen for a bishop, a rook for a pawn). Pawns are not named: a pawn
 * picked up is not the note a reader needs.
 */
export function wonPieceReason(fenBefore: string, moveSan: string): string | null {
  const board = new Chess(fenBefore);
  let move;
  try {
    move = board.move(moveSan);
  } catch {
    return null;
  }
  if (!move.captured || move.captured === 'p' || move.captured === 'k') return null;
  const square = move.to as Square;
  const gain = see(fenBefore, square, move.color);
  const taken = PIECE_NAMES[move.captured];
  if (!canBeTaken(board.fen(), square)) return gain >= SEE_PIECE_FLOOR ? `Wins the ${taken} on ${square}` : null;
  const difference = PIECE_VALUES[move.captured] - PIECE_VALUES[move.piece];
  if (difference < MIN_DIFFERENCE || gain < difference * SEE_PER_POINT - SEE_SLACK) return null;
  return `Wins the ${taken} for the ${PIECE_NAMES[move.piece]} on ${square}`;
}

/** A knight on `see.ts`'s scale, give or take: the least a free piece is worth. */
const SEE_PIECE_FLOOR = 300;
/** A minor piece for a pawn taken back is usually material won back
 * (16.exd5 after 12…Bxd5), and a rook for a minor piece is the exchange: the
 * smallest trade up named is three points. */
const MIN_DIFFERENCE = 3;
const SEE_PER_POINT = 100;
/** `see.ts` prices a knight 320 and a bishop 330, not 300. */
const SEE_SLACK = 50;
