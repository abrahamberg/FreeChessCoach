import type { Chess, Color, Square } from 'chess.js';
import { occupiedSquares } from '../attack-map.js';
import type { TacticClaim } from '../tactic-claim.js';
import type { TacticDetector } from './types.js';

/**
 * A quiet piece move after which one of the mover's pawns can break — take,
 * or push at an enemy pawn — where it couldn't before.
 *
 * Computed by pawn arithmetic over the two boards the move already built,
 * not by generating moves: this runs on every quiet move in the game and in
 * the precision corpora, and a `Chess` replay per call is the difference
 * between a scan that finishes and one that doesn't.
 */
export const preparesBreakDetector: TacticDetector = {
  type: 'preparesBreak',
  priority: 106,
  detect: (ctx) => {
    if (!ctx.after || !ctx.destination || !ctx.move) return [];
    if (ctx.move.piece === 'p' || ctx.move.captured !== undefined) return [];

    const before = new Set(pawnBreakSquares(ctx.before, ctx.mover, ctx.opponent));
    const opened = pawnBreakSquares(ctx.after, ctx.mover, ctx.opponent).filter((square) => !before.has(square));
    if (opened.length === 0) return [];

    const claim: TacticClaim = {
      type: 'preparesBreak',
      actor: ctx.destination,
      targets: opened,
      victim: null,
      gainKind: 'positional',
      expectedGain: 0,
      prize: null,
      evidence: { arrows: [], highlights: opened },
      detail: `opens up a pawn break on ${opened[0]}`
    };
    return [claim];
  }
};

/**
 * Squares one of `mover`'s pawns can break on: a diagonal capture of an enemy
 * pawn, or a one-square push onto a square an enemy pawn guards.
 *
 * Both are "breaks" in the sense a coach means — challenging the opponent's
 * pawn chain. A quiet advance into empty space is `spaceGain`, a different
 * motif with different advice.
 */
function pawnBreakSquares(board: Chess, mover: Color, opponent: Color): Square[] {
  const forward = mover === 'w' ? 1 : -1;
  const squares: Square[] = [];

  for (const pawn of occupiedSquares(board).filter((piece) => piece.type === 'p' && piece.color === mover)) {
    const file = pawn.square.charCodeAt(0) - 97;
    const rank = Number(pawn.square[1]) - 1;

    for (const df of [-1, 1]) {
      const target = squareAt(file + df, rank + forward);
      if (target && board.get(target)?.color === opponent && board.get(target)?.type === 'p') squares.push(target);
    }

    const push = squareAt(file, rank + forward);
    if (push && !board.get(push) && isGuardedByPawn(board, push, opponent)) squares.push(push);
  }
  return squares;
}

/** An enemy pawn attacks `square` — i.e. sits one rank ahead of it (from the
 * enemy's point of view) on an adjacent file. */
function isGuardedByPawn(board: Chess, square: Square, opponent: Color): boolean {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  const back = opponent === 'w' ? -1 : 1;

  return [-1, 1].some((df) => {
    const from = squareAt(file + df, rank + back);
    if (!from) return false;
    const piece = board.get(from);
    return piece?.type === 'p' && piece.color === opponent;
  });
}

function squareAt(file: number, rank: number): Square | null {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return (String.fromCharCode(97 + file) + String(rank + 1)) as Square;
}
