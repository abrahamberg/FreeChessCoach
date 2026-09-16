import type { Square } from 'chess.js';
import { enemyTargetsOf, formatSquareList, pieceNameAt, pieceValueAt } from '../tactic-board-facts.js';
import { PIECE_VALUES } from '../tactics.js';
import type { TacticClaim } from '../tactic-claim.js';
import type { TacticDetector } from './types.js';

/**
 * The piece this move landed on attacks two or more enemy pieces at once.
 *
 * Deliberately looser than the old `forks()` gate, which also required a
 * victim worth more than the forker or undefended: a double attack on two
 * defended pawns is a real proposal, it just doesn't survive verification.
 * The forker-is-hanging guard that TR-03 needs lives in
 * `verify-tactic-claims.ts`, not here — a detector that applied it could
 * never propose a fork that works *because* the forker is sacrificed.
 */
export const forkDetector: TacticDetector = {
  type: 'fork',
  priority: 10,
  detect: (ctx) => {
    if (!ctx.after || !ctx.afterAttackMap || !ctx.destination) return [];
    const after = ctx.after;
    const actor = ctx.destination;
    const targets = enemyTargetsOf(after, ctx.afterAttackMap, actor, ctx.opponent);
    if (targets.length < 2) return [];

    const victim = mostValuableTarget(targets, (square) => pieceValueAt(after, square));
    if (!victim) return [];

    const claim: TacticClaim = {
      type: 'fork',
      actor,
      targets,
      victim,
      gainKind: 'material',
      expectedGain: forkGain(targets.map((square) => pieceValueAt(after, square)), PIECE_VALUES[after.get(actor)?.type ?? 'p']),
      prize: pieceNameAt(after, victim),
      evidence: { arrows: targets.map((square) => ({ from: actor, to: square })), highlights: [] },
      detail: `${pieceNameAt(after, actor)} on ${actor} forks ${formatSquareList(targets)}`
    };
    return [claim];
  }
};

function mostValuableTarget(targets: readonly Square[], valueOf: (square: Square) => number): Square | null {
  return [...targets].sort((left, right) => valueOf(right) - valueOf(left))[0] ?? null;
}

/** A fork wins the second-best piece, not the best: the opponent saves one
 * of the two. Capped at the forker's own value when the forker is worth
 * less than nothing else can be won — the verifier refines this with what
 * the line actually paid. */
function forkGain(targetValues: number[], forkerValue: number): number {
  const sorted = [...targetValues].sort((left, right) => right - left);
  const secondBest = sorted[1] ?? 0;
  return Math.max(secondBest, sorted[0] !== undefined && sorted[0] > forkerValue ? sorted[0] - forkerValue : 0);
}
