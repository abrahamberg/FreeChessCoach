import { z } from 'zod';
import { MoveQualitySchema } from './analysis.js';
import { COACH_PERSONAS, RATING_BANDS } from './constants.js';
import { CourseDocumentSchema, CourseGenerationSchema, CourseKindSchema, CourseLevelSchema, CourseStatusSchema, CourseVersionsSchema } from './course.js';

/** The intake form (docs/courses.md §5.3). `learnerSide` null lets code
 * infer it (§3); the route refuses when it can't. */
export const CreateCourseRequestSchema = z.object({
  pgn: z.string().trim().min(1, 'Paste a PGN').max(200_000),
  kind: CourseKindSchema,
  direction: z.string().trim().max(500).default(''),
  levelBand: z.enum(RATING_BANDS).default('improving'),
  learnerSide: z.enum(['white', 'black']).nullable().default(null),
  coachPersona: z.enum(COACH_PERSONAS),
  /** Phase 90: the learner's target rating; it sets the band the prompts
   * write for, and the course takes the next place at that level ("1200-02"). */
  rating: z.number().int().min(400).max(2800).optional(),
  /** Phase 91: what the planner makes; the kind's default when absent. */
  versions: CourseVersionsSchema.optional()
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
  missingNoteAudio: z.array(z.object({ episodeId: z.string(), nodeId: z.string() })),
  /** Each move's evaluation and quality from the engine pass (`{}` before
   * it ran): the clip's board sounds. */
  evals: z.record(z.string(), z.object({ cp: z.number(), quality: MoveQualitySchema }))
});
export type CourseResponse = z.infer<typeof CourseResponseSchema>;

export const CourseSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  kind: CourseKindSchema,
  status: CourseStatusSchema,
  title: z.string(),
  updatedAt: z.string(),
  /** The Course studio's card (Phase 89): the draft's promise and size, and
   * the AI's writing, if it ran. */
  promise: z.string(),
  episodes: z.number().int(),
  moves: z.number().int(),
  level: CourseLevelSchema.nullable(),
  generation: z.object({ status: CourseGenerationSchema.shape.status, done: z.number(), total: z.number() }).nullable()
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
  /** `<episodeId>:<nodeId>` → its audio file's URL, named by the file's own
   * hash so it can be cached for good; notes without audio are absent. */
  noteAudio: z.record(z.string(), z.string()),
  /** Node id → White's evaluation after the move and its quality, from the
   * course's engine pass; `{}` when it has none (docs/courses.md §9). */
  evals: z.record(z.string(), z.object({ cp: z.number(), quality: MoveQualitySchema }))
});
export type PublicCourseResponse = z.infer<typeof PublicCourseResponseSchema>;

/** docs/courses.md §9: the catalogue lists `public` courses only; unlisted
 * ones are reached by their link alone. `cursor` is the last page's
 * `nextCursor`. */
export const CourseCatalogQuerySchema = z.object({
  kind: CourseKindSchema.optional(),
  /** Phase 90: `curriculum` is by level (rating, then place), `newest` by date. */
  sort: z.enum(['curriculum', 'newest']).default('newest'),
  cursor: z.string().regex(/^[A-Za-z0-9_-]{1,120}$/).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(50)
});
export type CourseCatalogQuery = z.infer<typeof CourseCatalogQuerySchema>;

export const CourseCatalogItemSchema = z.object({
  slug: z.string(),
  title: z.string(),
  promise: z.string(),
  kind: CourseKindSchema,
  levelBand: z.enum(RATING_BANDS),
  coachPersona: z.enum(COACH_PERSONAS),
  learnerSide: z.enum(['white', 'black']),
  publishedAt: z.string(),
  episodes: z.number().int(),
  moves: z.number().int(),
  /** Where it sits in its level's curriculum; null when the creator set none. */
  level: CourseLevelSchema.nullable()
});
export type CourseCatalogItem = z.infer<typeof CourseCatalogItemSchema>;

export const CourseCatalogResponseSchema = z.object({ items: z.array(CourseCatalogItemSchema), nextCursor: z.string().nullable() });
export type CourseCatalogResponse = z.infer<typeof CourseCatalogResponseSchema>;

/** docs/courses.md §11: the learner's own calendar day, YYYY-MM-DD. */
export const CourseDaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** A position + move: the normalised FEN key (no move clocks), `|`, the UCI move. */
export const CourseDrillKeySchema = z.string().regex(/^[1-8pnbrqkPNBRQK/]{15,71} [wb] (?:[KQkq]{1,4}|-) (?:[a-h][36]|-)\|[a-h][1-8][a-h][1-8][qrbn]?$/);

/** One drilled move; the server moves its schedule on (or back). `correct`
 * is the learner's first try at it in this drill. */
export const CourseDrillResultSchema = z.object({
  key: CourseDrillKeySchema,
  san: z.string().min(1).max(10),
  courseSlug: z.string().min(1).max(120),
  correct: z.boolean()
});
export type CourseDrillResult = z.infer<typeof CourseDrillResultSchema>;

export const RecordCourseDrillRequestSchema = z.object({ today: CourseDaySchema, results: z.array(CourseDrillResultSchema).min(1).max(50) });
export type RecordCourseDrillRequest = z.infer<typeof RecordCourseDrillRequestSchema>;

/** Where one position + move stands; `dueOn` is null once mastered. */
export const CourseProgressItemSchema = z.object({
  key: CourseDrillKeySchema,
  san: z.string().min(1).max(10),
  courseSlug: z.string().min(1).max(120),
  step: z.number().int().min(0).max(4),
  dueOn: CourseDaySchema.nullable(),
  updatedAt: z.string()
});
export type CourseProgressItem = z.infer<typeof CourseProgressItemSchema>;

export const CourseProgressResponseSchema = z.object({ items: z.array(CourseProgressItemSchema) });
export type CourseProgressResponse = z.infer<typeof CourseProgressResponseSchema>;

/** The learner's progress on these positions + moves (a course's drill). */
export const CourseProgressLookupRequestSchema = z.object({ keys: z.array(CourseDrillKeySchema).max(500) });

/** Progress kept in the browser before signing in, moved to the account; the
 * later of the two copies of a move wins. */
export const ImportCourseProgressRequestSchema = z.object({
  items: z.array(CourseProgressItemSchema).max(2000),
  /** Courses being learned in this browser (docs/courses.md §11); the newer copy wins. */
  enrollments: z.array(z.lazy(() => ImportCourseEnrollmentSchema)).max(200).default([])
});

/** The Games page's "Due today" card: moves to review, by course. */
export const CourseReviewDueResponseSchema = z.object({
  courses: z.array(z.object({ slug: z.string(), title: z.string(), due: z.number().int(), sans: z.array(z.string()) }))
});
export type CourseReviewDueResponse = z.infer<typeof CourseReviewDueResponseSchema>;

/** docs/courses.md §11: the learner asks their own coach about one position
 * of a published course. The conversation lives in the browser and is sent
 * whole each time (text only, last message the learner's); the server takes
 * the course, the position and the engine facts from its own copy. */
export const AskCourseCoachRequestSchema = z.object({
  slug: z.string().min(1).max(120),
  episodeId: z.string().min(1).max(40),
  /** The board after this move; null for the position before the episode's first move. */
  nodeId: z.string().regex(/^n\d+$/).nullable(),
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(2000) }))
    .min(1)
    .max(24)
    .refine((messages) => messages.at(-1)?.role === 'user', 'The last message must be the learner’s question.')
});
export type AskCourseCoachRequest = z.infer<typeof AskCourseCoachRequestSchema>;

/** docs/courses.md §11: the stages of learning a course, in order. */
export const COURSE_STAGES = ['play_through', 'practice', 'drill', 'full_drill'] as const;
export const CourseStageSchema = z.enum(COURSE_STAGES);
export type CourseStage = z.infer<typeof CourseStageSchema>;

/** Where the learner is in a course: the play-through's episode and step,
 * and in practice which moves they already know (drill key → state). A drill
 * restarts at its beginning; it is short, and its order follows the review. */
export const CourseEnrollmentPlaceSchema = z.object({
  episode: z.number().int().min(0).max(200).default(0),
  step: z.number().int().min(0).max(2000).default(0),
  practice: z
    .record(CourseDrillKeySchema, z.enum(['arrow', 'some_arrow', 'no_arrow', 'cleared']))
    .refine((practice) => Object.keys(practice).length <= 400, 'Too many practice moves.')
    .default({})
});
export type CourseEnrollmentPlace = z.infer<typeof CourseEnrollmentPlaceSchema>;

export const SaveCourseEnrollmentRequestSchema = z.object({
  stage: CourseStageSchema,
  place: CourseEnrollmentPlaceSchema,
  stagesDone: z.array(CourseStageSchema).max(COURSE_STAGES.length)
});
export type SaveCourseEnrollmentRequest = z.infer<typeof SaveCourseEnrollmentRequestSchema>;

export const ImportCourseEnrollmentSchema = SaveCourseEnrollmentRequestSchema.extend({
  slug: z.string().min(1).max(120),
  updatedAt: z.string()
});
export type ImportCourseEnrollment = z.infer<typeof ImportCourseEnrollmentSchema>;

/** A course the learner has started, with where they are in it. */
export const CourseEnrollmentSchema = SaveCourseEnrollmentRequestSchema.extend({
  slug: z.string(),
  title: z.string(),
  kind: CourseKindSchema,
  startedAt: z.string(),
  updatedAt: z.string(),
  /** Set once the full drill is finished. */
  completedAt: z.string().nullable()
});
export type CourseEnrollment = z.infer<typeof CourseEnrollmentSchema>;

export const CourseEnrollmentListResponseSchema = z.object({ items: z.array(CourseEnrollmentSchema) });
export type CourseEnrollmentListResponse = z.infer<typeof CourseEnrollmentListResponseSchema>;
