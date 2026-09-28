import { z } from 'zod';
import { COACH_PERSONAS, RATING_BANDS } from './constants.js';

/** docs/courses.md §3. The creator picks the kind; the AI never guesses it. */
export const COURSE_KINDS = ['trap', 'opening', 'tactics', 'puzzle', 'master_game'] as const;
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

/** docs/courses.md §13.5: a move that looks right here and fails, from the
 * dossier's tempting moves, and why, in the coach's words. */
export const CourseTemptingSchema = z.object({
  san: z.string().min(1),
  why: z.string(),
  /** The engine's answer, copied from the dossier by code (never the
   * model): the video plays it out. */
  refutation: z.array(z.string()).optional()
});
export type CourseTempting = z.infer<typeof CourseTemptingSchema>;

/**
 * docs/courses.md §13.6: one move of an episode. `course`: the coach says
 * `text` on this move in the course (the play-through); `video`: in the
 * YouTube video, saying `say` when it has its own line, else `text`, with
 * `caption` on screen (else one made from the line). `tempting` show under
 * the note in the course, and are played out in the video. A move with
 * neither tick is played without a word.
 */
export const CoursePlySchema = z.object({
  nodeId: NodeIdSchema,
  text: z.string(),
  say: z.string().optional(),
  caption: z.string().optional(),
  arrows: z.array(CourseArrowSchema),
  tempting: z.array(CourseTemptingSchema).optional(),
  course: z.boolean(),
  video: z.boolean()
});
export type CoursePly = z.infer<typeof CoursePlySchema>;

/** A course's target rating and its order among that level's courses. */
export const CourseLevelSchema = z.object({
  rating: z.number().int().min(400).max(2800),
  order: z.number().int().min(1).max(99)
});
export type CourseLevel = z.infer<typeof CourseLevelSchema>;

/** docs/courses.md §13.1: the videos a course makes besides the course
 * itself, which is always made. At least one; the creator can add the other
 * later. */
export const CourseVideosSchema = z
  .object({ video: z.boolean(), reel: z.boolean() })
  .refine((videos) => videos.video || videos.reel, 'Make a reel, a YouTube video or both');
export type CourseVideos = z.infer<typeof CourseVideosSchema>;

/** §13.2: what the intake preselects for a kind. */
export function defaultCourseVideos(kind: CourseKind): CourseVideos {
  if (kind === 'opening' || kind === 'master_game') return { video: true, reel: false };
  return { video: true, reel: true };
}

/** The document's videos, or the kind's default when it has none. */
export function courseVideos(document: { kind: CourseKind; videos?: CourseVideos }): CourseVideos {
  return document.videos ?? defaultCourseVideos(document.kind);
}

/** §13.4: the YouTube video's packaging and its frame. */
export const CourseVideoSchema = z.object({
  /** At most 55 characters: curiosity and clarity. */
  title: z.string(),
  /** At most 4 words, on the thumbnail. */
  thumbnailText: z.string(),
  /** The first 15 seconds: the premise or the climax, never an intro. */
  hook: z.string(),
  /** A question for the comments and what comes next in the series. */
  outro: z.string()
});
export type CourseVideo = z.infer<typeof CourseVideoSchema>;

/** §13.3: the reel's one idea. */
export const CourseReelSchema = z.object({
  style: z.enum(['highlight', 'puzzle', 'promo']),
  startNodeId: NodeIdSchema,
  climaxNodeId: NodeIdSchema,
  endNodeId: NodeIdSchema,
  hook: z.string(),
  topText: z.string(),
  beats: z.array(z.object({ nodeId: NodeIdSchema, say: z.string(), caption: z.string() })),
  payoff: z.string(),
  cta: z.string(),
  loop: z.string()
});
export type CourseReel = z.infer<typeof CourseReelSchema>;

/** How many moves may speak in the course and in the video: set by the
 * planning call; 0 for the video when there is none. */
export const CourseBudgetSchema = z.object({
  course: z.number().int().nonnegative(),
  video: z.number().int().nonnegative(),
  /** Moves that must speak in the course and the video (the quiz answer, a
   * mate, a trap's bait and end), set by code; the counts always fit them. */
  keyNodeIds: z.array(NodeIdSchema).optional()
});
export type CourseBudget = z.infer<typeof CourseBudgetSchema>;

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
  /** The moves that speak or carry arrows, in move order. */
  plies: z.array(CoursePlySchema),
  budget: CourseBudgetSchema.optional(),
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

/** docs/courses.md §8: where the creator posted the videos (never
 * uploaded): `youtube` the video; `shorts`, `instagram`, `tiktok` the reel. */
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
  clipLinks: CourseClipLinksSchema,
  /** Phase 90: the learner's target rating and the course's place in that
   * level's curriculum ("1200-01"); how the Courses page sorts. */
  level: CourseLevelSchema.optional(),
  /** §13.1: the videos besides the course (absent: the kind's default). */
  videos: CourseVideosSchema.optional(),
  video: CourseVideoSchema.optional(),
  reel: CourseReelSchema.optional()
});
export type CourseDocument = z.infer<typeof CourseDocumentSchema>;

/** The video's line for a move: its own when it has one, else the course's. */
export function videoLine(ply: CoursePly): string {
  return ply.say?.trim() || ply.text.trim();
}

/** The video's caption for a move: set, or the spoken line's first
 * sentence, cut at a word to fit the screen. */
export function videoCaption(ply: CoursePly, maxLength = 60): string {
  if (ply.caption?.trim()) return ply.caption.trim();
  const first = videoLine(ply).split(/(?<=[.!?])\s/)[0] ?? '';
  if (first.length <= maxLength) return first;
  return `${first.slice(0, maxLength - 1).replace(/\s+\S*$/, '')}…`;
}

/** A budget when no plan gives one (code's skeleton, a hand-built course):
 * most moves speak in the course, the key ones in the video. */
export function defaultCourseBudget(moves: number): CourseBudget {
  const course = Math.min(moves, Math.max(1, Math.ceil(moves * 0.6)));
  return { course, video: Math.min(moves, Math.max(1, Math.ceil(moves * 0.4))) };
}

/** "1200-01": a course's level and place in its curriculum. */
export function levelCode(level: CourseLevel): string {
  return `${level.rating}-${String(level.order).padStart(2, '0')}`;
}

/** The band the prompts write for, from the target rating. */
export function bandForRating(rating: number): (typeof RATING_BANDS)[number] {
  if (rating < 1000) return 'novice';
  if (rating < 1500) return 'improving';
  if (rating < 1900) return 'club';
  return 'advanced';
}

/** docs/courses.md §6.3: the episode roles each kind's playbook uses. */
export const COURSE_ROLES: Record<CourseKind, readonly string[]> = {
  trap: ['hook', 'setup', 'bait', 'quiz', 'punish', 'safety'],
  opening: ['line', 'deviation', 'trap', 'recap'],
  tactics: ['concept', 'example', 'scan'],
  puzzle: ['question', 'solve', 'recap'],
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
  answerNodeId: NodeIdSchema.nullable(),
  /** How many moves may speak: in the course, and in the video. */
  budgetCourse: z.number().int().nonnegative(),
  budgetVideo: z.number().int().nonnegative(),
  /** Set by code after the call, never by the model: see CourseBudget. */
  keyNodeIds: z.array(NodeIdSchema).optional()
});
export type CourseOutlineEpisode = z.infer<typeof CourseOutlineEpisodeSchema>;

/** §13.3: the outline's reel pick, one of code's candidates. */
export const CourseOutlineReelSchema = z.object({
  candidate: z.string().min(1),
  style: z.enum(['highlight', 'puzzle', 'promo'])
});

export const CourseOutlineSchema = z.object({
  title: z.string().min(1).max(60),
  promise: z.string(),
  hookOptions: z.array(z.string()).min(3).max(3),
  chapters: z.array(z.object({ title: z.string(), lineId: z.string().min(1), episodes: z.array(CourseOutlineEpisodeSchema).min(1) })).min(1),
  takeaways: z.array(z.string()).min(3).max(3),
  /** §13.4: null when the course makes no YouTube video. */
  video: CourseVideoSchema.nullable(),
  /** §13.3: null when the course makes no reel. */
  reel: CourseOutlineReelSchema.nullable()
});
export type CourseOutline = z.infer<typeof CourseOutlineSchema>;

/** What the outline call asks the model for: the outline without the key
 * moves code adds. A strict structured-output provider (OpenAI) refuses a
 * schema with any key the model may leave out. */
export const CourseOutlineCallSchema = CourseOutlineSchema.extend({
  chapters: z.array(z.object({ title: z.string(), lineId: z.string().min(1), episodes: z.array(CourseOutlineEpisodeSchema.omit({ keyNodeIds: true })).min(1) })).min(1)
});

/** The episode call's answer (§6.5); merged into a `CourseEpisode` by code. */
export const EpisodeScriptSchema = z.object({
  episodeId: z.string().min(1),
  // Every key required, none defaulted (a strict provider refuses both): an
  // empty "tempting" is [].
  plies: z.array(CoursePlySchema.extend({ say: z.string().nullable(), caption: z.string().nullable(), tempting: z.array(CourseTemptingSchema.pick({ san: true, why: true })) })),
  quiz: CourseQuizSchema.nullable()
});
export type EpisodeScript = z.infer<typeof EpisodeScriptSchema>;

/** The reel call's answer (§13.3); code adds the style and span. */
export const ReelScriptSchema = CourseReelSchema.pick({ hook: true, topText: true, beats: true, payoff: true, cta: true, loop: true });
export type ReelScript = z.infer<typeof ReelScriptSchema>;

/** The `episodeId` of the reel's warnings (§13.3): the reel has no episode,
 * and a resumed run keeps them apart from the whole course's. */
export const REEL_WARNINGS = 'reel';

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
