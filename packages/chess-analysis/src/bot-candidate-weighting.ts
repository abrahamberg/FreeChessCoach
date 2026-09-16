import type { BotPersonality, DiagnosisCodeId, TacticMotifType } from '@freechesscoach/shared';

export interface BotCandidate {
  moveSan: string;
  /** Mover-relative: positive = good for the side about to move. NOT
   * White-perspective like EngineLine.cp/mateIn — see bot-candidates.ts
   * (apps/api), which builds these by flipping sign when the side to move
   * is black. */
  cp: number | null;
  mateIn: number | null;
  createsFork: boolean;
  /** Whether this candidate creates a new hanging piece for the
   * *opponent* specifically — a genuine attacking threat, not the mover's
   * own blunder (see candidate-moves.ts's `createsOwnHangingPiece` /
   * `createsOpponentHangingPiece` split). Personality weighting below
   * (`aggression`) rewards this; a self-blunder is instead steered by
   * bot-mistake-pool.ts's TTC-based pool. */
  createsOpponentHangingPiece: boolean;
  createsUnderDefendedPiece: boolean;
  mobilityDelta: number;
  /** From pv-tactics.ts's annotatePvTactics — first ply (within the
   * candidate's own PV) at which this line creates a fork of its own. */
  forkInPlies: number | null;
  /** Full tactic motif of playing this candidate right now — carried for
   * callers that want it (e.g. a richer coach digest); read by
   * bot-move-pick.ts's pickBotMove only indirectly, via diagnosisCodes
   * below. */
  motif: TacticMotifType | null;
  /** Every diagnosis code this candidate exhibits — `motif` resolved via
   * `diagnostics/motif-to-code.ts`'s `motifToCode` (`TA-*`) plus
   * `diagnostics/candidate-diagnosis-proxy.ts`'s `candidateDiagnosisCodes`
   * (`BV-*`/`MS-*`). Empty, not null, when the candidate exhibits none.
   * bot-mistake-pool.ts's pickTacticalMistake steers its own pick toward
   * whichever candidates intersect the bot's own documented
   * `diagnosisCodes`. */
  diagnosisCodes: readonly DiagnosisCodeId[];
}

/** Named, tunable weights for each personality term in
 * pickPersonalityWeightedMove — one place to adjust bot "feel" rather than
 * inline magic numbers. These are literal selection weights (how much more
 * likely a candidate is to be DRAWN), not additive bonuses on top of an
 * engine-score base. */
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

/**
 * Weighted-random pick from `candidates` using this bot's `personality` —
 * shared by bot-move-pick.ts (picking among the engine's own other top-5
 * lines) and bot-mistake-pool.ts (picking among the TTC-derived
 * mistake/blunder pool). Injected `random` for determinism in tests.
 */
export function pickPersonalityWeightedMove(
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
    ((candidate.createsOpponentHangingPiece ? w.aggressionHangingPiece : 0) +
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
