import {
  ENDGAME_STANDINGS,
  ENDGAME_THEMES,
  type EndgameStandingRow,
  type EndgameStats,
  type EndgameThemeRow,
  type OpeningPerformanceRow,
  type OpeningStats,
  type RatingHistoryPoint,
  type StatsBucket,
  type StatsDashboard,
  type StrategyStats,
  type SumCount
} from '@freechesscoach/shared';
import type { ArchivedStatsWeek } from './stats-bucket.js';

/** A mean from its parts — null (never a misleading 0) with nothing to mean. */
function meanOf({ sum, count }: SumCount): number | null {
  return count === 0 ? null : sum / count;
}

/** Most games first; ties by name so the order does not depend on the key
 * order of an archived bucket (jsonb does not preserve it). */
function compareOpenings(a: OpeningPerformanceRow, b: OpeningPerformanceRow): number {
  if (a.gamesPlayed !== b.gamesPlayed) return b.gamesPlayed - a.gamesPlayed;
  return a.opening < b.opening ? -1 : a.opening > b.opening ? 1 : 0;
}

export function finalizeOpeningStats(opening: StatsBucket['opening']): OpeningStats {
  const performanceByOpening = Object.entries(opening.byOpening)
    .map(([name, row]) => ({
      opening: name,
      gamesPlayed: row.games,
      winPct: (row.points / row.games) * 100,
      accuracy: row.accuracySum / row.games
    }))
    .sort(compareOpenings);

  return {
    averageBookMoves: meanOf(opening.bookMoves),
    openingAccuracy: meanOf(opening.accuracy),
    averageOpeningMistakes: meanOf(opening.mistakes),
    performanceByOpening
  };
}

function finalizeStrategyStats(strategy: StatsBucket['strategy']): StrategyStats {
  return {
    overall: meanOf(strategy.overall),
    pawnStructure: meanOf(strategy.pawnStructure),
    spaceAdvantage: meanOf(strategy.spaceAdvantage),
    activePiece: meanOf(strategy.activePiece),
    attacking: meanOf(strategy.attacking),
    defending: meanOf(strategy.defending)
  };
}

function finalizeEndgameStats(endgame: StatsBucket['endgame']): EndgameStats {
  const byStanding: EndgameStandingRow[] = ENDGAME_STANDINGS.flatMap((standing) => {
    const row = endgame.byStanding[standing];
    if (!row || row.games === 0) return [];
    const denominator = row.wins + row.losses + row.draws * 0.5;
    return [{ standing, gamesPlayed: row.games, winPct: denominator === 0 ? 0 : (row.wins / denominator) * 100 }];
  });

  const byTheme: EndgameThemeRow[] = ENDGAME_THEMES.flatMap((theme) => {
    const row = endgame.byTheme[theme];
    if (!row || row.games === 0) return [];
    return [{ theme, gamesPlayed: row.games, accuracy: meanOf(row.accuracy) ?? 0 }];
  });

  return { overallAccuracy: meanOf(endgame.accuracy), byStanding, byTheme };
}

/** An archived week is one rating point at the week's start, at the mean of
 * its estimates. Speeds sharing a week share one point (the trend chart has
 * no speed dimension); a week with no estimate adds none. */
export function weeklyRatingPoints(weeks: ArchivedStatsWeek[]): RatingHistoryPoint[] {
  const byWeek = new Map<string, SumCount>();
  for (const { weekStart, bucket } of weeks) {
    const total = byWeek.get(weekStart) ?? { sum: 0, count: 0 };
    byWeek.set(weekStart, { sum: total.sum + bucket.rating.sum, count: total.count + bucket.rating.count });
  }
  return [...byWeek.entries()].flatMap(([weekStart, total]) =>
    total.count === 0
      ? []
      : [{ playedAt: new Date(`${weekStart}T00:00:00Z`).toISOString(), estimatedRating: Math.round(total.sum / total.count) }]
  );
}

/** The "finalize" step: a merged bucket (plus the rating points, which are
 * not additive) becomes the dashboard. */
export function finalizeStatsDashboard(bucket: StatsBucket, ratingPoints: RatingHistoryPoint[]): StatsDashboard {
  return {
    gamesAnalyzed: bucket.games,
    opening: finalizeOpeningStats(bucket.opening),
    tactics: bucket.tactics,
    strategy: finalizeStrategyStats(bucket.strategy),
    endgame: finalizeEndgameStats(bucket.endgame),
    rating: { gamesWithEstimate: bucket.rating.count, points: [...ratingPoints].sort((a, b) => a.playedAt.localeCompare(b.playedAt)) }
  };
}
