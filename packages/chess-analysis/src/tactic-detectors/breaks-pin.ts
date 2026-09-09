import { pieceNameAt } from '../tactic-board-facts.js';
import type { PinHit } from '../tactic-pins.js';
import type { TacticClaim } from '../tactic-claim.js';
import type { TacticDetector } from './types.js';

/**
 * One of the mover's pieces was pinned before this move, and isn't now.
 *
 * The move that most deserved a note in the reported game got the empty state
 * (TR-02, `4…Bd7`): every shipped motif described something done *to* the
 * opponent, so there was no word for unpinning. The whole defensive family
 * falls out of comparing the same board facts before and after the move
 * rather than only after it.
 */
export const breaksPinDetector: TacticDetector = {
  type: 'breaksPin',
  priority: 70,
  detect: (ctx) => {
    if (!ctx.after || !ctx.destination) return [];
    const remaining = new Set(ctx.facts.pinsAfter().map(pinKey));

    return ctx.facts.pinsBefore()
      .filter((hit) => ctx.before.get(hit.by)?.color === ctx.opponent && ctx.before.get(hit.pinned)?.color === ctx.mover)
      .filter((hit) => !remaining.has(pinKey(hit)))
      // Taking the pinner isn't breaking the pin, it's taking a piece — and
      // the capture has its own card. Without this every recapture in the
      // game "breaks a pin".
      .filter((hit) => hit.by !== ctx.destination)
      .map((hit): TacticClaim => ({
        type: 'breaksPin',
        actor: ctx.destination!,
        targets: [hit.pinned],
        victim: null,
        gainKind: 'safety',
        expectedGain: 0,
        prize: null,
        evidence: { arrows: [{ from: hit.by, to: hit.pinned }], highlights: [hit.pinned] },
        detail: `their ${pieceNameAt(ctx.before, hit.pinned)} on ${hit.pinned} can move again`
      }));
  }
};

function pinKey(hit: PinHit): string {
  return `${hit.by}:${hit.pinned}:${hit.against}`;
}
