import {
  AUTO_DELETE_BATCH,
  DAILY_IMPORT_LIMIT,
  importAllowance,
  MAX_IN_FLIGHT_IMPORTS,
  MAX_LIBRARY_GAMES,
  WEEKLY_IMPORT_LIMIT,
  type ImportLimitKind,
  type ImportQuotaResponse
} from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import * as analysesRepo from '../db/repositories/analyses.js';
import * as gameImportEventsRepo from '../db/repositories/game-import-events.js';
import * as gamesRepo from '../db/repositories/games.js';
import type { Database } from '../db/schema.js';
import { ImportLimitError } from '../lib/errors.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/** Every import limit in one read — GET /api/games/import-quota, and the
 * numbers `assertCanImport` decides on, so display and enforcement can never
 * drift apart. Daily/weekly come from the import ledger (never `games`, so a
 * deletion cannot free quota); in-flight from unfinished analyses. */
export async function getImportQuota(db: Kysely<Database>, userId: string): Promise<ImportQuotaResponse> {
  const now = Date.now();
  const [daily, weekly, inFlight, libraryUsed] = await Promise.all([
    gameImportEventsRepo.countSince(db, userId, new Date(now - DAY_MS)),
    gameImportEventsRepo.countSince(db, userId, new Date(now - WEEK_MS)),
    analysesRepo.countInFlightForUser(db, userId),
    gamesRepo.countImportableForUser(db, userId)
  ]);
  return {
    daily: { used: daily, limit: DAILY_IMPORT_LIMIT },
    weekly: { used: weekly, limit: WEEKLY_IMPORT_LIMIT },
    inFlight: { used: inFlight, limit: MAX_IN_FLIGHT_IMPORTS },
    library: {
      used: libraryUsed,
      limit: MAX_LIBRARY_GAMES,
      autoDeleteCount: libraryUsed >= MAX_LIBRARY_GAMES ? AUTO_DELETE_BATCH : 0
    }
  };
}

const LIMIT_MESSAGES: Record<ImportLimitKind, string> = {
  daily: `Import limit reached (${DAILY_IMPORT_LIMIT} games/day)`,
  weekly: `Import limit reached (${WEEKLY_IMPORT_LIMIT} games/week)`,
  in_flight: `Finish analyzing your current games first (max ${MAX_IN_FLIGHT_IMPORTS} at a time)`
};

/** Throws `ImportLimitError` (429) naming the binding limit when no more
 * games may be imported right now. */
export async function assertCanImport(db: Kysely<Database>, userId: string): Promise<void> {
  const quota = await getImportQuota(db, userId);
  const { blockedBy } = importAllowance({
    dailyUsed: quota.daily.used,
    weeklyUsed: quota.weekly.used,
    inFlight: quota.inFlight.used
  });
  if (blockedBy) throw new ImportLimitError(LIMIT_MESSAGES[blockedBy], blockedBy);
}
