import type { BotConfig, BotPersonality } from '@freechesscoach/shared';
import { pickPersonalityWeightedMove, type BotCandidate } from './bot-candidate-weighting.js';
import type { WantedMistake } from './bot-mistake-judge.js';

/** How many of the engine's own top-ranked lines count as "Top 5" for the %A
 * roll — and so how many lines a top-moves branch asks the engine for. */
export const TOP_LINES = 5;

/** A miss branch needs only the engine's best line: the baseline score and
 * the best move to fall back on. The mistake itself is screened without the
 * engine and verified with one more call per try (bot-mistake-search.ts). */
export const BASELINE_LINES = 1;

/** The three rolls a bot move is decided by, drawn unconditionally and in this
 * order — never lazily on a branch — so which branch runs never changes how
 * many times (or in what order) the injected source is drawn. */
export interface BotRolls {
  r1: number;
  r2: number;
  r3: number;
}

export function drawBotRolls(random: () => number): BotRolls {
  const r1 = random();
  const r2 = random();
  const r3 = random();
  return { r1, r2, r3 };
}

type BranchOdds = Pick<BotConfig, 'topFiveChance' | 'bestMoveGivenTopFiveChance' | 'mateConversionChance' | 'blunderGivenMissChance'>;

/**
 * The %A/%B/%C decision tree, decided from the rolls alone so the engine
 * request can be sized to the branch before the engine is asked anything:
 *
 * ```
 * Roll %A: is the move in the engine's own Top 5?
 * ├── Yes → 'top'   (Roll %B later, with the search in hand: best move, or another of the top 5)
 * └── No  → 'miss'  Roll %C: a blunder, or a smaller tactical mistake
 * ```
 */
export type BotBranchDecision = { kind: 'top'; r2: number } | { kind: 'miss'; wanted: WantedMistake };

export function decideBotBranch(rolls: BotRolls, bot: Pick<BranchOdds, 'topFiveChance' | 'blunderGivenMissChance'>): BotBranchDecision {
  if (rolls.r1 < bot.topFiveChance) return { kind: 'top', r2: rolls.r2 };
  return { kind: 'miss', wanted: rolls.r3 < bot.blunderGivenMissChance ? 'blunder' : 'mistake' };
}

/** How many engine lines this branch needs. */
export function linesNeeded(decision: BotBranchDecision): number {
  return decision.kind === 'top' ? TOP_LINES : BASELINE_LINES;
}

/** %B: on a top-moves branch, does the bot play the engine's best move? A
 * forced mate the engine found raises the odds to the bot's own
 * `mateConversionChance` floor (a bot that sees mate in 3 usually plays it). */
export function playsBestMove(r2: number, best: Pick<BotCandidate, 'mateIn'>, bot: Pick<BranchOdds, 'bestMoveGivenTopFiveChance' | 'mateConversionChance'>): boolean {
  let chance = bot.bestMoveGivenTopFiveChance;
  if (best.mateIn !== null && best.mateIn > 0) chance = Math.max(chance, bot.mateConversionChance);
  return r2 < chance;
}

/** Personality-weighted pick among the engine's own top-5 lines, excluding
 * `candidates[0]` (the %B branch's best move). Null when the search returned
 * no other line — a position with a single legal move, say. */
export function pickAnotherTopFive(candidates: BotCandidate[], personality: BotPersonality, random: () => number): BotCandidate | null {
  const rest = candidates.slice(1, TOP_LINES);
  if (rest.length === 0) return null;
  return pickPersonalityWeightedMove(rest, personality, random);
}
