import type { TacticMotifType } from '@freechesscoach/shared';
import type { TacticClaim } from '../tactic-claim.js';
import type { TacticDetectionContext } from './context.js';

/**
 * One motif's detection logic, in its own file. `checkmate` and
 * `brilliantSacrifice` are NOT detectors — they're answerable straight from
 * the raw `TacticMotifContext` (see classify-tactic-motif.ts's pre-checks),
 * and `other` is that function's own catch-all, so only motifs that need the
 * replay/AttackMap context belong in the registry.
 *
 * `detect` returns **claims, not a verdict** (`docs/tactics-rework.md` §5
 * layer 1). Detectors should over-propose: a claim carries the concrete
 * squares that make it checkable, and `verify-tactic-claims.ts` is what
 * decides which survive. A detector that hedges hides a real tactic from the
 * verifier; a detector that over-proposes only costs the verifier a test.
 */
export interface TacticDetector {
  type: Exclude<TacticMotifType, 'checkmate' | 'brilliantSacrifice' | 'other'>;
  /** Ascending = checked first. Demoted by §5 layer 3 from "the decision" to
   * a tie-breaker of last resort: the headline is chosen by verified gain
   * and confidence, and this only separates two claims that are otherwise
   * indistinguishable. Left with gaps of 10 so a future tactic can be
   * inserted between two existing ones without renumbering everything. */
  priority: number;
  detect(context: TacticDetectionContext): TacticClaim[];
}

/** The single-claim shape most detectors return, or `[]`. */
export function claimsOf(claim: TacticClaim | null): TacticClaim[] {
  return claim ? [claim] : [];
}
