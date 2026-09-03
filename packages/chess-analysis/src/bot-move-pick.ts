import type { BotPersonality, DiagnosisCodeId, MovePhase, TacticMotifType } from '@freechesscoach/shared';
import { analyzeChecksCapturesThreats } from './checks-captures-threats.js';

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
   * `createsOpponentHangingPiece` split, docs/plan.md Phase 62). Personality
   * weighting below (`aggression`) rewards this; a self-blunder is instead
   * steered by `diagnosisCodes`/`pickBotMove`'s manifest roll. */
  createsOpponentHangingPiece: boolean;
  createsUnderDefendedPiece: boolean;
  mobilityDelta: number;
  /** From pv-tactics.ts's annotatePvTactics — first ply (within the
   * candidate's own PV) at which this line creates a fork of its own. */
  forkInPlies: number | null;
  /** Full tactic motif of playing this candidate right now — carried for
   * callers that want it (e.g. a richer coach digest); read by pickBotMove
   * only indirectly, via diagnosisCodes below. */
  motif: TacticMotifType | null;
  /** Every diagnosis code this candidate exhibits — `motif` resolved via
   * `diagnostics/motif-to-code.ts`'s `motifToCode` (`TA-*`) plus
   * `diagnostics/candidate-diagnosis-proxy.ts`'s `candidateDiagnosisCodes`
   * (`BV-*`/`MS-*`), see docs/plan.md's Phase 62. Empty, not null, when the
   * candidate exhibits none. pickBotMove (Phase 61/62) steers sampling
   * toward whichever candidates intersect the bot's own documented
   * `diagnosisCodes`. */
  diagnosisCodes: readonly DiagnosisCodeId[];
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

/** Minimum number of checks/captures/threat-replies required before the
 * middlegame plausible-move shortlist (see `buildPlausibleMoveShortlist`)
 * is trusted — below this, forcing-move coverage is too sparse to mean
 * anything and the full candidate field is used instead. */
const MIN_SHORTLIST_SIZE = 2;

/** Cap on the middlegame plausible-move shortlist size. */
const MAX_SHORTLIST_SIZE = 5;

export interface PickBotMoveInput {
  /** Engine-ranked candidates for the position — candidates[0] is the
   * engine's own top-scored line at whatever depth the caller searched.
   * Must be non-empty. */
  candidates: BotCandidate[];
  personality: BotPersonality;
  /** This phase's literal probability (0-1) of playing candidates[0]
   * outright, rolled once per move — see bot-skill-curve.ts's
   * `bestMoveChanceForElo`. */
  bestMoveChance: number;
  /** Floor probability (0-1) used instead of bestMoveChance specifically
   * when candidates[0] delivers/continues a forced mate — see
   * docs/plan.md's Phase 60 "checkmate-completion guarantee". */
  mateConversionChance: number;
  /** Probability, conditional on NOT playing candidates[0] (the roll
   * above missed), that the bot's pick is steered toward a candidate whose
   * `diagnosisCodes` intersect `diagnosisCodes` below, rather than a
   * generic personality-weighted miss — see bot-skill-curve.ts's
   * `diagnosisManifestChanceForElo` and docs/plan.md's Phase 62. */
  diagnosisManifestChance: number;
  /** This bot's documented diagnosis codes (Phase 61/62). */
  diagnosisCodes: readonly DiagnosisCodeId[];
  /** The position being played from — needed for the middlegame plausible-
   * move shortlist (checks/captures/threat-replies), see
   * `buildPlausibleMoveShortlist`. */
  fenBefore: string;
  /** The current game phase — the plausible-move shortlist only applies in
   * the middlegame (docs/plan.md Phase 62); opening is book-driven and
   * endgame's much smaller legal-move count makes "humans only consider
   * forcing moves" less meaningful. */
  phase: MovePhase;
  /** Injected randomness (real Math.random at the real call site) — kept
   * injectable so tests are deterministic. */
  random: () => number;
}

/**
 * Picks one candidate for a bot to play. Three rolls, in order:
 *
 * 1. `bestMoveChance` (boosted to `mateConversionChance` for a live mate) —
 *    hit plays the engine's own top-ranked candidate outright.
 * 2. On a miss, `diagnosisManifestChance` — hit samples (personality-
 *    weighted) only among candidates whose `diagnosisCodes` intersect this
 *    bot's own documented `diagnosisCodes`, i.e. a move that actually
 *    manifests one of its real weaknesses. Falls through to the generic
 *    pool when no candidate matches, so this roll can never dead-end.
 * 3. Otherwise, a generic personality-weighted sample.
 *
 * Rolls 2 and 3 both sample from a middlegame plausible-move shortlist
 * (`buildPlausibleMoveShortlist`) rather than the full candidate field —
 * humans don't weigh all ~40 legal moves, they narrow to what looks
 * forcing. See docs/plan.md's Phase 60 (original dice-roll model) and
 * Phase 62 (this steering/shortlist extension, which supersedes Phase 61's
 * `DIAGNOSED_BLIND_SPOT_CHANCE` dampening of roll 1 — that only ever
 * affected whether the best move got played, never which candidate a miss
 * actually chose).
 */
export function pickBotMove(input: PickBotMoveInput): BotCandidate {
  const { candidates, personality, bestMoveChance, mateConversionChance, diagnosisManifestChance, diagnosisCodes, fenBefore, phase, random } =
    input;
  if (candidates.length === 0) throw new Error('pickBotMove: no candidates to pick from');

  const best = candidates[0];
  if (!best) throw new Error('unreachable: candidates is non-empty');

  let bestChance = bestMoveChance;
  if (best.mateIn !== null && best.mateIn > 0) bestChance = Math.max(bestChance, mateConversionChance);
  if (random() < bestChance) return best;

  const pool = phase === 'middlegame' ? buildPlausibleMoveShortlist(candidates, fenBefore) : candidates;

  if (random() < diagnosisManifestChance) {
    const matching = pool.filter((candidate) => candidate.diagnosisCodes.some((code) => diagnosisCodes.includes(code)));
    if (matching.length > 0) return pickPersonalityWeightedMove(matching, personality, random);
  }

  return pickPersonalityWeightedMove(pool, personality, random);
}

/**
 * Narrows `candidates` to the ones a human would actually weigh — checks,
 * captures, and replies to one of the position's own threats (reusing
 * `analyzeChecksCapturesThreats`, a cheap pure-position function, no engine
 * call) — capped to `MAX_SHORTLIST_SIZE`. Below `MIN_SHORTLIST_SIZE`
 * qualifying candidates, the shortlist would be too sparse to mean
 * anything, so the full field is returned unchanged instead.
 *
 * When more than `MAX_SHORTLIST_SIZE` qualify, spreads the cap evenly
 * across the qualifying pool's index range rather than truncating to the
 * first N — `candidates` arrives pre-sorted by engine eval, so truncating
 * would just mean "the best forcing moves," which defeats the point: a
 * weak bot's shortlist isn't supposed to skew toward quality, only toward
 * plausibility of consideration.
 */
function buildPlausibleMoveShortlist(candidates: BotCandidate[], fenBefore: string): BotCandidate[] {
  const cct = analyzeChecksCapturesThreats(fenBefore);
  const plausibleSans = new Set([
    ...cct.checks.moves.map((move) => move.moveSan),
    ...cct.captures.moves.map((move) => move.moveSan),
    ...cct.threats.moves.map((move) => move.moveSan)
  ]);
  const qualifying = candidates.filter((candidate) => plausibleSans.has(candidate.moveSan));
  if (qualifying.length < MIN_SHORTLIST_SIZE) return candidates;
  if (qualifying.length <= MAX_SHORTLIST_SIZE) return qualifying;

  const step = (qualifying.length - 1) / (MAX_SHORTLIST_SIZE - 1);
  const picks = new Set(Array.from({ length: MAX_SHORTLIST_SIZE }, (_, i) => Math.round(i * step)));
  return qualifying.filter((_, index) => picks.has(index));
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
