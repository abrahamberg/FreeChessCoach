import type { RatingHistoryPoint, RatingStats } from '@freechesscoach/shared';
import type { StatsEntry } from './stats-entry.js';

export type { RatingHistoryPoint, RatingStats } from '@freechesscoach/shared';

/** Cross-game estimated-rating trend (docs/algorith.md §8) — one point per
 * game, in the order it was actually played, so the Stats page can show how
 * a player's estimated rating has moved across their games. Deliberately
 * not a day/period average: a day with three games gets three points, not
 * one blended number. A game is excluded (never folded into a neighbour)
 * when it has no estimate (§8.5: fewer than 12 non-book moves) or no known
 * `playedAt` to place it by. */
export function aggregateRatingStats(entries: StatsEntry[]): RatingStats {
  const points: RatingHistoryPoint[] = entries
    .flatMap((entry): RatingHistoryPoint[] => {
      const estimatedRating = entry.gameReport.players[entry.userColor].estimatedRating.value;
      if (estimatedRating === null || entry.playedAt === null) return [];
      return [{ playedAt: entry.playedAt.toISOString(), estimatedRating }];
    })
    .sort((a, b) => a.playedAt.localeCompare(b.playedAt));

  return { gamesWithEstimate: points.length, points };
}
