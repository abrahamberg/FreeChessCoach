import type { TacticMotifType } from '@freechesscoach/shared';
import { dedupeTacticClaims, type TacticClaim } from '../tactic-claim.js';
import { discoveredAttackDetector } from './discovered-attack.js';
import { discoveredCheckDetector } from './discovered-check.js';
import { doubleCheckDetector } from './double-check.js';
import { forkDetector } from './fork.js';
import { freePieceDetector } from './free-piece.js';
import { overloadedDefenderDetector } from './overloaded-defender.js';
import { pinDetector } from './pin.js';
import { removesDefenderDetector } from './removes-defender.js';
import { skewerDetector } from './skewer.js';
import { trappedPieceDetector } from './trapped-piece.js';
import { weakBackRankDetector } from './weak-back-rank.js';
import type { TacticDetectionContext } from './context.js';
import type { TacticDetector } from './types.js';

/**
 * Priority-ordered, but priority is no longer the decision: since
 * `docs/tactics-rework.md` §5 layer 3, every detector runs and the headline
 * is chosen from the *verified* claims by what they win. Order here is the
 * tie-breaker of last resort. Add a new tactic by adding one entry here (see
 * `README.md`) — never by editing the orchestrator.
 */
export const TACTIC_DETECTORS: TacticDetector[] = [
  doubleCheckDetector,
  discoveredCheckDetector,
  forkDetector,
  skewerDetector,
  pinDetector,
  discoveredAttackDetector,
  overloadedDefenderDetector,
  removesDefenderDetector,
  weakBackRankDetector,
  trappedPieceDetector,
  freePieceDetector
].sort((a, b) => a.priority - b.priority);

/** Every claim every detector proposes for this move, de-duplicated —
 * layer 1's whole output, before anything decides which are true. */
export function proposeTacticClaims(context: TacticDetectionContext): TacticClaim[] {
  return dedupeTacticClaims(TACTIC_DETECTORS.flatMap((detector) => detector.detect(context)));
}

/** The registry's own precedence, by motif, for the ranker's last-resort
 * tie-break. Derived from `TACTIC_DETECTORS` rather than hand-listed so a
 * new detector can't be forgotten here. */
export const TACTIC_DETECTOR_PRIORITY: Partial<Record<TacticMotifType, number>> = Object.fromEntries(
  TACTIC_DETECTORS.map((detector) => [detector.type, detector.priority])
);
