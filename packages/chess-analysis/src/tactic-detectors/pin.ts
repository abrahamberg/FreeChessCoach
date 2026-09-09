import type { Square } from 'chess.js';
import type { PinHit } from '../tactic-pins.js';
import { pieceNameAt, pieceTypeAt } from '../tactic-board-facts.js';
import type { TacticClaim } from '../tactic-claim.js';
import type { TacticDetector } from './types.js';

/**
 * A pin this move created — by landing the pinning piece, or by stepping
 * something out of an existing slider's way.
 *
 * Move-scoped by diffing the position's pins rather than by asking whether
 * the pinner sits on the destination square, which is what the shipped
 * detector did: that misses every discovered pin, and it also credits a pin
 * that was already on the board before the move.
 *
 * `targets` is `[pinned, against]` in that order, which is what lets the
 * verifier tell an absolute pin from a relative one without re-walking the
 * ray. The gain is positional — a pin that also wins the piece produces a
 * separate `freePiece` or `fork` claim, and the ranker picks between them.
 */
export const pinDetector: TacticDetector = {
  type: 'pin',
  priority: 20,
  detect: (ctx) => {
    if (!ctx.after || !ctx.destination) return [];
    const after = ctx.after;
    const existing = new Set(ctx.facts.pinsBefore().map(pinKey));

    return ctx.facts.pinsAfter()
      .filter((hit) => after.get(hit.by)?.color === ctx.mover && !existing.has(pinKey(hit)))
      .map((hit): TacticClaim => {
        const absolute = pieceTypeAt(after, hit.against) === 'k';
        return {
          type: 'pin',
          actor: hit.by,
          targets: [hit.pinned, hit.against],
          victim: null,
          gainKind: 'positional',
          expectedGain: 0,
          prize: null,
          evidence: { arrows: [{ from: hit.by, to: hit.against }], highlights: [hit.pinned] },
          detail: absolute
            ? `their ${pieceNameAt(after, hit.pinned)} on ${hit.pinned} is stuck in front of the king`
            : `their ${pieceNameAt(after, hit.pinned)} on ${hit.pinned} can't move without losing the ${pieceNameAt(after, hit.against)} behind it`
        };
      });
  }
};

function pinKey(hit: PinHit): string {
  return `${hit.by}:${hit.pinned}:${hit.against}`;
}

/** Re-exported so the defensive family can ask the same question of the
 * position before a move: `breaksPin` is "one of these is gone now". */
export function pinsOnSquare(hits: readonly PinHit[], square: Square): PinHit[] {
  return hits.filter((hit) => hit.pinned === square);
}
