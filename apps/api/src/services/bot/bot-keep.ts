import type { Kysely } from 'kysely';
import * as analysesRepo from '../../db/repositories/analyses.js';
import * as gameImportEventsRepo from '../../db/repositories/game-import-events.js';
import * as gamesRepo from '../../db/repositories/games.js';
import type { Database } from '../../db/schema.js';
import type { JobQueue } from '../../jobs/queue.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import { startAnalysis } from '../game-import.js';
import { assertCanImport } from '../import-quota.js';
import { makeRoomInLibrary } from '../imported-game-record.js';

/**
 * "Analyse and keep" for a finished bot game. A bot game is not analysed when
 * it ends (`finalizeBotGame`); the student chooses, and keeping one is an
 * import in every way that matters for limits: it must clear the daily,
 * weekly and in-flight caps (`assertCanImport`), writes a row to the import
 * ledger (so deleting the game later never refunds it), takes a library slot
 * (an analysed bot game counts toward the cap — `countImportableForUser`),
 * and queues the full-depth analysis. Once analysed it sits on the Games
 * list like any other game, ready to review or coach.
 *
 * Idempotent: a game that already has an analysis is returned as is, without
 * spending quota a second time.
 */
export async function keepBotGame(
  db: Kysely<Database>,
  jobQueue: JobQueue,
  userId: string,
  gameId: string
): Promise<{ analysisId: string }> {
  const game = await gamesRepo.findByIdForUser(db, gameId, userId);
  if (!game || game.source !== 'vs_bot') throw new NotFoundError('Game not found');
  if (game.result === null) throw new ValidationError('This game is still in progress');

  const existing = await analysesRepo.findByGameId(db, game.id);
  if (existing) return { analysisId: existing.id };

  await assertCanImport(db, userId);
  await db.transaction().execute(async (trx) => {
    await makeRoomInLibrary(trx, userId);
    await gameImportEventsRepo.record(trx, userId, new Date());
  });
  return startAnalysis(db, jobQueue, game.id);
}
