import { z } from 'zod';
import { ClassifiedMoveSchema } from './analysis.js';
import { GameReportSchema } from './game-report.js';

/** A review link's secret: 128 random bits, base64url (growth plan A6). */
export const ReviewShareTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{22}$/);

/** The owner's view of one game's link: the token while it is on, else null. */
export const ReviewShareStateSchema = z.object({ token: ReviewShareTokenSchema.nullable() });
export type ReviewShareState = z.infer<typeof ReviewShareStateSchema>;

/**
 * What a shared review link shows anyone (GET /api/public/shared-reviews/:token):
 * the moves, the notes and the report, and nothing about the account. The
 * PGN keeps only the players' names, the result and a set-up position; every
 * other header (site, date, ratings, game URL) and every comment is dropped.
 */
export const SharedReviewSchema = z.object({
  pgn: z.string(),
  userColor: z.enum(['white', 'black']),
  whiteName: z.string().nullable(),
  blackName: z.string().nullable(),
  result: z.string().nullable(),
  classifiedMoves: z.array(ClassifiedMoveSchema),
  gameReport: GameReportSchema,
  /** The ply the link opens on: the shared side's costliest mistake. */
  keyPly: z.number().int().nonnegative()
});
export type SharedReview = z.infer<typeof SharedReviewSchema>;
