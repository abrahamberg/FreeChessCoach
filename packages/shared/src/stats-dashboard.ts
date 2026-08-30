import { z } from 'zod';
import { EndgameStandingSchema, EndgameThemeSchema, TacticMotifCountsSchema } from './game-report.js';

/** Historical stats dashboard (Phase 27-30) request-side filters. Only
 * `'rapid' | 'all'` for speed today per the user's stated preference — not a
 * hard block, so nothing stops adding `'blitz'`/`'bullet'` later without a
 * schema break. */
export const StatsRangeSchema = z.enum(['last7', 'last30', 'last365', 'all']);
export type StatsRange = z.infer<typeof StatsRangeSchema>;

export const GameSpeedFilterSchema = z.enum(['rapid', 'all']);
export type GameSpeedFilter = z.infer<typeof GameSpeedFilterSchema>;

const NullablePercentSchema = z.number().min(0).max(100).nullable();
const NullableScoreSchema = z.number().nullable();

export const OpeningPerformanceRowSchema = z.object({
  opening: z.string().min(1),
  gamesPlayed: z.number().int().positive(),
  winPct: z.number().min(0).max(100),
  accuracy: z.number().min(0).max(100)
});
export type OpeningPerformanceRow = z.infer<typeof OpeningPerformanceRowSchema>;

export const OpeningStatsSchema = z.object({
  averageBookMoves: NullableScoreSchema,
  openingAccuracy: NullablePercentSchema,
  averageOpeningMistakes: NullableScoreSchema,
  performanceByOpening: z.array(OpeningPerformanceRowSchema)
});
export type OpeningStats = z.infer<typeof OpeningStatsSchema>;

/** Mirrors `PlayerReportSchema.strategySubScores` plus the pre-existing
 * `scores.strategy` overall figure, meaned across games. */
export const StrategyStatsSchema = z.object({
  overall: NullableScoreSchema,
  pawnStructure: NullableScoreSchema,
  spaceAdvantage: NullableScoreSchema,
  activePiece: NullableScoreSchema,
  attacking: NullableScoreSchema,
  defending: NullableScoreSchema
});
export type StrategyStats = z.infer<typeof StrategyStatsSchema>;

export const EndgameStandingRowSchema = z.object({
  standing: EndgameStandingSchema,
  gamesPlayed: z.number().int().positive(),
  winPct: z.number().min(0).max(100)
});
export type EndgameStandingRow = z.infer<typeof EndgameStandingRowSchema>;

export const EndgameThemeRowSchema = z.object({
  theme: EndgameThemeSchema,
  gamesPlayed: z.number().int().positive(),
  accuracy: z.number().min(0).max(100)
});
export type EndgameThemeRow = z.infer<typeof EndgameThemeRowSchema>;

export const EndgameStatsSchema = z.object({
  overallAccuracy: NullablePercentSchema,
  byStanding: z.array(EndgameStandingRowSchema),
  byTheme: z.array(EndgameThemeRowSchema)
});
export type EndgameStats = z.infer<typeof EndgameStatsSchema>;

export const StatsDashboardSchema = z.object({
  gamesAnalyzed: z.number().int().nonnegative(),
  opening: OpeningStatsSchema,
  tactics: TacticMotifCountsSchema,
  strategy: StrategyStatsSchema,
  endgame: EndgameStatsSchema
});
export type StatsDashboard = z.infer<typeof StatsDashboardSchema>;
