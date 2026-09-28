import { z } from 'zod';
import { COACH_PERSONAS, RATING_BANDS } from './constants.js';
import { CourseDocumentSchema, CourseGenerationSchema, CourseKindSchema, CourseStatusSchema } from './course.js';

/** The intake form (docs/courses.md §5.3). `learnerSide` null lets code
 * infer it (§3); the route refuses when it can't. */
export const CreateCourseRequestSchema = z.object({
  pgn: z.string().trim().min(1, 'Paste a PGN').max(200_000),
  kind: CourseKindSchema,
  direction: z.string().trim().max(500).default(''),
  levelBand: z.enum(RATING_BANDS).default('improving'),
  learnerSide: z.enum(['white', 'black']).nullable().default(null),
  coachPersona: z.enum(COACH_PERSONAS)
});
export type CreateCourseRequest = z.input<typeof CreateCourseRequestSchema>;

export const CourseResponseSchema = z.object({
  id: z.string(),
  slug: z.string(),
  kind: CourseKindSchema,
  status: CourseStatusSchema,
  title: z.string(),
  direction: z.string(),
  document: CourseDocumentSchema,
  /** Null until AI generation is first started. */
  generation: CourseGenerationSchema.nullable(),
  updatedAt: z.string(),
  /** When the frozen copy was last published; null for a draft. */
  publishedAt: z.string().nullable(),
  /** Notes of the draft whose current text has no uploaded audio yet (§8). */
  missingNoteAudio: z.array(z.object({ episodeId: z.string(), nodeId: z.string() }))
});
export type CourseResponse = z.infer<typeof CourseResponseSchema>;

export const CourseSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  kind: CourseKindSchema,
  status: CourseStatusSchema,
  title: z.string(),
  updatedAt: z.string()
});
export type CourseSummary = z.infer<typeof CourseSummarySchema>;

export const CourseListResponseSchema = z.object({ courses: z.array(CourseSummarySchema) });
export type CourseListResponse = z.infer<typeof CourseListResponseSchema>;

export const SaveCourseDraftRequestSchema = z.object({ document: CourseDocumentSchema });
export type SaveCourseDraftRequest = z.infer<typeof SaveCourseDraftRequestSchema>;

/** docs/courses.md §6.5: regenerate one episode with the creator's words. */
export const RegenerateEpisodeRequestSchema = z.object({ instruction: z.string().trim().max(300).default('') });
export type RegenerateEpisodeRequest = z.input<typeof RegenerateEpisodeRequestSchema>;

/** Start (or resume) AI generation; `restart` drops a stuck or finished run. */
export const StartCourseGenerationRequestSchema = z.object({ restart: z.boolean().default(false) });
export type StartCourseGenerationRequest = z.input<typeof StartCourseGenerationRequestSchema>;

/** docs/courses.md §9: publish the draft. `warningsChecked` is the creator's
 * "I checked these" when the checks still report problems. */
export const PublishCourseRequestSchema = z.object({
  visibility: z.enum(['unlisted', 'public']).default('unlisted'),
  warningsChecked: z.boolean().default(false)
});
export type PublishCourseRequest = z.input<typeof PublishCourseRequestSchema>;

/** docs/courses.md §9: a published course as anyone with the link sees it
 * (`GET /api/public/courses/:slug`). Nothing about the creator: their display
 * name defaults to their email's local part. */
export const PublicCourseResponseSchema = z.object({
  slug: z.string(),
  publishedAt: z.string(),
  document: CourseDocumentSchema,
  /** `<episodeId>:<nodeId>` → the hash its audio is served under
   * (`/api/public/courses/:slug/audio/:hash`); notes without audio are absent. */
  noteAudio: z.record(z.string(), z.string())
});
export type PublicCourseResponse = z.infer<typeof PublicCourseResponseSchema>;
