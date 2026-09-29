import { courseNodePath } from '@freechesscoach/chess-analysis';
import { buildCourseEpisodeMessages, buildCoursePlaybook, courseBudget } from '@freechesscoach/prompts';
import { defaultCourseBudget, type CourseOutline } from '@freechesscoach/shared';
import { withKeyMoves, withProducts } from '../src/services/courses/generate-outline.js';
import type { GenerationInputs } from '../src/services/courses/generation-inputs.js';

/** `--facts`: what code hands the model for one golden course, with no
 * model: the playbook, the reel candidates, and each episode of code's own
 * plan with the facts its call gets. A fact that is wrong or missing here is
 * wrong in every script written from it. */
export function printCourseFacts(name: string, inputs: GenerationInputs): void {
  const { context, document } = inputs;
  const lines = [`=== ${name} — ${document.kind}, ${document.coachPersona}, ${document.levelBand}, learner ${document.learnerSide}`, `Direction: ${context.direction}`, ''];
  lines.push('PLAYBOOK', buildCoursePlaybook(context, courseBudget(context.kind, context.persona)), '');
  lines.push('REEL CANDIDATES', ...(context.reelCandidates ?? []).map((candidate) => `  ${candidate.id} ${candidate.reason} ${candidate.startNodeId}–${candidate.endNodeId}, climax ${candidate.climaxNodeId} [${candidate.styles.join(', ')}]`), '');
  const outline = planOutline(inputs);
  if (!outline) {
    lines.push('NO CODE PLAN: the model plans the episodes itself.');
    console.log(lines.join('\n'));
    return;
  }
  for (const episode of outline.chapters.flatMap((chapter) => chapter.episodes)) {
    lines.push(`--- ${episode.id} ${episode.role}`, buildCourseEpisodeMessages({ context, outline, episodeId: episode.id }).user, '');
  }
  console.log(lines.join('\n'));
}

/** Code's plan as the outline, the way the outline's fallback builds it. */
function planOutline(inputs: GenerationInputs): CourseOutline | null {
  const { plan, nodes } = inputs.context;
  if (!plan) return null;
  const outline: CourseOutline = {
    title: inputs.document.title || 'Untitled',
    promise: '',
    hookOptions: ['', '', ''],
    takeaways: ['', '', ''],
    video: null,
    reel: null,
    chapters: plan.map((chapter) => ({
      title: chapter.title,
      lineId: chapter.lineId,
      episodes: chapter.episodes.map((episode) => {
        const budget = defaultCourseBudget(courseNodePath(nodes, episode.startNodeId, episode.endNodeId)?.length ?? 1);
        return { ...episode, narratedNodeIds: [], budgetCourse: budget.course, budgetVideo: budget.video };
      })
    }))
  };
  return withProducts(inputs, withKeyMoves(inputs, outline));
}
