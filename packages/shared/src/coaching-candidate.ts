import { z } from 'zod';
import { MAX_IN_FLIGHT_IMPORTS } from './import-limits.js';
import { TacticMotifTypeSchema } from './tactic-motif.js';

/** GET /api/games/coaching-candidate?gameIds=a,b,c — a just-imported batch is
 * at most `MAX_IN_FLIGHT_IMPORTS` games, so that is also the id cap. */
export const CoachingCandidateQuerySchema = z.object({
  gameIds: z
    .string()
    .transform((raw) => [...new Set(raw.split(',').filter((id) => id.length > 0))])
    .pipe(z.array(z.string().uuid()).min(1).max(MAX_IN_FLIGHT_IMPORTS))
});
export type CoachingCandidateQuery = z.infer<typeof CoachingCandidateQuerySchema>;

export const CoachingCandidateMotifSchema = z.object({
  motif: TacticMotifTypeSchema,
  missed: z.number().int().nonnegative(),
  allowed: z.number().int().nonnegative()
});

/** The batch's game most worth a coaching session, ranked programmatically by
 * tactical points (no AI); `candidate` is null when none of the ids is an
 * analyzed game of the caller's. */
export const CoachingCandidateResponseSchema = z.object({
  candidate: z
    .object({
      gameId: z.string().min(1),
      points: z.number().nonnegative(),
      topMotifs: z.array(CoachingCandidateMotifSchema)
    })
    .nullable()
});
export type CoachingCandidateResponse = z.infer<typeof CoachingCandidateResponseSchema>;
