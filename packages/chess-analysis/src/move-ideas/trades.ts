import type { Chess, Color } from 'chess.js';
import { PIECE_VALUES } from '../tactics.js';
import type { IdeaContext } from './context.js';
import { fileIndex, piecesOf } from './squares.js';
import type { MoveIdea } from './types.js';

/** "Simplify!": a trade is worth saying when the mover is this far ahead (pawns). */
const AHEAD_PAWNS = 2;

export function tradeIdeas(context: IdeaContext): MoveIdea[] {
  return [whenAhead(context), towardCentre(context), bishopPair(context)].filter((idea): idea is MoveIdea => idea !== null);
}

function material(board: Chess, color: Color): number {
  return piecesOf(board, color).reduce((sum, piece) => sum + (piece.piece === 'k' ? 0 : PIECE_VALUES[piece.piece]), 0);
}

/** An even trade (a piece for one of its own worth) while ahead in material. */
function whenAhead({ before, move, enemy }: IdeaContext): MoveIdea | null {
  if (!move.captured || move.piece === 'p' || move.piece === 'k' || Math.abs(PIECE_VALUES[move.captured] - PIECE_VALUES[move.piece]) > 0) return null;
  const ahead = material(before, move.color) - material(before, enemy);
  return ahead >= AHEAD_PAWNS ? { kind: 'tradesWhenAhead', ahead } : null;
}

/** A pawn that takes toward the middle of the board. */
function towardCentre({ move }: IdeaContext): MoveIdea | null {
  if (move.piece !== 'p' || !move.captured) return null;
  const centreDistance = (file: number): number => Math.abs(file - 3.5);
  return centreDistance(fileIndex(move.to)) < centreDistance(fileIndex(move.from)) ? { kind: 'recapturesTowardCentre', from: move.from, to: move.to } : null;
}

/** A bishop traded for a knight, or a knight for a bishop, that leaves one
 * side with both bishops and the other with one or none. */
function bishopPair({ after, move, enemy }: IdeaContext): MoveIdea | null {
  if (!move.captured || !((move.piece === 'b' && move.captured === 'n') || (move.piece === 'n' && move.captured === 'b'))) return null;
  const own = piecesOf(after, move.color, 'b').length;
  const theirs = piecesOf(after, enemy, 'b').length;
  if (own === 2 && theirs < 2) return { kind: 'bishopPair', gains: true };
  if (theirs === 2 && own < 2) return { kind: 'bishopPair', gains: false };
  return null;
}
