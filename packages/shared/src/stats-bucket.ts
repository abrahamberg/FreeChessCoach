import { z } from 'zod';
import { EndgameStandingSchema, EndgameThemeSchema, TacticMotifCountsSchema } from './game-report.js';

/**
 * A mergeable digest of a set of analyzed games — *sufficient statistics*
 * (sums and counts), never means, so two buckets combine by plain addition
 * and the stats dashboard finalizes the merge into the same numbers a
 * per-game pass would give. `stats_archive_weeks` stores one per (user,
 * week, speed) so deleting a game keeps its contribution to the Stats page
 * without keeping the game (docs/plan.md Phase 68).
 *
 * Every field is additive. Optional tactic `preventable`/`prevented` stay
 * absent (not 0) unless some merged game reported them — see
 * `TacticMotifCountsSchema`.
 */
const CountSchema = z.number().int().nonnegative();

/** A running mean's parts: divide `sum` by `count` only when finalizing. */
export const SumCountSchema = z.object({ sum: z.number(), count: CountSchema });
export type SumCount = z.infer<typeof SumCountSchema>;

export const OpeningBucketRowSchema = z.object({
  games: CountSchema,
  /** win 1 / draw 0.5 / loss 0 — the same scoring `winPct` uses. */
  points: z.number().nonnegative(),
  accuracySum: z.number()
});
export type OpeningBucketRow = z.infer<typeof OpeningBucketRowSchema>;

export const StandingBucketRowSchema = z.object({
  games: CountSchema,
  wins: CountSchema,
  losses: CountSchema,
  draws: CountSchema
});
export type StandingBucketRow = z.infer<typeof StandingBucketRowSchema>;

/** `games` counts every game in the theme; `accuracy.count` only those that
 * also had an endgame accuracy — the dashboard reports both. */
export const ThemeBucketRowSchema = z.object({ games: CountSchema, accuracy: SumCountSchema });
export type ThemeBucketRow = z.infer<typeof ThemeBucketRowSchema>;

export const StatsBucketSchema = z.object({
  games: CountSchema,
  opening: z.object({
    bookMoves: SumCountSchema,
    accuracy: SumCountSchema,
    mistakes: SumCountSchema,
    byOpening: z.record(z.string(), OpeningBucketRowSchema)
  }),
  tactics: TacticMotifCountsSchema,
  strategy: z.object({
    overall: SumCountSchema,
    pawnStructure: SumCountSchema,
    spaceAdvantage: SumCountSchema,
    activePiece: SumCountSchema,
    attacking: SumCountSchema,
    defending: SumCountSchema
  }),
  endgame: z.object({
    accuracy: SumCountSchema,
    byStanding: z.record(EndgameStandingSchema, StandingBucketRowSchema),
    byTheme: z.record(EndgameThemeSchema, ThemeBucketRowSchema)
  }),
  /** Estimated rating (one per game with an estimate and a known date). */
  rating: SumCountSchema
});
export type StatsBucket = z.infer<typeof StatsBucketSchema>;
