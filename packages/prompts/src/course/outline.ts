import { renderCourseDossier, type CourseSkeleton } from '@freechesscoach/chess-analysis';
import { COURSE_ROLES } from '@freechesscoach/shared';
import { CALIBRATION } from '../calibration.js';
import { courseBudget } from './budget.js';
import { buildCourseSystemPrompt, capitalise, lineMovetext, nodeLabel, type CourseMessages, type CoursePromptContext } from './context.js';
import { episodeRange } from './playbooks.js';

export const COURSE_OUTLINE_JSON_SCHEMA = `{
  "title": string (at most 60 characters),
  "promise": string ("After this lesson you can …"),
  "hookOptions": string[3] (three different angles, each at most 12 words),
  "chapters": [{ "title": string, "lineId": string,
    "episodes": [{ "id": string ("e1", "e2" … across the whole course), "role": string, "focus": string,
      "startNodeId": string, "endNodeId": string, "narratedNodeIds": string[],
      "answerNodeId": string | null }] }],
  "takeaways": string[3]
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
Budgets: clip at most ${budget.seconds}s, at most ${budget.words} spoken words in total, hook at
most ${budget.hookWords} words, ${episodeRange(context)} episodes.
Episode roles: ${COURSE_ROLES[context.kind].join(', ')}.

LINES
${context.lines.map((line) => `${line.id} (${line.name}): ${lineMovetext(context, line.leafNodeId)}`).join('\n')}

CANDIDATES (computed by code, choose from these)
${renderCandidates(context, context.skeleton)}

DOSSIER
${renderCourseDossier(context.dossier)}

${retry ? `YOUR PREVIOUS OUTLINE HAD THESE PROBLEMS — fix every one\n${retry.problems.map((problem) => `- ${problem}`).join('\n')}\n\nYour previous outline:\n${retry.previousOutput}\n\n` : ''}OUTPUT SCHEMA
${COURSE_OUTLINE_JSON_SCHEMA}`;
  return { system: buildCourseSystemPrompt(context), user };
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
    case 'opening_reel':
    case 'opening_course':
      return [
        ...skeleton.lines.map((line) => `${line.lineId}: learner moves ${list(line.learnerNodeIds)}; leaves book at ${line.bookExitNodeId ? label(line.bookExitNodeId) : 'never'}`),
        `deviations: ${list(skeleton.deviationNodeIds)}`,
        `traps: ${skeleton.traps.length ? skeleton.traps.map((trap) => `${label(trap.blunderNodeId)} answered by ${label(trap.answerNodeId)}`).join('; ') : 'none'}`
      ].join('\n');
    case 'tactics':
      return `examples, easiest first: ${
        skeleton.examples.map((example) => `${example.lineId} at ${label(example.nodeId)} (${example.motif ?? 'motif not detected'}, ${example.depth} plies)`).join('; ') || 'none'
      }`;
    case 'master_game':
      return [`critical: ${list(skeleton.criticalNodeIds)}`, `quiz-eligible: ${list(skeleton.quizNodeIds)}`, `phase boundaries: ${list(skeleton.phaseBoundaryNodeIds)}`].join('\n');
  }
}
