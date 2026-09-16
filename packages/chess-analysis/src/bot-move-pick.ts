import type { BotPersonality, DiagnosisCodeId } from '@freechesscoach/shared';
import { pickPersonalityWeightedMove, type BotCandidate } from './bot-candidate-weighting.js';
import { pickBlunder, pickTacticalMistake } from './bot-mistake-pool.js';

/** How many of the engine's own top-ranked candidates count as "Top 5" for
 * the %A roll below. */
const TOP_FIVE_SIZE = 5;

export interface PickBotMoveInput {
  /** Engine-ranked candidates for the position — candidates[0] is the
   * engine's own top-scored line at the fixed bot search depth
   * (bot-candidates.ts's BOT_SEARCH_DEPTH). Must be non-empty. */
  candidates: BotCandidate[];
  personality: BotPersonality;
  /** %A — probability the move actually played comes from the engine's own
   * top-5 candidates at all, rather than the TTC-based mistake/blunder
   * pool. This bot's own literal roster value (BotConfig.topFiveChance),
   * not derived from elo. */
  topFiveChance: number;
  /** %B — conditional on the %A roll hitting: probability of playing
   * candidates[0] outright rather than another one of the top-5.
   * BotConfig.bestMoveGivenTopFiveChance. */
  bestMoveGivenTopFiveChance: number;
  /** Floor probability, used instead of bestMoveGivenTopFiveChance
   * specifically when candidates[0] delivers/continues a forced mate. */
  mateConversionChance: number;
  /** %C — conditional on the %A roll missing: probability the miss is a
   * blunder rather than a smaller tactical mistake.
   * BotConfig.blunderGivenMissChance. */
  blunderGivenMissChance: number;
  /** This bot's documented diagnosis codes — steers pickTacticalMistake's
   * own pick toward a candidate that actually manifests one of them. */
  diagnosisCodes: readonly DiagnosisCodeId[];
  /** The position being played from — needed for the TTC-based
   * mistake/blunder pool (bot-mistake-pool.ts). */
  fenBefore: string;
  /** Injected randomness (real Math.random at the real call site) — kept
   * injectable so tests are deterministic. */
  random: () => number;
  /** Dev-log hook only (bot-move-selector.ts) — fires with the TTC pool's
   * final 5-move sample exactly when the %C branch (blunder or tactical
   * mistake) runs; never called on a %A hit. Forwarded straight through to
   * pickBlunder/pickTacticalMistake. */
  onTacticsSample?: (sample: BotCandidate[]) => void;
}

/**
 * Picks one candidate for a bot to play, per the %A/%B/%C decision tree:
 *
 * ```
 * Roll %A: is the move in the engine's own Top 5?
 * ├── Yes → Roll %B: play the best move?
 * │   ├── Yes → candidates[0] (the engine's actual best move)
 * │   └── No  → another of the top-5, personality-weighted
 * └── No  → Roll %C: a blunder?
 *     ├── Yes → pickBlunder (TTC pool, worst-scoring sample pick)
 *     └── No  → pickTacticalMistake (TTC pool, diagnosis-code-steered pick)
 * ```
 *
 * All three rolls are drawn from `random` up front, unconditionally, before
 * any branching — never lazily re-entered on a miss — so which branch is
 * taken never changes how many times (or in what order) the injected
 * source is drawn. Only the %A branch ever reads `candidates[0..4]`'s
 * engine ranking; the %C branches read only the TTC-derived pool (pure,
 * no engine dependency) — see bot-mistake-pool.ts.
 */
export function pickBotMove(input: PickBotMoveInput): BotCandidate {
  const {
    candidates,
    personality,
    topFiveChance,
    bestMoveGivenTopFiveChance,
    mateConversionChance,
    blunderGivenMissChance,
    diagnosisCodes,
    fenBefore,
    random,
    onTacticsSample
  } = input;
  if (candidates.length === 0) throw new Error('pickBotMove: no candidates to pick from');

  const best = candidates[0];
  if (!best) throw new Error('unreachable: candidates is non-empty');

  const r1 = random();
  const r2 = random();
  const r3 = random();

  if (r1 < topFiveChance) {
    let bestChance = bestMoveGivenTopFiveChance;
    if (best.mateIn !== null && best.mateIn > 0) bestChance = Math.max(bestChance, mateConversionChance);
    if (r2 < bestChance) return best;
    return pickAnotherTopFive(candidates, personality, random);
  }

  if (r3 < blunderGivenMissChance) return pickBlunder(candidates, fenBefore, personality, random, onTacticsSample);
  return pickTacticalMistake(candidates, fenBefore, personality, diagnosisCodes, random, onTacticsSample);
}

/** Personality-weighted pick among the engine's own top-5 lines, excluding
 * candidates[0] (already handled by the %B branch above). Falls back to
 * candidates[0] itself when the position has fewer than two legal moves
 * total — an edge case, not a real "another top-5" choice. */
function pickAnotherTopFive(candidates: BotCandidate[], personality: BotPersonality, random: () => number): BotCandidate {
  const rest = candidates.slice(1, TOP_FIVE_SIZE);
  if (rest.length === 0) return candidates[0]!;
  return pickPersonalityWeightedMove(rest, personality, random);
}
