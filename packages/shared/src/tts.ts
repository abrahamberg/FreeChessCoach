import { z } from 'zod';
import { COACH_PERSONAS } from './constants.js';

/** POST /api/tts/speak body. The 4000-char cap is a defensive ceiling, not a
 * tuned limit — coach turns are conversational prose, nowhere near this
 * long; it exists to bound cost on a single call. */
export const TtsSpeakRequestSchema = z.object({
  text: z.string().trim().min(1, 'Text cannot be empty').max(4000, 'Text must be 4000 characters or fewer'),
  persona: z.enum(COACH_PERSONAS),
  /** A Settings "hear it" click: explicit consent to spend a little of the
   * user's own OpenAI credit, so it skips the voice-enabled gate. */
  preview: z.boolean().optional()
});
export type TtsSpeakRequest = z.infer<typeof TtsSpeakRequestSchema>;
