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
    const held = pinnersHoldingBefore(ctx);
    const stillTheSamePinner = (hit: PinHit): boolean => {
      const before = held.get(pinKey(hit));
      if (!before) return false;
      // Either the pinner never moved, or it *is* the piece that just moved —
      // the case that reads as a discovery but is only a slide along the line
      // the pin already ran on.
      return before.has(hit.by) || (hit.by === ctx.destination && ctx.move !== null && before.has(ctx.move.from));
    };

    return ctx.facts.pinsAfter()
      .filter((hit) => after.get(hit.by)?.color === ctx.mover && !stillTheSamePinner(hit))
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
          // No possessive: this card is printed from both sides now — as the
          // chance the mover had, and as the thing their opponent's last move
          // handed over (`tactic-allowed.ts`) — so "their queen" named the
          // wrong side's piece on one of them.
          detail: absolute
            ? `the ${pieceNameAt(after, hit.pinned)} on ${hit.pinned} is stuck in front of the king`
            : `the ${pieceNameAt(after, hit.pinned)} on ${hit.pinned} can't move without losing the ${pieceNameAt(after, hit.against)} behind it`
        };
      });
  }
};

/** Which of the mover's pieces already pinned each pair before the move. */
function pinnersHoldingBefore(ctx: Parameters<TacticDetector['detect']>[0]): Map<string, Set<Square>> {
  const held = new Map<string, Set<Square>>();
  for (const hit of ctx.facts.pinsBefore()) {
    // Only the mover's own pinners: if this move captured the opponent's
    // pinner and took over its square, the pin that stood there was theirs,
    // and the one standing there now is a different piece doing a new thing.
    if (ctx.before.get(hit.by)?.color !== ctx.mover) continue;
    const key = pinKey(hit);
    const pinners = held.get(key) ?? new Set<Square>();
    pinners.add(hit.by);
    held.set(key, pinners);
  }
  return held;
}

/**
 * A pin's identity is the pair it immobilizes, deliberately not the square the
 * pinner sits on: only one line passes through two squares, so a pinner that
 * slides along it is still the same bind. Retreating a queen from d4 to d3
 * kept pinning d6 to d7 and was announced as a fresh pin both times, and the
 * same shape reached the opportunity scan as "a chance to pin" for a move that
 * changed nothing.
 *
 * The pair alone isn't enough to call it unchanged, though, which is why the
 * caller also asks *who* held it. Stepping one pinner off the line so a second
 * one takes over re-pins the same pair with a piece the victim may no longer
 * be able to capture — a real discovery, and two Lichess pin puzzles turn on
 * exactly it.
 */
function pinKey(hit: PinHit): string {
  return `${hit.pinned}:${hit.against}`;
}
