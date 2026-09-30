import { Chess, type Color, type Square } from 'chess.js';
import { buildAttackMap, opponentOf } from '../attack-map.js';
import { flipActiveColorFen } from '../null-move-fen.js';
import { forks as candidateForks } from '../tactics.js';
import type { BoardFact, PieceAt } from './types.js';
import { canBeTaken } from './safety.js';

export type Fork = Extract<BoardFact, { kind: 'forks' }>;

/** The forks `by` has in this position: a piece of `by` attacking at least
 * two enemy pieces (the king counts, pawns do not: "forks e5 and a2 and c2"
 * read as nonsense and was copied word for word), where a victim is worth
 * more than the forker or undefended (`tactics.forks`), and the forker
 * cannot simply be taken (`canBeTaken`: a capture that loses nothing over
 * the whole exchange). A piece that is taken forks nothing: 3.Qg8+ in
 * Philidor's Legacy read "forks the rook on a8 and the king on h8" before
 * …Rxg8.
 *
 * The opponent must be the side to move for "can be taken" to mean anything:
 * if `by` is to move, the position is read with the turn passed, and is
 * empty when passing is illegal (`by` is in check). */
export function forks(fen: string, by: Color): Fork[] {
  const chess = new Chess(fen);
  const opponentToMove = chess.turn() === opponentOf(by) ? fen : flipActiveColorFen(fen);
  if (!opponentToMove) return [];
  const board = new Chess(opponentToMove);
  return candidateForks(board, buildAttackMap(board)).flatMap((fork) => {
    if (board.get(fork.square as Square)?.color !== by || canBeTaken(opponentToMove, fork.square)) return [];
    const targets = fork.forkedSquares.flatMap((square): PieceAt[] => {
      const piece = board.get(square as Square);
      return piece && piece.type !== 'p' ? [{ piece: piece.type, square: square as Square }] : [];
    });
    return targets.length >= 2 ? [{ kind: 'forks', piece: { piece: fork.piece, square: fork.square as Square }, targets }] : [];
  });
}
