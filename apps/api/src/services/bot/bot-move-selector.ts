import { sampleBotMove, scoreBotCandidates, selectBookMove, type ScoredBotCandidate } from '@freechesscoach/chess-analysis';
import type { BotConfig } from '@freechesscoach/shared';
import type { BotMoveChoiceInput } from '@freechesscoach/prompts';
import { buildBotCandidates, type BotCandidatesDependencies } from './bot-candidates.js';

/** Candidates within this fraction of the top score are considered "close
 * enough" for the AI tiebreak to matter — a cluster of one skips the LLM
 * call entirely (bounds LLM usage to genuinely ambiguous moments). */
export const TIEBREAK_SCORE_MARGIN = 0.08;

export interface BotMoveSelectorDependencies extends BotCandidatesDependencies {
  /** Wraps callBotTiebreak (apps/api/src/llm/bot-tiebreak.ts) — null return
   * means "no usable answer," never thrown. Only ever called when aiEnabled
   * and the top cluster has 2+ candidates. */
  callTiebreak: (input: BotMoveChoiceInput) => Promise<string | null>;
  /** Injected randomness (real Math.random at the real call site) — kept
   * injectable so tests are deterministic. */
  random: () => number;
}

export interface SelectedBotMove {
  san: string;
  usedBook: boolean;
  usedAi: boolean;
}

/**
 * Picks one move for a bot at `fen`: book first, then engine+personality
 * scoring, with an optional AI tiebreak among close-scoring candidates for
 * AI-enabled bots. `plyCount` is halfmoves played so far, before this move.
 */
export async function selectBotMove(
  deps: BotMoveSelectorDependencies,
  fen: string,
  plyCount: number,
  bot: BotConfig
): Promise<SelectedBotMove> {
  const book = selectBookMove(fen, plyCount, bot, deps.random);
  if (book) return { san: book.san, usedBook: true, usedAi: false };

  const candidates = await buildBotCandidates(deps, fen, bot);
  if (candidates.length === 0) {
    throw new Error(`selectBotMove: engine returned no candidates for a non-terminal position (fen "${fen}")`);
  }
  const scored = scoreBotCandidates(candidates, bot.personality);

  if (!bot.aiEnabled) return sample(scored, bot, deps.random);

  const cluster = closeScoringCluster(scored);
  if (cluster.length < 2) return sample(scored, bot, deps.random);

  const choice = await deps.callTiebreak({
    botName: bot.name,
    botDescription: bot.description,
    fen,
    candidates: cluster.map((candidate) => ({
      moveSan: candidate.moveSan,
      cp: candidate.cp,
      mateIn: candidate.mateIn,
      score: candidate.score,
      forkInPlies: candidate.forkInPlies
    }))
  });

  const validChoice = choice !== null && cluster.some((candidate) => candidate.moveSan === choice);
  if (validChoice && choice) return { san: choice, usedBook: false, usedAi: true };

  // null (call failed) or a hallucinated SAN outside the cluster — never let
  // unvalidated LLM output reach the move-commit path.
  return sample(scored, bot, deps.random);
}

function sample(pool: ScoredBotCandidate[], bot: BotConfig, random: () => number): SelectedBotMove {
  return { san: sampleBotMove(pool, bot.temperature, random).moveSan, usedBook: false, usedAi: false };
}

function closeScoringCluster(scored: ScoredBotCandidate[]): ScoredBotCandidate[] {
  const topScore = Math.max(...scored.map((candidate) => candidate.score));
  return scored.filter((candidate) => topScore - candidate.score <= TIEBREAK_SCORE_MARGIN);
}
