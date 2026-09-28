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

/**
 * docs/courses.md §4 (Phase 90): one move of an episode, for both versions
 * of the course. `long`: the coach says `text` on this move in the course
 * (the play-through); `short`: in the clip, saying `clipText` when it has a
 * shorter line, else `text`, with `caption` on screen (else one made from
 * the line). A move with neither is played without a word.
 */
export const CoursePlySchema = z.object({
  nodeId: NodeIdSchema,
  text: z.string(),
  clipText: z.string().optional(),
  caption: z.string().optional(),
  arrows: z.array(CourseArrowSchema),
  long: z.boolean(),
  short: z.boolean()
});
export type CoursePly = z.infer<typeof CoursePlySchema>;

/** The card an episode's clip opens on (the hook's title card): no move. */
export const CourseOpenerSchema = z.object({
  say: z.string(),
  caption: z.string()
});
export type CourseOpener = z.infer<typeof CourseOpenerSchema>;

/** A course's target rating and its order among that level's courses. */
export const CourseLevelSchema = z.object({
  rating: z.number().int().min(400).max(2800),
  order: z.number().int().min(1).max(99)
});
export type CourseLevel = z.infer<typeof CourseLevelSchema>;

/** Which versions the planner makes: `long` the course, `short` the clip.
 * At least one; the creator can add the other by hand later. */
export const CourseVersionsSchema = z
  .object({ long: z.boolean(), short: z.boolean() })
  .refine((versions) => versions.long || versions.short, 'Make the course, the clip or both');
export type CourseVersions = z.infer<typeof CourseVersionsSchema>;

/** A document without `versions` makes both. */
export function courseVersions(document: { versions?: CourseVersions }): CourseVersions {
  return document.versions ?? { long: true, short: true };
}

/** What the intake picks for a kind until the creator changes it. */
export function defaultCourseVersions(kind: CourseKind): CourseVersions {
  if (kind === 'opening' || kind === 'master_game') return { long: true, short: false };
  return { long: true, short: true };
}

/** How many moves may speak in each version: set by the planning call. */
export const CourseBudgetSchema = z.object({
  long: z.number().int().nonnegative(),
  short: z.number().int().nonnegative(),
  /** Moves that must speak in both versions (the quiz answer, a mate, a
   * trap's bait and end), set by code; the counts above always fit them. */
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
  /** The clip's opening card, if the episode has one. */
  opener: CourseOpenerSchema.optional(),
  /** The moves that speak, in either version, in move order. */
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
  clipLinks: CourseClipLinksSchema,
  /** The clip's target length (the planning call's budget), seconds. */
  clipSeconds: z.number().int().positive().optional(),
  /** Phase 90: the learner's target rating and the course's place in that
   * level's curriculum ("1200-01"); how the Courses page sorts. */
  level: CourseLevelSchema.optional(),
  /** Phase 91: the versions the planner makes (absent: both). */
  versions: CourseVersionsSchema.optional()
});
export type CourseDocument = z.infer<typeof CourseDocumentSchema>;

/** The clip's line for a move: its own when it has one, else the course's. */
export function clipLine(ply: CoursePly): string {
  return ply.clipText?.trim() || ply.text.trim();
}

/** The clip's caption for a move: set, or the spoken line's first sentence,
 * cut at a word to fit the screen. */
export function clipCaption(ply: CoursePly, maxLength = 60): string {
  if (ply.caption?.trim()) return ply.caption.trim();
  const first = clipLine(ply).split(/(?<=[.!?])\s/)[0] ?? '';
  if (first.length <= maxLength) return first;
  return `${first.slice(0, maxLength - 1).replace(/\s+\S*$/, '')}…`;
}

/** A budget when no plan gives one (code's skeleton, a hand-built course):
 * most moves speak in the course, one or two in the clip. */
export function defaultCourseBudget(moves: number): CourseBudget {
  return { long: Math.min(moves, Math.max(1, Math.ceil(moves * 0.6))), short: Math.min(moves, 2) };
}

/** The clip's length when no plan gives one: a reel. */
export const DEFAULT_CLIP_SECONDS = 45;

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
  /** How many moves may speak: in the course, and in the clip. */
  budgetLong: z.number().int().nonnegative(),
  budgetShort: z.number().int().nonnegative(),
  /** Set by code after the call, never by the model: see CourseBudget. */
  keyNodeIds: z.array(NodeIdSchema).optional()
});
export type CourseOutlineEpisode = z.infer<typeof CourseOutlineEpisodeSchema>;

export const CourseOutlineSchema = z.object({
  title: z.string().min(1).max(60),
  promise: z.string(),
  hookOptions: z.array(z.string()).min(3).max(3),
  chapters: z.array(z.object({ title: z.string(), lineId: z.string().min(1), episodes: z.array(CourseOutlineEpisodeSchema).min(1) })).min(1),
  takeaways: z.array(z.string()).min(3).max(3),
  /** The clip's target length, seconds. */
  clipSeconds: z.number().int().positive()
});
export type CourseOutline = z.infer<typeof CourseOutlineSchema>;

/** The episode call's answer (§6.5); merged into a `CourseEpisode` by code. */
export const EpisodeScriptSchema = z.object({
  episodeId: z.string().min(1),
  opener: CourseOpenerSchema.nullable(),
  plies: z.array(CoursePlySchema.extend({ clipText: z.string().nullable(), caption: z.string().nullable() })),
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
