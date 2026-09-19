import { emptyStatsBucket, mergeStatsBuckets, toStatsBucket } from '@freechesscoach/chess-analysis';
import type { Kysely } from 'kysely';
import * as analysesRepo from '../db/repositories/analyses.js';
import * as statsArchiveRepo from '../db/repositories/stats-archive.js';
import type { Database } from '../db/schema.js';
import { isoWeekStart } from '../lib/week-start.js';
import { toStatsEntry } from './stats-entry.js';

/**
 * Folds one game's stats into the weekly archive, so deleting the game does
 * not change the Stats page (docs/plan.md Phase 68). Only a game that is on
 * the dashboard today — imported source, ready analysis, current-schema
 * report — is banked; anything else has no stats to keep.
 *
 * Filed under `playedAt ?? createdAt` (the fallback the dashboard's own range
 * filter uses) and the game's speed. The caller owns the transaction: the
 * bank and the delete must commit or roll back together. The row is created
 * first and then locked, so two deletions racing on a brand-new week/speed
 * merge one after the other instead of the second overwriting the first.
 */
export async function bankGameStats(db: Kysely<Database>, userId: string, gameId: string): Promise<void> {
  const row = await analysesRepo.findReadyReportForGame(db, gameId);
  const entry = row && toStatsEntry(row);
  if (!row || !entry) return;

  const key = { userId, weekStart: isoWeekStart(row.playedAt ?? row.createdAt), speed: entry.speed };
  await statsArchiveRepo.insertIfMissing(db, { ...key, bucket: emptyStatsBucket() });
  const existing = (await statsArchiveRepo.findForUpdate(db, key.userId, key.weekStart, key.speed)) ?? emptyStatsBucket();
  await statsArchiveRepo.upsert(db, { ...key, bucket: mergeStatsBuckets(existing, toStatsBucket(entry)) });
}
