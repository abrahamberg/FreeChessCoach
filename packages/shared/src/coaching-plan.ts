import { z } from 'zod';
import { MISTAKE_CATEGORIES } from './constants.js';

export const MomentKindSchema = z.enum([
  'user_mistake',
  'missed_chance',
  'turning_point',
  'instructive'
]);
export type MomentKind = z.infer<typeof MomentKindSchema>;

export const CoachingMomentSchema = z.object({
  ply: z.number().int().nonnegative(),
  kind: MomentKindSchema,
  category: z.enum(MISTAKE_CATEGORIES).nullable(),
  whatHappened: z.string(),
  socraticQuestion: z.string(),
  keyLine: z.string(),
  revealDepthPlies: z.number().int().positive()
});
export type CoachingMoment = z.infer<typeof CoachingMomentSchema>;

export const CoachingPlanSchema = z.object({
  gameSummary: z.string(),
  openingNote: z.string(),
  themes: z.array(z.enum(MISTAKE_CATEGORIES)).max(3),
  connectionToHistory: z.string(),
  /** The one thing this session should improve, proposed from the
   * student's standing evidence (focus areas, measured diagnoses, this
   * game against their own baseline) rather than from whatever the game
   * happens to show — see coach-method.ts's "What the session is for". A
   * proposal, not an order: the coach may take a different goal when the
   * conversation earns it. Plans stored before this field existed simply
   * have no key for it (jsonb, no migration), so every renderer treats it
   * as possibly absent. */
  sessionGoal: z.string(),
  moments: z.array(CoachingMomentSchema).min(1).max(8)
});
export type CoachingPlan = z.infer<typeof CoachingPlanSchema>;
