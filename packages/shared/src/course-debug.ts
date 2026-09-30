import { z } from 'zod';

/**
 * One model call of a course run, for the editor's "Debug last answer"
 * (docs/plan.md Task 80.6). `snapshot` is the same literal request/response
 * object the coach chat's debug panel shows (apps/api coach-agent-debug.ts
 * `TurnDebugSnapshot`), so the web reuses that panel; around it, which call
 * it was and what our checks found in the answer.
 */
export const CourseDebugCallSchema = z.object({
  at: z.string(),
  step: z.enum(['outline', 'episode', 'reel']),
  /** Null for the outline. */
  episodeId: z.string().nullable(),
  /** The second call, with the first answer's problems listed. */
  repair: z.boolean(),
  durationMs: z.number(),
  /** Null when the call failed. */
  error: z.string().nullable(),
  /** What the outline checks or the verifier found in the answer: empty is
   * clean, null is not checked (the call failed, or the run stopped). */
  problems: z.array(z.string()).nullable(),
  /** The chat's TurnDebugSnapshot, validated by the web panel that shows it. */
  snapshot: z.record(z.string(), z.unknown())
});
export type CourseDebugCall = z.infer<typeof CourseDebugCallSchema>;

export const CourseDebugResponseSchema = z.object({ calls: z.array(CourseDebugCallSchema) });
export type CourseDebugResponse = z.infer<typeof CourseDebugResponseSchema>;

/** Oldest calls are dropped past this, so a course regenerated many times
 * keeps a bounded log. */
export const COURSE_DEBUG_MAX_CALLS = 80;
