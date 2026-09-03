import type { BotPersonality, TacticMotifType } from '@freechesscoach/shared';

export interface BotCandidate {
  moveSan: string;
  /** Mover-relative: positive = good for the side about to move. NOT
   * White-perspective like EngineLine.cp/mateIn — see bot-candidates.ts
   * (apps/api), which builds these by flipping sign when the side to move
   * is black. */
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
   * pickBotMove below, which reacts only to the booleans above. */
  motif: TacticMotifType | null;
}

/** Named, tunable weights for each personality term in
 * pickPersonalityWeightedMove — one place to adjust bot "feel" rather than
 * inline magic numbers. Unlike the score-blend model this replaced, these
 * are literal selection weights (how much more likely a candidate is to be
 * DRAWN), not additive bonuses on top of an engine-score base — the "miss"
 * branch never looks at cp/mateIn at all. */
export const BOT_PICK_WEIGHTS = {
  floor: 0.05,
  aggressionHangingPiece: 0.6,
  aggressionMobilityPerMove: 0.2,
  aggressionMobilityCap: 4,
  trapSeekingFork: 0.8,
  trapSeekingForkInPliesBonus: 1,
  defensivenessUnderDefendedPenalty: 0.6,
  defensivenessQuietMoveBonus: 0.2
} as const;

export interface PickBotMoveInput {
  /** Engine-ranked candidates for the position — candidates[0] is the
   * engine's own top-scored line at whatever depth the caller searched.
   * Must be non-empty. */
  candidates: BotCandidate[];
  personality: BotPersonality;
  /** This phase's literal probability (0-1) of playing candidates[0]
   * outright, rolled once per move. */
  bestMoveChance: number;
  /** Floor probability (0-1) used instead of bestMoveChance specifically
   * when candidates[0] delivers/continues a forced mate — see
   * docs/plan.md's Phase 60 "checkmate-completion guarantee". */
  mateConversionChance: number;
  /** Injected randomness (real Math.random at the real call site) — kept
   * injectable so tests are deterministic. */
  random: () => number;
}

/**
 * Picks one candidate for a bot to play: a single dice roll decides whether
 * the bot plays the engine's own top-ranked candidate outright, or defers to
 * a personality-weighted pick from the *full* candidate field (see
 * bot-candidates.ts's BOT_CANDIDATE_BREADTH — the pool this samples from is
 * wide enough to contain genuinely bad moves, not just engine-approved
 * lines). This is a full replacement of the old score-then-softmax model,
 * not a blend with it — the "miss" branch never reads cp/mateIn.
 */
export function pickBotMove(input: PickBotMoveInput): BotCandidate {
  const { candidates, personality, bestMoveChance, mateConversionChance, random } = input;
  if (candidates.length === 0) throw new Error('pickBotMove: no candidates to pick from');

  const best = candidates[0];
  if (!best) throw new Error('unreachable: candidates is non-empty');

  const chance = best.mateIn !== null && best.mateIn > 0 ? Math.max(bestMoveChance, mateConversionChance) : bestMoveChance;
  if (random() < chance) return best;

  return pickPersonalityWeightedMove(candidates, personality, random);
}

function pickPersonalityWeightedMove(
  candidates: BotCandidate[],
  personality: BotPersonality,
  random: () => number
): BotCandidate {
  const weights = candidates.map((candidate) => personalityWeight(candidate, personality));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const target = random() * total;

  let cumulative = 0;
  for (const [index, candidate] of candidates.entries()) {
    cumulative += weights[index] ?? 0;
    if (target < cumulative) return candidate;
  }

  const fallback = candidates.at(-1);
  if (!fallback) throw new Error('unreachable: candidates is non-empty');
  return fallback;
}

function personalityWeight(candidate: BotCandidate, personality: BotPersonality): number {
  const w = BOT_PICK_WEIGHTS;

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

  return Math.max(w.floor, w.floor + aggression + trapSeeking + defensiveness);
}
