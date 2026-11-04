import { z } from 'zod';
import { MoveQualitySchema } from './analysis.js';
import { COACH_PERSONAS, RATING_BANDS } from './constants.js';
import { DiagnosisCodeIdSchema } from './diagnosis/catalog-types.js';
import { CourseAccessLevelSchema, CourseClipLinksSchema, CourseDocumentSchema, CourseKindSchema, CourseLevelSchema, CourseSeriesSchema, CourseStatusSchema, CourseTagsSchema } from './course.js';

/** docs/courses.md §2: a course from the studio, stored under `slug` (made
 * when new, replaced in place when it exists; its id, status and published
 * copy stay). The app parses the PGN itself, refuses a document whose moves
 * differ from it, and builds the dossier with its own engine: it never
 * takes engine facts from the caller. */
export const ImportCourseRequestSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'A slug is lowercase words joined by hyphens').max(120),
  pgn: z.string().trim().min(1, 'Paste a PGN').max(1_000_000),
  direction: z.string().trim().max(20_000).default(''),
  document: CourseDocumentSchema
});
export type ImportCourseRequest = z.input<typeof ImportCourseRequestSchema>;

/** docs/courses.md §9: what an editor changes on a course besides its
 * content. `draft` takes a published course off the site (its published copy
 * stays until the next publish); `unlisted` and `public` need one. `clipLinks`
 * are set on the draft and the published copy alike. */
export const UpdateCourseRequestSchema = z
  .object({
    status: z.enum(['draft', 'unlisted', 'public']).optional(),
    accessLevel: CourseAccessLevelSchema.optional(),
    clipLinks: CourseClipLinksSchema.optional()
  })
  .refine((update) => Object.values(update).some((value) => value !== undefined), 'Nothing to change');
export type UpdateCourseRequest = z.infer<typeof UpdateCourseRequestSchema>;

/** docs/courses.md §2: an editor's token for `/api/token/courses/*`. The
 * token itself is returned once, at creation. */
export const CourseApiTokenSchema = z.object({ id: z.string(), name: z.string(), createdAt: z.string(), lastUsedAt: z.string().nullable() });
export type CourseApiToken = z.infer<typeof CourseApiTokenSchema>;
export const CourseApiTokenListResponseSchema = z.object({ tokens: z.array(CourseApiTokenSchema) });
export type CourseApiTokenListResponse = z.infer<typeof CourseApiTokenListResponseSchema>;
export const CreateCourseApiTokenRequestSchema = z.object({ name: z.string().trim().min(1, 'Name the token').max(80) });
export const CreateCourseApiTokenResponseSchema = CourseApiTokenSchema.extend({ token: z.string() });
export type CreateCourseApiTokenResponse = z.infer<typeof CreateCourseApiTokenResponseSchema>;

export const CourseResponseSchema = z.object({
  id: z.string(),
  slug: z.string(),
  kind: CourseKindSchema,
  status: CourseStatusSchema,
  accessLevel: CourseAccessLevelSchema,
  title: z.string(),
  direction: z.string(),
  document: CourseDocumentSchema,
  updatedAt: z.string(),
  /** When the frozen copy was last published; null for a draft. */
  publishedAt: z.string().nullable(),
  /** `<episodeId>:<nodeId>` → the uploaded audio of the draft's note, as on the public page. */
  noteAudio: z.record(z.string(), z.string()),
  /** Notes of the draft whose current text has no uploaded audio yet (§8). */
  missingNoteAudio: z.array(z.object({ episodeId: z.string(), nodeId: z.string() })),
  /** Each move's evaluation and quality from the engine pass (`{}` for a
   * reading course): the learner preview's eval bar. */
  evals: z.record(z.string(), z.object({ cp: z.number(), quality: MoveQualitySchema }))
});
export type CourseResponse = z.infer<typeof CourseResponseSchema>;

/** The key in a course's `evals` of a tempting move at `nodeId` (a move off
 * the tree, shown in the video): its evaluation and quality. */
export function temptingEvalKey(nodeId: string, san: string): string {
  return `tempting:${nodeId}:${san}`;
}

export const CourseSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  kind: CourseKindSchema,
  status: CourseStatusSchema,
  title: z.string(),
  updatedAt: z.string(),
  /** The Courses page's row: the draft's promise and size. */
  promise: z.string(),
  episodes: z.number().int(),
  moves: z.number().int(),
  level: CourseLevelSchema.nullable(),
  accessLevel: CourseAccessLevelSchema,
  publishedAt: z.string().nullable()
});
export type CourseSummary = z.infer<typeof CourseSummarySchema>;

export const CourseListResponseSchema = z.object({ courses: z.array(CourseSummarySchema) });
export type CourseListResponse = z.infer<typeof CourseListResponseSchema>;

/** docs/courses.md §9: publish the draft. `warningsChecked` is the creator's
 * "I checked these" when the checks still report problems. */
export const PublishCourseRequestSchema = z.object({
  visibility: z.enum(['unlisted', 'public']).default('unlisted'),
  /** 0 for everyone; N for members at level N or above. */
  accessLevel: CourseAccessLevelSchema.default(0),
  warningsChecked: z.boolean().default(false)
});
export type PublishCourseRequest = z.input<typeof PublishCourseRequestSchema>;

/** Where the checks found a problem: the episode, the move (null when it is
 * about the episode as a whole) and what is wrong. Read before anything is
 * voiced or uploaded. */
export const CourseCheckProblemSchema = z.object({
  episodeId: z.string(),
  episode: z.string(),
  nodeId: z.string().nullable(),
  /** "7…Bxf2+", from the node the problem is about. */
  move: z.string().nullable(),
  message: z.string()
});
export const PublishCheckResponseSchema = z.object({ problems: z.array(CourseCheckProblemSchema) });
export type CourseCheckProblem = z.infer<typeof CourseCheckProblemSchema>;
export type PublishCheckResponse = z.infer<typeof PublishCheckResponseSchema>;
/** The imported course as GET returns it, with the publish check over it. */
export const ImportCourseResponseSchema = CourseResponseSchema.merge(PublishCheckResponseSchema).extend({ created: z.boolean() });
export type ImportCourseResponse = z.infer<typeof ImportCourseResponseSchema>;

/** §8: ask for a URL to upload one note's MP3 to (its size in bytes), then say
 * where it went. The browser sends the file to the bucket, not to the api. */
export const NoteAudioUploadRequestSchema = z.object({ size: z.number().int().positive() });
export const NoteAudioUploadResponseSchema = z.object({ url: z.string().url(), key: z.string() });
export type NoteAudioUploadResponse = z.infer<typeof NoteAudioUploadResponseSchema>;
export const NoteAudioConfirmRequestSchema = z.object({ key: z.string().min(1).max(200) });

export const SeriesLinkSchema = z.object({ slug: z.string(), title: z.string(), position: z.number().int() });
export type SeriesLink = z.infer<typeof SeriesLinkSchema>;

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
  evals: z.record(z.string(), z.object({ cp: z.number(), quality: MoveQualitySchema })),
  /** The lessons before and after this one in its series (public courses
   * only); null at the ends and for a course in no series. */
  seriesNeighbours: z.object({ previous: z.lazy(() => SeriesLinkSchema).nullable(), next: z.lazy(() => SeriesLinkSchema).nullable() })
});
export type PublicCourseResponse = z.infer<typeof PublicCourseResponseSchema>;

/** docs/courses.md §9: the catalogue lists `public` courses only; unlisted
 * ones are reached by their link alone. Members-only courses are listed for
 * signed-in members only (`/api/learn/courses`). `cursor` is the last page's
 * `nextCursor`. */
export const CourseCatalogQuerySchema = z.object({
  kind: CourseKindSchema.optional(),
  /** Phase 90: `curriculum` is by level (rating, then place), `newest` by date. */
  sort: z.enum(['curriculum', 'newest']).default('newest'),
  /** Phase 118: only courses that train this diagnosis code. */
  code: DiagnosisCodeIdSchema.optional(),
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
  level: CourseLevelSchema.nullable(),
  /** The weaknesses it trains (`diagnosisCodes` of the published document). */
  diagnosisCodes: z.array(DiagnosisCodeIdSchema),
  /** The series it belongs to; null when it is a single course. */
  series: CourseSeriesSchema.nullable(),
  /** The creator's diagnostic tags. */
  tags: CourseTagsSchema,
  /** 0 for everyone; above 0 only members see it. */
  accessLevel: CourseAccessLevelSchema
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
    .array(
      // The learner's box holds 2000 characters; the coach's own answers,
      // sent back as history, are the model's and can run longer.
      z.discriminatedUnion('role', [
        z.object({ role: z.literal('user'), content: z.string().trim().min(1).max(2000) }),
        z.object({ role: z.literal('assistant'), content: z.string().trim().min(1).max(8000) })
      ])
    )
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
 * in practice which moves they already know (drill key → state), and, in
 * Practice or a drill, the line and move of the run in progress (`run`, an
 * episode id and the number of its moves played) so it picks up there.
 * `where` is the words for it on the Continue card ("Greedy · move 3"). */
export const CourseEnrollmentPlaceSchema = z.object({
  episode: z.number().int().min(0).max(200).default(0),
  step: z.number().int().min(0).max(2000).default(0),
  practice: z
    .record(CourseDrillKeySchema, z.enum(['arrow', 'some_arrow', 'no_arrow', 'cleared']))
    .refine((practice) => Object.keys(practice).length <= 400, 'Too many practice moves.')
    .default({}),
  run: z.object({ episode: z.string().min(1).max(40), step: z.number().int().min(0).max(2000) }).nullable().default(null),
  where: z.string().max(120).nullable().default(null)
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
