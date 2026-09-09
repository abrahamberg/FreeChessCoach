import type { Square } from 'chess.js';
import type { TacticGainKind } from './tactic-claim.js';
import { TACTIC_DETECTOR_PRIORITY } from './tactic-detectors/registry.js';
import type { VerifiedTacticClaim } from './verify-tactic-claims.js';

/**
 * How much a claim's *kind* of payoff is worth before its size is counted.
 * Mate ends the game, material is the thing a 1200-rated reader can act on,
 * a tempo and a bind are real but softer, and a defensive save only leads
 * the card when nothing was won.
 */
const GAIN_KIND_WEIGHT: Record<TacticGainKind, number> = {
  mate: 12,
  material: 8,
  tempo: 5,
  safety: 4.5,
  positional: 3
};

/**
 * Layer 3 of `docs/tactics-rework.md` §5. Every verified claim stays on the
 * move — a knight fork that is also a discovered attack is both, and the
 * coach agent gets both to reason with. This only decides which one *leads*
 * the card, and it decides it by what the claim wins rather than by where
 * its detector happens to sit in an array.
 *
 * The shipped classifier returned the first match of a fixed priority list,
 * which `docs/tactics-rework.md` §2 measured as throwing away up to 20 of 40
 * puzzles per Lichess theme: `forkDetector` sat at priority 10 with a loose
 * definition and silently ate every motif below it.
 */
export function rankTacticClaims(claims: readonly VerifiedTacticClaim[], movedTo: Square | null = null): VerifiedTacticClaim[] {
  const ranked = [...claims].sort((left, right) => {
    const byScore = claimScore(right) - claimScore(left);
    if (Math.abs(byScore) > 1e-9) return byScore;
    return detectorPriority(left) - detectorPriority(right);
  });
  return dropSubsumedClaims(ranked, movedTo);
}

/**
 * A move that wins material or forces mate does not also get a card for
 * having stepped out of something.
 *
 * The claims are all true — a piece that moves to deliver a discovered
 * attack really does leave whatever was pinning it — but they describe the
 * same event twice, and a review that says both reads like a log rather than
 * a coach. Only claims whose actor is the piece that just moved are dropped:
 * a defensive claim about a *different* piece is genuinely a second thing the
 * move did.
 */
function dropSubsumedClaims(ranked: readonly VerifiedTacticClaim[], movedTo: Square | null): VerifiedTacticClaim[] {
  const headline = ranked[0];
  if (!headline || movedTo === null) return [...ranked];
  if (headline.gainKind !== 'material' && headline.gainKind !== 'mate') return [...ranked];

  return ranked.filter((claim) => claim === headline || claim.gainKind !== 'safety' || claim.actor !== movedTo);
}

export function headlineTacticClaim(claims: readonly VerifiedTacticClaim[], movedTo: Square | null = null): VerifiedTacticClaim | null {
  return rankTacticClaims(claims, movedTo)[0] ?? null;
}

/** Kind first, then size, then how sure we are — a confidently verified pawn
 * beats a speculative rook. */
export function claimScore(claim: VerifiedTacticClaim): number {
  return (GAIN_KIND_WEIGHT[claim.gainKind] + claim.verifiedGain) * claim.confidence;
}

function detectorPriority(claim: VerifiedTacticClaim): number {
  return TACTIC_DETECTOR_PRIORITY[claim.type] ?? Number.MAX_SAFE_INTEGER;
}
