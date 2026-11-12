import { z } from 'zod';
import { EngineEvalSchema } from './analysis.js';
import { ENGINE_MULTI_PV, REVIEW_MULTI_PV } from './constants.js';

/** Positions per request: the free review sends six at a time
 * (`collectReviewEvals`), a few more leave room for its Brilliant re-search. */
export const PUBLIC_REVIEW_MAX_POSITIONS = 12;

/**
 * The no-account review's server engine (POST /api/public/review-engine):
 * a batch of positions searched for a visitor whose device is too slow for
 * the engine in the browser. The depth is the server's, always
 * `ENGINE_DEFAULT_DEPTH`; the lines are the two counts the review asks for.
 */
export const PublicReviewEngineRequestSchema = z.object({
  fens: z.array(z.string().min(1).max(100)).min(1).max(PUBLIC_REVIEW_MAX_POSITIONS),
  multiPv: z.union([z.literal(REVIEW_MULTI_PV), z.literal(ENGINE_MULTI_PV)])
});
export type PublicReviewEngineRequest = z.infer<typeof PublicReviewEngineRequestSchema>;

/** One eval per fen, in order, White's side; `cached` counts the positions
 * the server already knew (the Lichess eval index) and did not search. */
export const PublicReviewEngineResponseSchema = z.object({
  evals: z.array(EngineEvalSchema),
  cached: z.number().int().nonnegative()
});
export type PublicReviewEngineResponse = z.infer<typeof PublicReviewEngineResponseSchema>;
