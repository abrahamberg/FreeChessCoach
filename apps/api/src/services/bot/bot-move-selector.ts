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

/** A selection-logic bug — the engine call itself succeeded, but what came
 * back or what was chosen from it can't be used. Distinct from a transient
 * engine failure (a network blip, a timeout — see withEngineRetry) so that
 * commitBotTurn/requestBotMove can tell them apart: a real bug here will
 * fail the exact same way on every retry, so silently reporting it as
 * `botPending` (as if the engine were merely down) would leave the game
 * stuck forever behind an indefinite client-side poll instead of surfacing
 * as the visible failure it should be. */
export class BotSelectionError extends Error {}

/** A bot move sits behind the live "your move" round trip (commitBotTurn):
 * a single dropped or timed-out engine call — contention with a background
 * analysis job, a transient network blip — must not strand the game with
 * the player's move committed but no bot reply. Retries the engine call a
 * few times with a short, increasing backoff before giving up; the caller
 * (commitBotTurn) still has its own botPending fallback for when every
 * attempt here fails. */
const ENGINE_RETRY_ATTEMPTS = 3;
const ENGINE_RETRY_DELAY_MS = 500;

async function withEngineRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < ENGINE_RETRY_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < ENGINE_RETRY_ATTEMPTS - 1) await sleep(ENGINE_RETRY_DELAY_MS * (attempt + 1));
    }
  }
  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  const candidates = await withEngineRetry(() => buildBotCandidates(deps, fen, bot));
  if (candidates.length === 0) {
    throw new BotSelectionError(`selectBotMove: engine returned no candidates for a non-terminal position (fen "${fen}")`);
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
