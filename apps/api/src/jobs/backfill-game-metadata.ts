import { classifyTimeControl, extractPgnMoveComments, parseGameHeaders, parsePgn } from '@freechesscoach/chess-analysis';
import type { Task } from 'graphile-worker';
import type { Kysely } from 'kysely';
import * as gamesRepo from '../db/repositories/games.js';
import type { Database } from '../db/schema.js';

export interface BackfillGameMetadataTaskOptions {
  db: Kysely<Database>;
  /** Defaults to 200; overridable so a test can exercise multi-batch
   * cursoring without inserting hundreds of rows. */
  batchSize?: number;
}

const DEFAULT_BATCH_SIZE = 200;

/**
 * One-off backfill for 0023_game_metadata.ts's columns (Task 51.4) —
 * re-parses every historical `games.pgn` to fill in what
 * parseGameHeaders/extractPgnMoveComments can now extract. Never runs as
 * part of the migration itself: re-parsing every game in the database is
 * exactly the kind of slow, retryable work that belongs in the job queue,
 * not a schema change that must complete before the app can start.
 *
 * Idempotent: `findBatchMissingMoveTimes` only ever returns rows whose
 * `move_times` is still null, and every write here sets it to a real
 * (possibly empty) array — so a row already visited, including by a run
 * that later crashed, is never revisited.
 */
export function createBackfillGameMetadataTask(options: BackfillGameMetadataTaskOptions): Task {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  return async () => {
    let processed = 0;
    let failed = 0;
    let cursor: string | null = null;

    for (;;) {
      const batch = await gamesRepo.findBatchMissingMoveTimes(options.db, cursor, batchSize);
      if (batch.length === 0) break;

      for (const game of batch) {
        try {
          await gamesRepo.updateMetadata(options.db, game.id, backfillMetadata(game));
          processed += 1;
        } catch (error) {
          // Left with move_times still null, so a future run retries it —
          // one unparseable row (e.g. a corrupted paste) must not block the
          // rest of the table from ever being backfilled.
          console.error(`backfill-game-metadata: failed for game ${game.id}:`, error);
          failed += 1;
        }
      }
      cursor = batch[batch.length - 1]!.id;
    }

    console.log(`backfill-game-metadata: processed ${processed} row(s), ${failed} failed`);
  };
}

function backfillMetadata(game: gamesRepo.GameRow): gamesRepo.GameMetadataUpdate {
  const headers = parsePgn(game.pgn).headers;
  const metadata = parseGameHeaders(headers);
  return {
    whiteElo: metadata.whiteElo,
    blackElo: metadata.blackElo,
    ratingsProvisional: metadata.ratingsProvisional,
    rated: metadata.rated,
    termination: metadata.termination,
    variant: metadata.variant,
    speed: classifyTimeControl(game.timeControl),
    playedAtTime: metadata.utcTime,
    moveTimes: extractPgnMoveComments(game.pgn)
  };
}
