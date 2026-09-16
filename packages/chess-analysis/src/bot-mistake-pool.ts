import { Chess } from 'chess.js';
import type { BotPersonality, DiagnosisCodeId } from '@freechesscoach/shared';
import type { BotCandidate } from './bot-candidate-weighting.js';
import { pickPersonalityWeightedMove } from './bot-candidate-weighting.js';
import { analyzeChecksCapturesThreats } from './checks-captures-threats.js';

/** Cap on the TTC-ranked candidate pool before sampling down further — see
 * `buildTtcPool`'s doc comment. */
const POOL_SIZE = 10;

/** How many of `buildTtcPool`'s top-ranked candidates a personality-weighted
 * sample is drawn from before the final tactical-mistake/blunder pick. */
const SAMPLE_SIZE = 5;

const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** Priority bonus for a candidate that's one of the position's own
 * checks/captures/threats (offensive TTC) — set above the maximum single
 * piece value (queen = 9) so this pool is dominated by "plausible to
 * consider" (a human always notices "I can check/capture/threaten" first),
 * with defensive exposure only breaking ties among equally-plausible
 * candidates rather than ever displacing offensive relevance outright. */
const OFFENSIVE_TTC_PRIORITY = 10;

/** A candidate's net "score" for ranking purposes, treating a live mate as
 * saturating far past any material cp value — used both to find the
 * strongest fallback pick (pickTacticalMistake) and the weakest one
 * (pickBlunder) within a sample. */
function candidateScore(candidate: BotCandidate): number {
  if (candidate.mateIn !== null) return candidate.mateIn > 0 ? 100_000 : -100_000;
  return candidate.cp ?? 0;
}

/** How many cp worse than the engine's own best move (`candidates[0]`)
 * `candidate` actually is — the TTC pool ranks by tactical plausibility
 * only (offensive/defensive), never by eval, so nothing about it guarantees
 * a "plausible" pick is actually worse than best; this is the real check
 * against the engine that both pickTacticalMistake and pickBlunder need
 * before calling something a mistake or a blunder. */
function cpLossFromBest(best: BotCandidate, candidate: BotCandidate): number {
  return candidateScore(best) - candidateScore(candidate);
}

/** Below this cp loss from the engine's own best move, a TTC-plausible
 * candidate is still "between good moves" — a fine alternative, not a real
 * tactical mistake. Roughly: gives away a meaningful chunk of an
 * advantage, short of losing real material outright. */
const TACTICAL_MISTAKE_MIN_CP_LOSS = 80;

/** Below this cp loss, a candidate isn't a real blunder yet — roughly "at
 * least gives up a minor piece for nothing," not just a slightly
 * suboptimal move. */
const BLUNDER_MIN_CP_LOSS = 250;

/** Applies `moveSan` to `fenBefore` and returns the resulting FEN, or null
 * for an illegal/unparseable SAN (chess.js throws rather than returning
 * null for one) — defensive only; every `moveSan` here comes from the
 * engine's own candidate list for this exact position, so this should
 * never actually miss in production. */
function fenAfterMove(fenBefore: string, moveSan: string): string | null {
  try {
    const chess = new Chess(fenBefore);
    chess.move(moveSan);
    return chess.fen();
  } catch {
    return null;
  }
}

/** Total material value of everything the opponent could capture from us
 * immediately after playing `candidate` — the "defensive TTC" half of the
 * spec (what the opponent's own checks/captures/threats look like against
 * the position this candidate leaves behind), reusing
 * `analyzeChecksCapturesThreats` on the after-position rather than
 * inventing a second exposure metric. 0 for a candidate whose SAN doesn't
 * parse (see fenAfterMove) or that leaves nothing capturable. */
function defensiveExposure(fenBefore: string, candidate: BotCandidate): number {
  const after = fenAfterMove(fenBefore, candidate.moveSan);
  if (!after) return 0;
  const opponentCct = analyzeChecksCapturesThreats(after);
  return opponentCct.captures.moves.reduce((sum, move) => sum + (PIECE_VALUES[move.capturedPiece] ?? 0), 0);
}

/**
 * Ranks all legal `candidates` by TTC plausibility — offensive presence
 * (this candidate is one of our own checks/captures/threats,
 * `analyzeChecksCapturesThreats(fenBefore)`, the same primitive
 * `buildPlausibleMoveShortlist` used before this file existed) plus
 * defensive severity (how much this candidate exposes us to the opponent's
 * own checks/captures/threats afterward, `defensiveExposure`) — caps to the
 * top `POOL_SIZE`, then samples down to `SAMPLE_SIZE` via personality
 * weighting. This is the shared shape both pickTacticalMistake and
 * pickBlunder draw their final pick from; only the final selection differs
 * between the two.
 */
function sampleTtcPool(candidates: BotCandidate[], fenBefore: string, personality: BotPersonality, random: () => number): BotCandidate[] {
  const offensive = analyzeChecksCapturesThreats(fenBefore);
  const offensiveSans = new Set([
    ...offensive.checks.moves.map((move) => move.moveSan),
    ...offensive.captures.moves.map((move) => move.moveSan),
    ...offensive.threats.moves.map((move) => move.moveSan)
  ]);

  const ranked = candidates
    .map((candidate) => ({
      candidate,
      priority: (offensiveSans.has(candidate.moveSan) ? OFFENSIVE_TTC_PRIORITY : 0) + defensiveExposure(fenBefore, candidate)
    }))
    .sort((a, b) => b.priority - a.priority)
    .slice(0, POOL_SIZE)
    .map((entry) => entry.candidate);

  if (ranked.length <= SAMPLE_SIZE) return ranked;

  const sample: BotCandidate[] = [];
  const remaining = [...ranked];
  for (let i = 0; i < SAMPLE_SIZE && remaining.length > 0; i++) {
    const picked = pickPersonalityWeightedMove(remaining, personality, random);
    sample.push(picked);
    remaining.splice(remaining.indexOf(picked), 1);
  }
  return sample;
}

/**
 * The %A-miss / %C-miss branch: a tactical mistake rather than a blunder.
 * Samples the TTC pool (`sampleTtcPool` — tactical plausibility only, never
 * engine eval), then checks each sampled candidate against the engine
 * (`cpLossFromBest`) so the final pick is never "between good moves": only
 * candidates that actually lose at least TACTICAL_MISTAKE_MIN_CP_LOSS
 * relative to the engine's own best move (`candidates[0]`) are eligible.
 * Among those, prefers whichever exhibits one of this bot's own documented
 * `diagnosisCodes` (mirrors the old `diagnosisManifestChance` matching
 * logic, now unconditional within this branch rather than a separate
 * roll); with no diagnosis match, falls back to the mildest genuine mistake
 * available (least cp loss that still clears the floor) rather than the
 * single strongest candidate in the sample — picking the strongest is
 * exactly what let a "mistake" occasionally turn out to be a perfectly
 * good move. If nothing in the sample clears the floor at all (rare — a
 * position where even every TTC-plausible move is still fine), falls back
 * to the sample's own worst-scoring candidate as a last resort rather than
 * failing outright.
 */
export function pickTacticalMistake(
  candidates: BotCandidate[],
  fenBefore: string,
  personality: BotPersonality,
  diagnosisCodes: readonly DiagnosisCodeId[],
  random: () => number,
  /** Dev-log hook only (bot-move-selector.ts) — receives the final 5-move
   * sample this pick was drawn from, purely as data, so this function stays
   * pure otherwise. */
  onSample?: (sample: BotCandidate[]) => void
): BotCandidate {
  const sample = sampleTtcPool(candidates, fenBefore, personality, random);
  onSample?.(sample);
  const best = candidates[0] ?? sample[0]!;

  const realMistakes = sample.filter((candidate) => cpLossFromBest(best, candidate) >= TACTICAL_MISTAKE_MIN_CP_LOSS);
  if (realMistakes.length === 0) {
    return sample.reduce((worst, candidate) => (candidateScore(candidate) < candidateScore(worst) ? candidate : worst));
  }

  const manifesting = realMistakes.filter((candidate) => candidate.diagnosisCodes.some((code) => diagnosisCodes.includes(code)));
  if (manifesting.length > 0) return pickPersonalityWeightedMove(manifesting, personality, random);

  return realMistakes.reduce((mildest, candidate) => (candidateScore(candidate) > candidateScore(mildest) ? candidate : mildest));
}

/**
 * The %C-hit branch: a real blunder. Same TTC pool construction as
 * pickTacticalMistake, but checks each sampled candidate against the
 * engine's own best move (`cpLossFromBest`) for a real, meaningful cp drop
 * — at least BLUNDER_MIN_CP_LOSS, roughly "gives up a piece for nothing" —
 * before picking the worst-scoring one among those that qualify. Without
 * this check, "worst of the TTC sample" could still just be a merely
 * suboptimal move on a position where nothing TTC-plausible is actually
 * bad. Falls back to the sample's own worst-scoring candidate if nothing
 * clears the floor (rare).
 */
export function pickBlunder(
  candidates: BotCandidate[],
  fenBefore: string,
  personality: BotPersonality,
  random: () => number,
  /** Same dev-log hook as pickTacticalMistake's own — see its doc comment. */
  onSample?: (sample: BotCandidate[]) => void
): BotCandidate {
  const sample = sampleTtcPool(candidates, fenBefore, personality, random);
  onSample?.(sample);
  const best = candidates[0] ?? sample[0]!;

  const realBlunders = sample.filter((candidate) => cpLossFromBest(best, candidate) >= BLUNDER_MIN_CP_LOSS);
  const pool = realBlunders.length > 0 ? realBlunders : sample;
  return pool.reduce((worst, candidate) => (candidateScore(candidate) < candidateScore(worst) ? candidate : worst));
}
