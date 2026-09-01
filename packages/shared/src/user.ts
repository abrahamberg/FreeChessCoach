import { z } from 'zod';
import { COACH_PERSONAS, ENGINE_MODES, RATING_BANDS, RATING_SOURCES, TTS_BACKENDS, type RatingBand } from './constants.js';

export const UserProfileSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string(),
  ratingBand: z.enum(RATING_BANDS),
  /** Numeric Chess.com Rapid rating (docs/diagnose.md §0.1/§0.2), or null
   * when only the coarse `ratingBand` is known. */
  rating: z.number().int().nullable(),
  ratingSource: z.enum(RATING_SOURCES).nullable(),
  engineMode: z.enum(ENGINE_MODES),
  coachPersona: z.enum(COACH_PERSONAS),
  lichessUsername: z.string().nullable(),
  chesscomUsername: z.string().nullable(),
  selfAssessment: z.string().nullable(),
  creditBalance: z.number().int(),
  ttsEnabled: z.boolean(),
  ttsBackend: z.enum(TTS_BACKENDS)
});
export type UserProfile = z.infer<typeof UserProfileSchema>;

export const UpdateUserProfileRequestSchema = z.object({
  displayName: z.string().trim().min(1, 'Nickname cannot be empty').max(60, 'Nickname must be 60 characters or fewer').optional(),
  ratingBand: z.enum(RATING_BANDS).optional(),
  /** Self-reported numeric rating. Always attributed server-side as
   * ratingSource: 'self' (never client-supplied — see user-profile.ts's
   * updateProfile) and re-derives ratingBand, taking priority over a
   * `ratingBand` also present in the same request. */
  rating: z.number().int().min(100).max(3500).optional(),
  engineMode: z.enum(ENGINE_MODES).optional(),
  coachPersona: z.enum(COACH_PERSONAS).optional(),
  lichessUsername: z.string().nullable().optional(),
  chesscomUsername: z.string().nullable().optional(),
  selfAssessment: z.string().nullable().optional(),
  ttsEnabled: z.boolean().optional(),
  ttsBackend: z.enum(TTS_BACKENDS).optional()
});
export type UpdateUserProfileRequest = z.infer<typeof UpdateUserProfileRequestSchema>;

const RATING_BAND_CEILINGS: readonly (readonly [number, RatingBand])[] = [
  [900, 'novice'],
  [1300, 'improving'],
  [1700, 'club']
];

/** Collapses a numeric Chess.com Rapid rating to this app's 4 coarse bands
 * (docs/diagnose.md §0.2's anchors), for prompt calibration
 * (packages/prompts/calibration.ts) and other band-keyed display logic. */
export function deriveRatingBand(rating: number): RatingBand {
  for (const [ceiling, band] of RATING_BAND_CEILINGS) {
    if (rating < ceiling) return band;
  }
  return 'advanced';
}
