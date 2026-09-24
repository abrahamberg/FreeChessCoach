import type { DiagnosticReadinessResponse } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import * as gamesRepo from '../db/repositories/games.js';
import type { GameRow } from '../db/repositories/games.js';
import type { Database } from '../db/schema.js';
import { groupRatedByTimeControl, MAX_WINDOW_GAMES, MIN_WINDOW_GAMES } from './diagnostic-window.js';

/** Rated games at one exact time control, capped at the window size — what
 * the profile for that time control is actually built from. */
export function countWindowGames(games: readonly GameRow[], timeControl: string): number {
  return Math.min(groupRatedByTimeControl(games).get(timeControl)?.length ?? 0, MAX_WINDOW_GAMES);
}

/** Backs the Games page's "N of 15" indicator: the same rated,
 * exact-time-control grouping `windowByTimeControl` uses, reported as
 * progress toward `MIN_WINDOW_GAMES` instead of dropped when short. */
export async function getDiagnosticReadiness(db: Kysely<Database>, userId: string): Promise<DiagnosticReadinessResponse> {
  const games = await gamesRepo.listByUser(db, userId);
  let best: { timeControl: string; count: number } | null = null;
  for (const [timeControl, bucket] of groupRatedByTimeControl(games)) {
    if (!best || bucket.length > best.count) best = { timeControl, count: bucket.length };
  }
  const ratedGames = Math.min(best?.count ?? 0, MAX_WINDOW_GAMES);
  return {
    required: MIN_WINDOW_GAMES,
    ratedGames,
    timeControl: best?.timeControl ?? null,
    ready: ratedGames >= MIN_WINDOW_GAMES
  };
}
