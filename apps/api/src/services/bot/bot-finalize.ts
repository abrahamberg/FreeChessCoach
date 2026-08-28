import type { Kysely } from 'kysely';
import * as analysesRepo from '../../db/repositories/analyses.js';
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
 * resignation, or a clock flag) — marks the game's result, completes the
 * session, and enqueues the standard post-game analysis job (the same
 * insertQueued + enqueueAnalyzeGame pair game-import.ts uses), deliberately
 * at full depth rather than the bot's own shallow playing depth, since this
 * phase is about accurate review. Factored out of commitBotTurn so every
 * way a bot game can end shares one finish line.
 */
export async function finalizeBotGame(
  deps: FinalizeBotGameDependencies,
  session: SessionRow,
  finalPly: number,
  result: '1-0' | '0-1' | '1/2-1/2'
): Promise<void> {
  await gamesRepo.updateResult(deps.db, session.gameId, result);
  await sessionsRepo.updateSubjectAndCurrentPly(deps.db, session.id, finalPly);
  await sessionsRepo.markCompleted(deps.db, session.id);
  await analysesRepo.insertQueued(deps.db, session.gameId);
  await deps.jobQueue.enqueueAnalyzeGame(session.gameId);
}
