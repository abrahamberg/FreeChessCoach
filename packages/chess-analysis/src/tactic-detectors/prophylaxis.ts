import type { Chess, Color, Square } from 'chess.js';
import { occupiedSquares } from '../attack-map.js';
import { pieceValueAt } from '../tactic-board-facts.js';
import type { TacticClaim } from '../tactic-claim.js';
import type { TacticDetector } from './types.js';

/** The eight squares a knight reaches, as file/rank offsets. */
const KNIGHT_OFFSETS: readonly [number, number][] = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2]
];

/**
 * A quiet move that takes away a square an enemy knight was about to fork
 * from.
 *
 * Scoped to knights on purpose. Prophylaxis in general is "the move that
 * stops an idea the opponent hadn't played yet", and answering that in full
 * means enumerating the opponent's replies at every ply — a search, not a
 * detector, and one this pipeline runs over thousands of quiet moves. A
 * knight fork is the one enemy idea whose landing squares are a short, fixed
 * list, so it can be checked exactly and cheaply; a wider claim here would be
 * a guess wearing a motif's name.
 *
 * The whole check is offset arithmetic over the two boards already built for
 * the move — no replay, no move generation.
 */
export const prophylaxisDetector: TacticDetector = {
  type: 'prophylaxis',
  priority: 90,
  detect: (ctx) => {
    if (!ctx.after || !ctx.destination || !ctx.move) return [];
    if (ctx.move.captured !== undefined || ctx.after.isCheck()) return [];

    const before = knightForkSquares(ctx.before, ctx.opponent, ctx.mover);
    if (before.length === 0) return [];
    const still = new Set(knightForkSquares(ctx.after, ctx.opponent, ctx.mover));
    const denied = before.filter((square) => !still.has(square));
    if (denied.length === 0) return [];

    const claim: TacticClaim = {
      type: 'prophylaxis',
      actor: ctx.destination,
      targets: denied,
      victim: null,
      gainKind: 'safety',
      expectedGain: 0,
      prize: null,
      evidence: { arrows: [], highlights: denied },
      detail: `takes ${denied[0]} away from their knight before it can fork`
    };
    return [claim];
  }
};

/**
 * Squares an enemy knight could hop to and hit two of `victim`'s pieces from,
 * at least one of them worth a piece or the king.
 *
 * Whether the knight would *survive* there is deliberately not asked: the
 * point of prophylaxis is that the idea never gets played, so the test is
 * about the geometry the move takes away, not about an exchange that will
 * never happen.
 */
function knightForkSquares(board: Chess, knightColour: Color, victim: Color): Square[] {
  const squares: Square[] = [];

  for (const knight of occupiedSquares(board).filter((piece) => piece.type === 'n' && piece.color === knightColour)) {
    for (const landing of knightMovesFrom(knight.square)) {
      // A square its own side already occupies isn't reachable.
      if (board.get(landing)?.color === knightColour) continue;
      const hits = knightMovesFrom(landing).filter((square) => board.get(square)?.color === victim);
      if (hits.length < 2) continue;
      if (!hits.some((square) => board.get(square)?.type === 'k' || pieceValueAt(board, square) >= 3)) continue;
      squares.push(landing);
    }
  }
  return squares;
}

function knightMovesFrom(square: Square): Square[] {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  const squares: Square[] = [];

  for (const [df, dr] of KNIGHT_OFFSETS) {
    const nextFile = file + df;
    const nextRank = rank + dr;
    if (nextFile < 0 || nextFile > 7 || nextRank < 0 || nextRank > 7) continue;
    squares.push((String.fromCharCode(97 + nextFile) + String(nextRank + 1)) as Square);
  }
  return squares;
}
