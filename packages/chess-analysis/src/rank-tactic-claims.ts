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
export function rankTacticClaims(claims: readonly VerifiedTacticClaim[]): VerifiedTacticClaim[] {
  return [...claims].sort((left, right) => {
    const byScore = claimScore(right) - claimScore(left);
    if (Math.abs(byScore) > 1e-9) return byScore;
    return detectorPriority(left) - detectorPriority(right);
  });
}

export function headlineTacticClaim(claims: readonly VerifiedTacticClaim[]): VerifiedTacticClaim | null {
  return rankTacticClaims(claims)[0] ?? null;
}

/** Kind first, then size, then how sure we are — a confidently verified pawn
 * beats a speculative rook. */
export function claimScore(claim: VerifiedTacticClaim): number {
  return (GAIN_KIND_WEIGHT[claim.gainKind] + claim.verifiedGain) * claim.confidence;
}

function detectorPriority(claim: VerifiedTacticClaim): number {
  return TACTIC_DETECTOR_PRIORITY[claim.type] ?? Number.MAX_SAFE_INTEGER;
}
