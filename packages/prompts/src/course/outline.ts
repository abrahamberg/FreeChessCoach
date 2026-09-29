import { renderCourseDossier, type CourseSkeleton } from '@freechesscoach/chess-analysis';
import { COURSE_ROLES } from '@freechesscoach/shared';
import { CALIBRATION } from '../calibration.js';
import { courseBudget, type CourseBudget } from './budget.js';
import { buildCourseSystemPrompt, capitalise, lineMovetext, nodeLabel, promptVideos, type CourseMessages, type CoursePromptContext } from './context.js';
import { episodeRange } from './playbooks.js';

export const COURSE_OUTLINE_JSON_SCHEMA = `{
  "title": string (at most 60 characters),
  "promise": string ("After this lesson you can …"),
  "hookOptions": string[3] (three different angles, each at most 12 words),
  "chapters": [{ "title": string, "lineId": string,
    "episodes": [{ "id": string ("e1", "e2" … across the whole course), "role": string, "focus": string,
      "startNodeId": string, "endNodeId": string, "narratedNodeIds": string[],
      "answerNodeId": string | null,
      "budgetCourse": number (moves that may speak in the course),
      "budgetVideo": number (moves that may speak in the YouTube video) }] }],
  "takeaways": string[3],
  "video": { "title": string, "thumbnailText": string, "hook": string, "outro": string } | null,
  "reel": { "candidate": string, "style": "highlight" | "puzzle" | "promo" } | null
}`;

/** The checks' problems with the previous outline (§6.4: sent back once). */
export interface CourseOutlineRetry {
  previousOutput: string;
  problems: string[];
}

/** docs/courses.md §6.4: the outline call. */
export function buildCourseOutlineMessages(context: CoursePromptContext, retry: CourseOutlineRetry | null = null): CourseMessages {
  const budget = courseBudget(context.kind, context.persona);
  const calibration = CALIBRATION[context.levelBand];
  const user = `COURSE REQUEST
Kind: ${context.kind}
Direction (from the creator): "${context.direction}"
Learner side: ${capitalise(context.learnerSide)}
Learner level: ${calibration.label} — ${calibration.description}
Budgets: ${episodeRange(context)} episodes; the YouTube video ${videoLength(budget)}, at most ${budget.words} spoken words in total.
The length is a guide, not a target: speak every point the dossier supports, add nothing to fill time, and a short course makes a short video.
${speakingBudgets(context, budget.narratedMax)}
Episode roles: ${COURSE_ROLES[context.kind].join(', ')}.

LINES
${context.lines.map((line) => `${line.id} (${line.name}): ${lineMovetext(context, line.leafNodeId)}`).join('\n')}

CANDIDATES (computed by code, choose from these)
${renderCandidates(context, context.skeleton)}
${renderPlan(context)}
${renderProducts(context)}
DOSSIER
${renderCourseDossier(context.dossier)}

${retry ? `YOUR PREVIOUS OUTLINE HAD THESE PROBLEMS — fix every one\n${retry.problems.map((problem) => `- ${problem}`).join('\n')}\n\nYour previous outline:\n${retry.previousOutput}\n\n` : ''}OUTPUT SCHEMA
${COURSE_OUTLINE_JSON_SCHEMA}`;
  return { system: buildCourseSystemPrompt(context), user };
}

/** §13.1: the course is always made; the video's budgets are 0 when there
 * is no video, set by code whatever the answer says. */
function speakingBudgets(context: CoursePromptContext, narratedMax: number): string {
  const course = `budgetCourse is how many of its moves speak in the
course (the moves a learner needs a word on: their key moves, and the opponent's
where the plan changes)`;
  if (!promptVideos(context).video) return `Make: the course. There is no YouTube video: every budgetVideo is 0.\nSpeaking budgets, per episode: ${course}. It may not exceed the episode's moves.`;
  const video = `budgetVideo is how many speak in the YouTube video: the important
moves. Across the whole video, at most ${narratedMax} moves speak`;
  return `Make: the course and the YouTube video.\nSpeaking budgets, per episode: ${course}; ${video}. Neither budget may exceed the episode's moves.`;
}

/** §13.3–13.4: the YouTube video's packaging and the reel's one idea, each
 * only when the course makes it; the reel from code's candidates. */
function renderProducts(context: CoursePromptContext): string {
  const videos = promptVideos(context);
  const video = videos.video
    ? `YOUTUBE VIDEO (write "video")
- title: at most 55 characters, curiosity and clarity ("How a greedy queen gets mated in 8").
- thumbnailText: at most 4 words, big on the thumbnail.
- hook: the first 15 seconds. Jump straight to the premise or the climax ("On move 8, Black's
  queen lands on c1 and it is over"). Never "hey guys", "welcome back" or "today we".
- outro: a question the viewer answers in the comments, then what comes next in the series.`
    : 'YOUTUBE VIDEO: none this time, so give "video" no value.';
  const candidates = context.reelCandidates ?? [];
  const reel = !videos.reel
    ? 'REEL: none this time, so give "reel" no value.'
    : candidates.length
      ? `REEL CANDIDATES (computed by code; pick one id and a style it allows)
${candidates.map((candidate) => `- ${candidate.id} ${candidate.reason}: climax ${nodeLabel(context, candidate.climaxNodeId)}, from ${nodeLabel(context, candidate.startNodeId)} to ${nodeLabel(context, candidate.endNodeId)}; styles ${candidate.styles.filter((style) => style !== 'promo' || videos.video).join(', ')}`).join('\n')}
The reel is one idea: pick the moment a viewer would stop scrolling for. "puzzle" asks the
viewer to find the move; "highlight" plays it; "promo" stops before the climax and sends
viewers to the YouTube video.`
      : 'REEL: code found no moment for one, so give "reel" no value.';
  return `${video}\n\n${reel}\n`;
}

/** The episodes code would build, so a small model fills in words rather
 * than inventing spans (a first real run lost both opening outlines, and the
 * trap's safety episode, to spans the checks refuse). */
function renderPlan(context: CoursePromptContext): string {
  if (!context.plan) return '';
  const chapters = context.plan.map((chapter) => {
    const episodes = chapter.episodes.map((episode) => {
      const span = episode.startNodeId === episode.endNodeId ? `on ${nodeLabel(context, episode.startNodeId)}` : `${nodeLabel(context, episode.startNodeId)} to ${nodeLabel(context, episode.endNodeId)}`;
      const answer = episode.answerNodeId ? `, answerNodeId ${episode.answerNodeId}` : '';
      // The hook speaks over the start; the ending it promises is not its move.
      const hook = episode.role === 'hook' ? ', narratedNodeIds []' : '';
      return `- ${episode.id} ${episode.role}, ${span}${answer}${hook}`;
    });
    return [`Chapter "${chapter.title}", lineId ${chapter.lineId}:`, ...episodes].join('\n');
  });
  return `
EPISODE PLAN (computed by code)
Keep every chapter, episode id, role, startNodeId, endNodeId and answerNodeId
exactly as listed. You write each focus, set each episode's budgets, and pick
narratedNodeIds only from the moves between that episode's startNodeId and
endNodeId.
${chapters.join('\n')}
`;
}

/** The skeleton (§5.5) as the model reads it: node ids with their moves. */
function renderCandidates(context: CoursePromptContext, skeleton: CourseSkeleton | null): string {
  const label = (nodeId: string): string => nodeLabel(context, nodeId);
  const list = (nodeIds: readonly string[]): string => (nodeIds.length ? nodeIds.map(label).join(', ') : 'none');
  if (!skeleton) return 'none: code found no candidates, so build from the dossier alone.';

  switch (skeleton.kind) {
    case 'trap':
      return [
        `bait: ${label(skeleton.baitNodeId)}`,
        `answer: ${skeleton.answerNodeId ? label(skeleton.answerNodeId) : 'none'}`,
        `punish: ${list(skeleton.punishNodeIds)}`,
        `victim's safe move at the bait: ${skeleton.safeMoveSan ?? 'none found'}`,
        `trapper's risky setup moves: ${list(skeleton.trapperRiskNodeIds)}`
      ].join('\n');
    case 'opening':
      return [
        ...skeleton.lines.map((line) => `${line.lineId}: learner moves ${list(line.learnerNodeIds)}; leaves book at ${line.bookExitNodeId ? label(line.bookExitNodeId) : 'never'}`),
        `deviations: ${list(skeleton.deviationNodeIds)}`,
        `traps: ${skeleton.traps.length ? skeleton.traps.map((trap) => `${label(trap.blunderNodeId)} answered by ${label(trap.answerNodeId)}`).join('; ') : 'none'}`
      ].join('\n');
    case 'tactics':
      return `examples, easiest first: ${
        skeleton.examples.map((example) => `${example.lineId} at ${label(example.nodeId)}${example.startNodeId === example.nodeId ? '' : `, starting from ${label(example.startNodeId)}`} (${example.motif ?? 'motif not detected'}, ${example.depth} plies)`).join('; ') || 'none'
      }`;
    case 'master_game':
      return [`critical: ${list(skeleton.criticalNodeIds)}`, `quiz-eligible: ${list(skeleton.quizNodeIds)}`, `phase boundaries: ${list(skeleton.phaseBoundaryNodeIds)}`].join('\n');
    case 'puzzle':
      return [
        `solution, ${skeleton.mateIn ? `mate in ${skeleton.mateIn}` : 'no forced mate'}: ${list(skeleton.learnerNodeIds)}`,
        `moves with a second good answer: ${list(skeleton.unsoundNodeIds)}`
      ].join('\n');
    case 'endgame':
      return [
        `goal: ${skeleton.goal === 'win' ? 'win' : 'hold the draw'}; material: ${skeleton.material}`,
        `technique (learner moves): ${list(skeleton.learnerNodeIds)}`,
        `only moves (the quizzes): ${list(skeleton.onlyMoveNodeIds)}`,
        `defender's tries: ${list(skeleton.deviationNodeIds)}`
      ].join('\n');
  }
}

/** "2 to 5 minutes", "1.5 to 4 minutes". */
function videoLength(budget: CourseBudget): string {
  const minutes = (seconds: number): string => String(Math.round((seconds / 60) * 2) / 2);
  return `${minutes(budget.minSeconds)} to ${minutes(budget.seconds)} minutes`;
}
