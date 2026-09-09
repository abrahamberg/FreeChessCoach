import type { Square } from 'chess.js';
import { occupiedSquares } from '../attack-map.js';
import { kingSquareOf, pieceNameAt } from '../tactic-board-facts.js';
import { neighboursOf } from '../tactic-lookahead.js';
import type { TacticClaim } from '../tactic-claim.js';
import type { TacticDetector } from './types.js';

/**
 * The move steps out of a friendly slider's way, and the line it opens now
 * reaches the squares around the enemy king.
 *
 * Deliberately narrower than "a line opened": if the opened line lands on an
 * enemy *piece*, that is a discovered attack and `discovered-attack.ts`
 * already names it. Clearance is the case where the line opens onto empty
 * squares that matter — the ones the enemy king would like to use — which is
 * the version a player has to be shown, because there is nothing on the board
 * pointing at it.
 */
export const clearanceDetector: TacticDetector = {
  type: 'clearance',
  priority: 94,
  detect: (ctx) => {
    if (!ctx.after || !ctx.afterAttackMap || !ctx.destination || !ctx.move) return [];
    // A line that opened onto an enemy piece is a discovered attack, and
    // saying both is describing one event twice.
    if (ctx.facts.discovered()) return [];
    const after = ctx.after;
    const vacated = ctx.move.from as Square;
    const king = kingSquareOf(after, ctx.opponent);
    if (!king) return [];
    const kingZone = new Set<Square>([king, ...neighboursOf(king)]);

    for (const piece of occupiedSquares(after)) {
      if (piece.color !== ctx.mover || piece.square === ctx.destination) continue;
      const before = new Set(ctx.beforeAttackMap.controlledBy.get(piece.square) ?? []);
      const opened = (ctx.afterAttackMap.controlledBy.get(piece.square) ?? []).filter(
        (square) => !before.has(square) && kingZone.has(square) && !after.get(square)
      );
      if (opened.length === 0) continue;

      const claim: TacticClaim = {
        type: 'clearance',
        actor: piece.square,
        targets: opened,
        victim: null,
        gainKind: 'positional',
        expectedGain: 0,
        prize: null,
        evidence: { arrows: opened.map((square) => ({ from: piece.square, to: square })), highlights: [vacated] },
        detail: `clears ${vacated} so the ${pieceNameAt(after, piece.square)} on ${piece.square} bears on the king`
      };
      return [claim];
    }
    return [];
  }
};
