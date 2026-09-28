import { z } from 'zod';
import { COACH_PERSONAS, RATING_BANDS } from './constants.js';

/** docs/courses.md §3. The creator picks the kind; the AI never guesses it. */
export const COURSE_KINDS = ['opening_reel', 'opening_course', 'tactics', 'trap', 'master_game'] as const;
export const CourseKindSchema = z.enum(COURSE_KINDS);
export type CourseKind = z.infer<typeof CourseKindSchema>;

/** docs/courses.md §9: `removed` is set only by the moderator script. */
export const COURSE_STATUSES = ['draft', 'unlisted', 'public', 'removed'] as const;
export const CourseStatusSchema = z.enum(COURSE_STATUSES);
export type CourseStatus = z.infer<typeof CourseStatusSchema>;

const SquareSchema = z.string().regex(/^[a-h][1-8]$/);
const NodeIdSchema = z.string().regex(/^n\d+$/);

/** A `from === to` arrow is a highlighted square (a PGN `[%csl]`). */
export const CourseArrowSchema = z.object({
  from: SquareSchema,
  to: SquareSchema,
  kind: z.enum(['idea', 'threat', 'best'])
});
export type CourseArrow = z.infer<typeof CourseArrowSchema>;

/** Ids are assigned once, by code, when the PGN is parsed (`parseCourseTree`),
 * and never reused. `comment`/`arrows` are the creator's own, from the PGN. */
export const CourseNodeSchema = z.object({
  id: NodeIdSchema,
  parentId: NodeIdSchema.nullable(),
  san: z.string().min(1),
  uci: z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/),
  fenAfter: z.string().min(1),
  lineId: z.string().min(1),
  comment: z.string().nullable(),
  arrows: z.array(CourseArrowSchema)
});
export type CourseNode = z.infer<typeof CourseNodeSchema>;

export const CourseLineSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  leafNodeId: NodeIdSchema
});
export type CourseLine = z.infer<typeof CourseLineSchema>;

export const CourseChapterSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  lineId: z.string().min(1),
  episodeIds: z.array(z.string().min(1))
});
export type CourseChapter = z.infer<typeof CourseChapterSchema>;

/** One moment of the clip; `nodeId` null for the opening and end card. */
export const CourseBeatSchema = z.object({
  nodeId: NodeIdSchema.nullable(),
  say: z.string(),
  caption: z.string(),
  arrows: z.array(CourseArrowSchema),
  pauseMs: z.number().int().nonnegative().optional()
});
export type CourseBeat = z.infer<typeof CourseBeatSchema>;

export const CourseNoteSchema = z.object({
  nodeId: NodeIdSchema,
  text: z.string(),
  arrows: z.array(CourseArrowSchema)
});
export type CourseNote = z.infer<typeof CourseNoteSchema>;

export const CourseQuizSchema = z.object({
  answerNodeId: NodeIdSchema,
  prompt: z.string(),
  hint: z.string(),
  reveal: z.string()
});
export type CourseQuiz = z.infer<typeof CourseQuizSchema>;

export const CourseEpisodeSchema = z.object({
  id: z.string().min(1),
  /** Legal roles depend on the kind (docs/courses.md §6.3); checked in code. */
  role: z.string().min(1),
  focus: z.string(),
  startNodeId: NodeIdSchema,
  endNodeId: NodeIdSchema,
  beats: z.array(CourseBeatSchema),
  notes: z.array(CourseNoteSchema),
  quiz: CourseQuizSchema.optional(),
  /** Learner moves that become drill positions. */
  drillNodeIds: z.array(NodeIdSchema)
});
export type CourseEpisode = z.infer<typeof CourseEpisodeSchema>;

/** A link on one of the given hosts (or their subdomains), https only. */
function hostedUrl(hosts: string[]) {
  return z
    .string()
    .url()
    .refine((value) => {
      const url = new URL(value);
      return url.protocol === 'https:' && hosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
    }, `Use a link on ${hosts[0]}`);
}

/** docs/courses.md §8: where the creator posted the clips (never uploaded). */
export const CourseClipLinksSchema = z.object({
  youtube: hostedUrl(['youtube.com', 'youtu.be']).optional(),
  shorts: hostedUrl(['youtube.com', 'youtu.be']).optional(),
  instagram: hostedUrl(['instagram.com']).optional(),
  tiktok: hostedUrl(['tiktok.com']).optional()
});
export type CourseClipLinks = z.infer<typeof CourseClipLinksSchema>;

/**
 * docs/courses.md §4. Stored as jsonb (`courses.document` for the draft,
 * `published_document` for the frozen copy). A draft may have fewer than 3
 * takeaways and hook options (a hand-written course fills them in later);
 * publishing requires exactly 3 takeaways.
 */
export const CourseDocumentSchema = z.object({
  version: z.literal(1),
  kind: CourseKindSchema,
  title: z.string().max(120),
  /** "After this you can …" (one sentence). */
  promise: z.string(),
  learnerSide: z.enum(['white', 'black']),
  levelBand: z.enum(RATING_BANDS),
  coachPersona: z.enum(COACH_PERSONAS),
  startFen: z.string().min(1),
  nodes: z.array(CourseNodeSchema),
  lines: z.array(CourseLineSchema),
  chapters: z.array(CourseChapterSchema),
  episodes: z.array(CourseEpisodeSchema),
  takeaways: z.array(z.string()).max(3),
  hookOptions: z.array(z.string()).max(3),
  clipLinks: CourseClipLinksSchema
});
export type CourseDocument = z.infer<typeof CourseDocumentSchema>;



/** docs/courses.md §6.3: the episode roles each kind's playbook uses. */
export const COURSE_ROLES: Record<CourseKind, readonly string[]> = {
  trap: ['hook', 'setup', 'bait', 'quiz', 'punish', 'safety'],
  opening_reel: ['hook', 'line', 'idea', 'remember'],
  opening_course: ['line', 'deviation', 'trap', 'recap'],
  tactics: ['concept', 'example', 'scan'],
  master_game: ['intro', 'moves', 'moment']
};

/** The outline call's answer (docs/courses.md §6.4). Fields the model may
 * leave empty are nullable, not optional: structured output wants every key. */
export const CourseOutlineEpisodeSchema = z.object({
  id: z.string().min(1),
  role: z.string().min(1),
  focus: z.string(),
  startNodeId: NodeIdSchema,
  endNodeId: NodeIdSchema,
  narratedNodeIds: z.array(NodeIdSchema),
  answerNodeId: NodeIdSchema.nullable()
});
export type CourseOutlineEpisode = z.infer<typeof CourseOutlineEpisodeSchema>;

export const CourseOutlineSchema = z.object({
  title: z.string().min(1).max(60),
  promise: z.string(),
  hookOptions: z.array(z.string()).min(3).max(3),
  chapters: z.array(z.object({ title: z.string(), lineId: z.string().min(1), episodes: z.array(CourseOutlineEpisodeSchema).min(1) })).min(1),
  takeaways: z.array(z.string()).min(3).max(3)
});
export type CourseOutline = z.infer<typeof CourseOutlineSchema>;

/** The episode call's answer (§6.5); merged into a `CourseEpisode` by code. */
export const EpisodeScriptSchema = z.object({
  episodeId: z.string().min(1),
  beats: z.array(CourseBeatSchema.extend({ pauseMs: z.number().int().nonnegative().nullable() })),
  notes: z.array(CourseNoteSchema),
  quiz: CourseQuizSchema.nullable()
});
export type EpisodeScript = z.infer<typeof EpisodeScriptSchema>;

/** A verifier problem kept on the draft (§7); `episodeId` null for the whole course. */
export const CourseWarningSchema = z.object({
  episodeId: z.string().nullable(),
  code: z.string(),
  nodeId: z.string().nullable(),
  message: z.string()
});
export type CourseWarning = z.infer<typeof CourseWarningSchema>;

/** The `courses.generation` jsonb: the worker job's state (docs/courses.md
 * §5.2). The outline and the finished episodes let a stopped job resume and
 * one episode be regenerated on its own. */
export const CourseGenerationSchema = z.object({
  status: z.enum(['queued', 'running', 'succeeded', 'failed']),
  /** Short label of the current step, e.g. "Planning" or "Writing episode 3 of 7". */
  step: z.string().nullable(),
  done: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  error: z.string().nullable(),
  outline: CourseOutlineSchema.nullable(),
  finishedEpisodeIds: z.array(z.string()),
  warnings: z.array(CourseWarningSchema),
  /** When the worker last showed it was alive; a running job that stops
   * beating (the worker was killed) reads as failed, so it can be resumed. */
  heartbeatAt: z.string().optional()
});
export type CourseGeneration = z.infer<typeof CourseGenerationSchema>;
