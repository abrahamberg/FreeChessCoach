import type { Kysely } from 'kysely';
import * as gamesRepo from '../../db/repositories/games.js';
import * as sessionsRepo from '../../db/repositories/sessions.js';
import type { SessionRow } from '../../db/repositories/sessions.js';
import type { Database } from '../../db/schema.js';
import type { JobQueue } from '../../jobs/queue.js';

export interface FinalizeBotGameDependencies {
  db: Kysely<Database>;
  jobQueue: JobQueue;
}

/**
 * Ends a play_bot game's session + game row the same way regardless of how
 * it ended (checkmate/stalemate/draw via commitBotTurn's own detection, a
 * resignation, or a clock flag) — marks the game's result and completes the
 * session. It deliberately does NOT queue analysis: the student is asked
 * whether to keep the game, and only keeping it (`keepBotGame`) analyses it
 * and spends import quota. Factored out of commitBotTurn so every way a bot
 * game can end shares one finish line.
 *
 * A play_bot game can now reach this from two independent triggers racing
 * each other — a clock-timeout claim (claimBotGameTimeout) and a recovered
 * bot reply (requestBotMove, via useBotTurnFailover's poll) — so the session
 * completion is claimed atomically first (completeIfActive); a caller that
 * loses the race returns early instead of double-writing the result or
 * finalizing the same game twice.
 */
export async function finalizeBotGame(
  deps: FinalizeBotGameDependencies,
  session: SessionRow,
  finalPly: number,
  result: '1-0' | '0-1' | '1/2-1/2'
): Promise<void> {
  const won = await sessionsRepo.completeIfActive(deps.db, session.id);
  if (!won) return;

  await gamesRepo.updateResult(deps.db, session.gameId, result);
  await sessionsRepo.updateSubjectAndCurrentPly(deps.db, session.id, finalPly);
}
