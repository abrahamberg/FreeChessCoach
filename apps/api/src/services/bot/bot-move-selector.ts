import { classifyBotGamePhase, pickBotMove, selectBookMove } from '@freechesscoach/chess-analysis';
import type { BotConfig } from '@freechesscoach/shared';
import { buildBotCandidates, type BotCandidatesDependencies } from './bot-candidates.js';

export interface BotMoveSelectorDependencies extends BotCandidatesDependencies {
  /** Injected randomness (real Math.random at the real call site) — kept
   * injectable so tests are deterministic. */
  random: () => number;
}

export interface SelectedBotMove {
  san: string;
  usedBook: boolean;
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
 * Picks one move for a bot at `fen`: book first (opening-only, via
 * `bookPlies`/`bookMistakeChance`), then a phase-resolved engine search
 * (`classifyBotGamePhase` -> `bot.phases[phase]`) feeding a literal
 * probability roll (`pickBotMove`) between the engine's own top-ranked
 * candidate and a personality-weighted pick from the full candidate field.
 * `plyCount` is halfmoves played so far, before this move.
 */
export async function selectBotMove(
  deps: BotMoveSelectorDependencies,
  fen: string,
  plyCount: number,
  bot: BotConfig
): Promise<SelectedBotMove> {
  const book = selectBookMove(fen, plyCount, bot, deps.random);
  if (book) return { san: book.san, usedBook: true };

  const phase = classifyBotGamePhase(fen, plyCount, bot.bookPlies);
  const profile = bot.phases[phase];

  const candidates = await withEngineRetry(() => buildBotCandidates(deps, fen, profile.depth));
  if (candidates.length === 0) {
    throw new BotSelectionError(`selectBotMove: engine returned no candidates for a non-terminal position (fen "${fen}")`);
  }

  const picked = pickBotMove({
    candidates,
    personality: bot.personality,
    bestMoveChance: profile.bestMoveChance,
    mateConversionChance: bot.mateConversionChance,
    diagnosisCodes: bot.diagnosisCodes,
    random: deps.random
  });
  return { san: picked.moveSan, usedBook: false };
}
