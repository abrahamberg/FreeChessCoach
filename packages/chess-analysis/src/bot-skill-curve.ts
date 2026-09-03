import { interpolateAnchors, type MovePhase } from '@freechesscoach/shared';

/**
 * Elo -> probability anchors, interpolated in logit space (see
 * `interpolateChance`) so intermediate elo values move smoothly and
 * monotonically between them instead of linearly. Anchors are the user's
 * own worked examples from the design conversation (docs/plan.md Phase
 * 62) plus one endpoint at the roster's elo ceiling (2300), chosen to land
 * near the roster's own already-authored top-tier middlegame values
 * (~0.86-0.89) rather than saturating all the way to 1.
 *
 * Supersedes Task 60.5's one-time linear formula
 * (`middlegame.bestMoveChance = clamp(1 - temperature * 1.4, ...)`), which
 * only ever ran once against the now-deleted `temperature` field to seed
 * the roster — this is a live function calibrated to real move-accuracy
 * rates instead of a value baked once into 30 roster entries.
 */
const BEST_MOVE_CHANCE_ANCHORS: ReadonlyArray<readonly [elo: number, chance: number]> = [
  [300, 0.05],
  [500, 0.6],
  [800, 0.8],
  [2300, 0.9]
];

/**
 * Probability, conditional on NOT playing the engine's own best move, that
 * the bot's actual pick manifests one of its documented diagnosis codes
 * (`bot-move-pick.ts`'s `pickBotMove`) rather than a generic
 * personality-weighted miss. The 2300 endpoint is near-zero mostly as a
 * matter of course: top-tier bots are documented with zero diagnosis codes
 * (Task 62.5), which makes this value moot for them regardless of what
 * it's set to.
 */
const DIAGNOSIS_MANIFEST_CHANCE_ANCHORS: ReadonlyArray<readonly [elo: number, chance: number]> = [
  [300, 0.95],
  [800, 0.3],
  [1200, 0.02],
  [2300, 0.005]
];

/**
 * Additive offsets on top of the middlegame base curve — mirrors Task
 * 60.5's original roster-regeneration formula (opening +0.15/endgame +0.25
 * over middlegame) as a live function instead of a value baked once into
 * the roster, so the shape ("a weak bot is relatively more competent once
 * material simplifies, so it doesn't shuffle forever in a king ending")
 * survives recalibration of the base curve itself.
 */
const PHASE_OFFSET: Record<MovePhase, number> = {
  opening: 0.15,
  middlegame: 0,
  endgame: 0.25
};

function logit(p: number): number {
  const clamped = Math.min(Math.max(p, 1e-4), 1 - 1e-4);
  return Math.log(clamped / (1 - clamped));
}

function invLogit(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * `elo -> probability` through `anchors`, via `interpolateAnchors`
 * (packages/shared) blending in logit space so the result is monotonic
 * between consecutive anchors (logit is monotonic in `p`, and a linear
 * interpolant between two logit values is monotonic) rather than the
 * visibly-kinked result plain linear interpolation in probability space
 * would give near 0/1. Elo outside the anchors' own range clamps to the
 * nearest anchor rather than extrapolating further.
 */
function interpolateChance(anchors: ReadonlyArray<readonly [number, number]>, elo: number): number {
  return interpolateAnchors(anchors, elo, (pLower, pUpper, t) => invLogit(logit(pLower) + t * (logit(pUpper) - logit(pLower))));
}

/**
 * Probability (per move) that a bot plays the engine's own top-ranked
 * candidate outright — see docs/plan.md Phase 62. Calibrated to how often
 * a player of a given rating actually finds the engine's top move in
 * reality, not a hand-picked per-bot constant.
 */
export function bestMoveChanceForElo(elo: number, phase: MovePhase): number {
  const base = interpolateChance(BEST_MOVE_CHANCE_ANCHORS, elo);
  return Math.min(Math.max(base + PHASE_OFFSET[phase], 0), 0.99);
}

/** See `DIAGNOSIS_MANIFEST_CHANCE_ANCHORS`. */
export function diagnosisManifestChanceForElo(elo: number): number {
  return interpolateChance(DIAGNOSIS_MANIFEST_CHANCE_ANCHORS, elo);
}
