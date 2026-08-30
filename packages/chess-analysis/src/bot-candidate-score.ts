import type { BotPersonality, TacticMotifType } from '@freechesscoach/shared';
import { toCpWhite, winPctWhite } from './win-probability.js';

export interface BotCandidate {
  moveSan: string;
  /** Mover-relative: positive = good for the side about to move. NOT
   * White-perspective like EngineLine.cp/mateIn — a caller building these
   * from engine output must flip sign when the side to move is black (the
   * engine's own lines are already White-perspective, see uci.ts's
   * recordInfoLine). Reusing win-probability.ts's toCpWhite/winPctWhite here
   * relies on exactly this being mover-relative: "as if White" is correct
   * precisely because positive-is-good-for-the-mover is what those two
   * functions already assume of a White-perspective score. */
  cp: number | null;
  mateIn: number | null;
  createsFork: boolean;
  createsHangingPiece: boolean;
  createsUnderDefendedPiece: boolean;
  mobilityDelta: number;
  /** From pv-tactics.ts's annotatePvTactics — first ply (within the
   * candidate's own PV) at which this line creates a fork of its own. */
  forkInPlies: number | null;
  /** Full tactic motif of playing this candidate right now — carried for
   * callers that want it (e.g. a richer coach digest); NOT read by
   * scoreBotCandidates below, which still scores purely off the booleans
   * above. Reacting to specific motifs (pins, discovered attacks, ...) in
   * bot personality scoring is a deliberately separate future decision. */
  motif: TacticMotifType | null;
}

export interface ScoredBotCandidate extends BotCandidate {
  score: number;
}

/** Named, tunable weights for each personality term — see scoreBotCandidates.
 * Kept as one place to adjust bot "feel" rather than inline magic numbers. */
export const BOT_SCORE_WEIGHTS = {
  aggressionHangingPiece: 0.15,
  aggressionMobilityPerMove: 0.05,
  aggressionMobilityCap: 4,
  trapSeekingFork: 0.2,
  trapSeekingForkInPliesBonus: 0.25,
  defensivenessUnderDefendedPenalty: 0.15,
  defensivenessQuietMoveBonus: 0.05
} as const;

/** Floor for sampleBotMove's temperature divisor — avoids a divide-by-zero
 * (and the resulting NaN/Infinity softmax) at temperature 0 while still
 * making temperature 0 behave as "always play the top-scored candidate"
 * (the softmax becomes so peaked the top score dominates completely). */
const MIN_TEMPERATURE = 0.05;

/**
 * Scores each candidate for one bot's personality: score = baseScore (the
 * engine's own win-probability curve, so personality can reorder *close*
 * candidates but never makes a losing move outscore a winning one — this is
 * what keeps "aggressive" from meaning "random blunder") + personalityBonus
 * (aggression rewards leaving pieces hanging/gaining mobility; trapSeeking
 * rewards creating a fork now or a few of the bot's own moves out;
 * defensiveness penalizes leaving a piece under-defended and mildly favors
 * quiet, mobility-preserving moves).
 */
export function scoreBotCandidates(candidates: BotCandidate[], personality: BotPersonality): ScoredBotCandidate[] {
  return candidates.map((candidate) => ({
    ...candidate,
    score: baseScore(candidate) + personalityBonus(candidate, personality)
  }));
}

function baseScore(candidate: Pick<BotCandidate, 'cp' | 'mateIn'>): number {
  return winPctWhite(toCpWhite({ cp: candidate.cp, mateIn: candidate.mateIn })) / 100;
}

function personalityBonus(candidate: BotCandidate, personality: BotPersonality): number {
  const w = BOT_SCORE_WEIGHTS;

  const aggression =
    (personality.aggression / 100) *
    ((candidate.createsHangingPiece ? w.aggressionHangingPiece : 0) +
      (candidate.mobilityDelta > 0
        ? w.aggressionMobilityPerMove * Math.min(candidate.mobilityDelta, w.aggressionMobilityCap)
        : 0));

  const trapSeeking =
    (personality.trapSeeking / 100) *
    ((candidate.createsFork ? w.trapSeekingFork : 0) +
      (candidate.forkInPlies !== null ? w.trapSeekingForkInPliesBonus / candidate.forkInPlies : 0));

  const defensiveness =
    (personality.defensiveness / 100) *
    ((candidate.createsUnderDefendedPiece ? -w.defensivenessUnderDefendedPenalty : 0) +
      (candidate.mobilityDelta < 0 ? 0 : w.defensivenessQuietMoveBonus));

  return aggression + trapSeeking + defensiveness;
}

/**
 * Samples one candidate via softmax over score/temperature, using an
 * *injected* random source (a value in [0,1), e.g. Math.random at the real
 * call site) rather than calling Math.random directly — keeps this module
 * pure/deterministic-under-test. temperature -> 0 collapses to always
 * playing the top-scored candidate; temperature -> 1 flattens toward
 * uniform. Because the caller wires in real randomness per call (not a seed
 * per game), identical bot config + identical position still samples
 * differently across games.
 */
export function sampleBotMove(
  scored: ScoredBotCandidate[],
  temperature: number,
  random: () => number
): ScoredBotCandidate {
  if (scored.length === 0) throw new Error('sampleBotMove: no candidates to sample from');

  const effectiveTemperature = Math.max(temperature, MIN_TEMPERATURE);
  const weights = scored.map((candidate) => Math.exp(candidate.score / effectiveTemperature));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const target = random() * total;

  let cumulative = 0;
  for (const [index, candidate] of scored.entries()) {
    cumulative += weights[index] ?? 0;
    if (target < cumulative) return candidate;
  }

  const fallback = scored.at(-1);
  if (!fallback) throw new Error('unreachable: scored is non-empty');
  return fallback;
}
