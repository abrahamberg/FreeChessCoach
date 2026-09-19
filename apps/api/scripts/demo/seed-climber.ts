import { classifyTimeControl, emptyStatsBucket, mergeStatsBuckets, toStatsBucket, type GameSpeed } from '@freechesscoach/chess-analysis';
import { AUTO_DELETE_BATCH, MAX_LIBRARY_GAMES, type StatsBucket } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import * as statsArchiveRepo from '../../src/db/repositories/stats-archive.js';
import type { Database } from '../../src/db/schema.js';
import { isoWeekStart } from '../../src/lib/week-start.js';
import { createFreshDemoUser, DEMO_EMAILS, DEMO_HANDLE } from './demo-user.js';
import { planGames } from './game-plan.js';
import { insertAnalyzedGame, reportForPlannedGame, statsEntryFor } from './insert-planned-game.js';
import { mulberry32 } from './rng.js';

export const CLIMBER_TOTAL_GAMES = 3420;
const CLIMBER_SEED = 2130;

/** How many of the games are still in the library. Once an import would push the
 * library past its cap, the app deletes the 50 earliest and banks them in the
 * stats archive; after 3,420 imports that leaves this many (see
 * docs/architecture.md, "Library cap"). */
export function liveGameCount(totalImports: number, cap = MAX_LIBRARY_GAMES, batch = AUTO_DELETE_BATCH): number {
  if (totalImports <= cap) return totalImports;
  return cap - batch + 1 + ((totalImports - cap - 1) % batch);
}

/** The year-long player: 3,420 rapid games, 450 → 2130. The oldest games are
 * archived weekly exactly as the app would have banked them; the newest are
 * real, analyzed rows in the library. */
export async function seedClimber(db: Kysely<Database>, now: Date): Promise<void> {
  const user = await createFreshDemoUser(db, DEMO_EMAILS.climber, 2130);
  const plan = planGames(mulberry32(CLIMBER_SEED), CLIMBER_TOTAL_GAMES, now);
  const liveFrom = plan.length - liveGameCount(plan.length);

  const weeks = new Map<string, { weekStart: string; speed: GameSpeed; bucket: StatsBucket }>();
  for (const [index, game] of plan.slice(0, liveFrom).entries()) {
    const entry = statsEntryFor(game, reportForPlannedGame(game, CLIMBER_SEED * 1000 + index));
    const key = { weekStart: isoWeekStart(game.playedAt), speed: classifyTimeControl(game.timeControl) };
    const slot = weeks.get(`${key.weekStart}|${key.speed}`) ?? { ...key, bucket: emptyStatsBucket() };
    slot.bucket = mergeStatsBuckets(slot.bucket, toStatsBucket(entry));
    weeks.set(`${key.weekStart}|${key.speed}`, slot);
  }
  for (const week of weeks.values()) await statsArchiveRepo.upsert(db, { userId: user.id, ...week });

  const live = plan.slice(liveFrom);
  for (const [index, game] of live.entries()) {
    await insertAnalyzedGame(db, user.id, DEMO_HANDLE, game, CLIMBER_SEED * 1000 + liveFrom + index);
  }
  console.log(`climber: ${weeks.size} archived week-buckets (${liveFrom} games), ${live.length} live games`);
}
