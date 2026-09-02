import { CONFIG } from '../config.js';

/**
 * §4.5's four "was this find-able by a human" signals for one required
 * move, already reduced to plain numbers/booleans by the caller — this
 * module has no FEN/engine access of its own (see
 * `apps/api/src/services/diagnostic-reachability.ts` for the optional,
 * engine-backed refinement Task 54.1 also calls for).
 */
export interface HumanReachabilityInput {
  /** 0-indexed multiPv rank of the required move among the engine's
   * candidate lines at this position — 0 is the engine's own top choice. */
  rank: number;
  /** Whether the required move is a check, capture, or checkmate — forcing
   * moves narrow a human's search dramatically compared to a quiet one. */
  isForcing: boolean;
  /** Number of plies in the line the student must see through to cash in
   * (`bestLinePvSan.length`) — shorter lines are more reachable. */
  solutionPlies: number;
  /** SEE value (centipawns, mover's perspective) of what the required move
   * wins on its destination square; 0 when it isn't a capture or nets
   * nothing. A large, obvious material gain is easier to spot than a move
   * whose point is purely positional. */
  seeGain: number;
}

/**
 * §4.5 human-reachability score in `[0, 1]`. Purely a blend of the four
 * inputs above — under-counting (scoring an obscure engine-only move near
 * 0) is the safe failure mode per §4.4, so each sub-score saturates at its
 * most-favorable input rather than rewarding partial credit unevenly.
 */
export function computeHumanReachability(input: HumanReachabilityInput): number {
  const { rankWeight, forcingWeight, lengthWeight, seeWeight, seeGainScale } = CONFIG.humanReachability;

  const rankScore = 1 / (1 + Math.max(0, input.rank));
  const forcingScore = input.isForcing ? 1 : 0;
  const lengthScore = 1 / Math.max(1, input.solutionPlies);
  const seeScore = Math.min(1, Math.max(0, input.seeGain) / seeGainScale);

  const score = rankWeight * rankScore + forcingWeight * forcingScore + lengthWeight * lengthScore + seeWeight * seeScore;
  return Math.min(1, Math.max(0, score));
}

/** §II.A's DQ-05 gate: does this score clear the bar for "human-reachable
 * at the student's level" — below it, the opportunity is engine-only and
 * must not be reported as a student failure (§4.4). */
export function isHumanReachable(score: number): boolean {
  return score >= CONFIG.humanReachability.dq05Threshold;
}
