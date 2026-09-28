import { renderCourseDossier, type CourseSkeleton } from '@freechesscoach/chess-analysis';
import { COURSE_ROLES } from '@freechesscoach/shared';
import { CALIBRATION } from '../calibration.js';
import { courseBudget } from './budget.js';
import { buildCourseSystemPrompt, capitalise, lineMovetext, nodeLabel, promptVersions, type CourseMessages, type CoursePromptContext } from './context.js';
import { episodeRange } from './playbooks.js';

export const COURSE_OUTLINE_JSON_SCHEMA = `{
  "title": string (at most 60 characters),
  "promise": string ("After this lesson you can …"),
  "hookOptions": string[3] (three different angles, each at most 12 words),
  "chapters": [{ "title": string, "lineId": string,
    "episodes": [{ "id": string ("e1", "e2" … across the whole course), "role": string, "focus": string,
      "startNodeId": string, "endNodeId": string, "narratedNodeIds": string[],
      "answerNodeId": string | null,
      "budgetLong": number (moves that may speak in the course),
      "budgetShort": number (moves that may speak in the clip) }] }],
  "takeaways": string[3],
  "clipSeconds": number (the clip's target length)
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
Budgets: clip at most ${budget.seconds}s (clipSeconds), at most ${budget.words} spoken words in total,
hook at most ${budget.hookWords} words, ${episodeRange(context)} episodes.
${speakingBudgets(context, budget.narratedMax)}
Episode roles: ${COURSE_ROLES[context.kind].join(', ')}.

LINES
${context.lines.map((line) => `${line.id} (${line.name}): ${lineMovetext(context, line.leafNodeId)}`).join('\n')}

CANDIDATES (computed by code, choose from these)
${renderCandidates(context, context.skeleton)}
${renderPlan(context)}
DOSSIER
${renderCourseDossier(context.dossier)}

${retry ? `YOUR PREVIOUS OUTLINE HAD THESE PROBLEMS — fix every one\n${retry.problems.map((problem) => `- ${problem}`).join('\n')}\n\nYour previous outline:\n${retry.previousOutput}\n\n` : ''}OUTPUT SCHEMA
${COURSE_OUTLINE_JSON_SCHEMA}`;
  return { system: buildCourseSystemPrompt(context), user };
}

/** Phase 91: the planner budgets only the versions the creator asked for;
 * code sets the other version's budgets to 0 whatever the answer says. */
function speakingBudgets(context: CoursePromptContext, narratedMax: number): string {
  const versions = promptVersions(context);
  const long = `budgetLong is how many of its moves speak in the
course (the moves a learner needs a word on: their key moves, and the opponent's
where the plan changes)`;
  const short = `budgetShort is how many speak in the clip. Across the
whole clip, at most ${narratedMax} moves speak. A hook speaks over its opening
card, so its budgetShort is 0`;
  if (!versions.short) return `Make: the course only, no clip. Every budgetShort is 0.\nSpeaking budgets, per episode: ${long}. It may not exceed the episode's moves.`;
  if (!versions.long) return `Make: the clip only, no course notes. Every budgetLong is 0.\nSpeaking budgets, per episode: ${short}. It may not exceed the episode's moves.`;
  return `Make: the course and the clip.\nSpeaking budgets, per episode: ${long}; ${short}. Neither budget may exceed the episode's moves.`;
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
  }
}
