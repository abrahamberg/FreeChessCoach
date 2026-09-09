import type { TacticMotifType } from '@freechesscoach/shared';
import { dedupeTacticClaims, type TacticClaim } from '../tactic-claim.js';
import { attractionSacDetector, decoyDetector } from './decoy.js';
import { blocksThreatDetector } from './blocks-threat.js';
import { breaksPinDetector } from './breaks-pin.js';
import { clearanceDetector } from './clearance.js';
import { counterAttackDetector } from './counter-attack.js';
import { deflectionDetector } from './deflection.js';
import { defendsHangingPieceDetector } from './defends-hanging-piece.js';
import { desperadoDetector } from './desperado.js';
import { developsDetector } from './develops.js';
import { discoveredAttackDetector } from './discovered-attack.js';
import { discoveredCheckDetector } from './discovered-check.js';
import { doubleCheckDetector } from './double-check.js';
import { escapesForkDetector } from './escapes-fork.js';
import { favourableTradeDetector, improvesWorstPieceDetector, spaceGainDetector } from './space-and-trades.js';
import { forkDetector } from './fork.js';
import { freePieceDetector } from './free-piece.js';
import { gainsTempoDetector } from './gains-tempo.js';
import { interferenceDetector } from './interference.js';
import { kingSafetyDetector } from './king-safety.js';
import { matingNetDetector, smotheredMateDetector } from './mating-patterns.js';
import { outpostDetector, seizesOpenFileDetector } from './positional-squares.js';
import { overloadedDefenderDetector } from './overloaded-defender.js';
import { pawnBreakthroughDetector, promotionTacticDetector, underPromotionDetector } from './promotion.js';
import { perpetualCheckDetector } from './perpetual-check.js';
import { pinDetector } from './pin.js';
import { preparesBreakDetector } from './prepares-break.js';
import { prophylaxisDetector } from './prophylaxis.js';
import { removesDefenderDetector } from './removes-defender.js';
import { removesTargetDetector } from './removes-target.js';
import { simplifiesToDrawDetector, stalemateResourceDetector } from './draw-resources.js';
import { skewerDetector } from './skewer.js';
import { trappedPieceDetector } from './trapped-piece.js';
import { weakBackRankDetector } from './weak-back-rank.js';
import { windmillDetector } from './windmill.js';
import { xRayAttackDetector } from './x-ray-attack.js';
import { zwischenzugDetector } from './zwischenzug.js';
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
  // Offensive — something done to the opponent.
  smotheredMateDetector,
  matingNetDetector,
  doubleCheckDetector,
  discoveredCheckDetector,
  windmillDetector,
  forkDetector,
  underPromotionDetector,
  promotionTacticDetector,
  skewerDetector,
  pinDetector,
  discoveredAttackDetector,
  overloadedDefenderDetector,
  deflectionDetector,
  interferenceDetector,
  removesDefenderDetector,
  zwischenzugDetector,
  attractionSacDetector,
  decoyDetector,
  weakBackRankDetector,
  trappedPieceDetector,
  desperadoDetector,
  freePieceDetector,
  xRayAttackDetector,
  clearanceDetector,
  // Defensive and prophylactic — something the opponent no longer gets to do.
  breaksPinDetector,
  escapesForkDetector,
  defendsHangingPieceDetector,
  removesTargetDetector,
  blocksThreatDetector,
  counterAttackDetector,
  stalemateResourceDetector,
  perpetualCheckDetector,
  simplifiesToDrawDetector,
  prophylaxisDetector,
  pawnBreakthroughDetector,
  // Positional — so a quiet move isn't silence.
  outpostDetector,
  gainsTempoDetector,
  seizesOpenFileDetector,
  developsDetector,
  kingSafetyDetector,
  spaceGainDetector,
  favourableTradeDetector,
  improvesWorstPieceDetector,
  preparesBreakDetector
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
