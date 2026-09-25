import { z } from 'zod';

/** How the coach's planned move was chosen (apps/api coach-move-plan.ts):
 * `punish` — the refutation of the student's last move; `mistake` — a
 * deliberate, level-sized mistake; `alternate` — a sound move that is not the
 * engine's first choice; `best` — the engine's best move; `book` — an
 * opening-book move. */
export const CoachMoveKindSchema = z.enum(['book', 'best', 'alternate', 'mistake', 'punish']);
export type CoachMoveKind = z.infer<typeof CoachMoveKindSchema>;

/** The move the coach plans to play this turn in a live game, picked in code
 * at the student's level before the coach model runs. */
export const CoachMovePlanSchema = z.object({
  san: z.string().min(1),
  kind: CoachMoveKindSchema,
  /** The student's usual level and the strength this move was picked at. */
  levelElo: z.number().int(),
  targetElo: z.number().int(),
  /** What the student's moves this game are worth, null early on. */
  performanceElo: z.number().int().nullable(),
  /** Winning chances (win-percentage points) the move gives away against the
   * engine's best, null when unknown (a book move). */
  costWinPct: z.number().nullable()
});
export type CoachMovePlan = z.infer<typeof CoachMovePlanSchema>;
