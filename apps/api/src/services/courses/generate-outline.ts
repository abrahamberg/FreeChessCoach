import { checkCourseOutline, courseNodePath } from '@freechesscoach/chess-analysis';
import { buildCourseOutlineMessages, courseBudget } from '@freechesscoach/prompts';
import { CourseOutlineSchema, defaultCourseBudget, type CourseDocument, type CourseEpisode, type CourseOutline, type CourseWarning } from '@freechesscoach/shared';
import { ValidationError } from '../../lib/errors.js';
import type { CourseModelCall, GenerationInputs } from './generation-inputs.js';

/**
 * docs/courses.md §6.4: the outline call, checked in code, sent back once
 * with the problems. When the second answer still fails, the code skeleton's
 * episodes (§10) replace the model's, keeping its title, promise, hooks and
 * takeaways, and the creator gets a warning saying so.
 */
export async function planOutline(inputs: GenerationInputs, call: CourseModelCall): Promise<{ outline: CourseOutline; warnings: CourseWarning[] }> {
  const firstLabel = { step: 'outline', episodeId: null, repair: false } as const;
  const first = await call(buildCourseOutlineMessages(inputs.context), CourseOutlineSchema, firstLabel);
  const firstProblems = outlineProblems(inputs, first);
  await call.checked?.(firstLabel, firstProblems);
  if (firstProblems.length === 0) return { outline: first, warnings: [] };

  const retry = { previousOutput: JSON.stringify(first), problems: firstProblems };
  const repairLabel = { ...firstLabel, repair: true };
  const second = await call(buildCourseOutlineMessages(inputs.context, retry), CourseOutlineSchema, repairLabel);
  const problems = outlineProblems(inputs, second);
  await call.checked?.(repairLabel, problems);
  if (problems.length === 0) return { outline: second, warnings: [] };

  const plan = inputs.context.plan;
  if (!plan) throw new ValidationError(`The AI outline failed its checks twice: ${problems.join('; ')}`);
  const outline: CourseOutline = {
    ...second,
    chapters: plan.map((chapter) => ({
      title: chapter.title,
      lineId: chapter.lineId,
      episodes: chapter.episodes.map((episode) => {
        const moves = courseNodePath(inputs.context.nodes, episode.startNodeId, episode.endNodeId)?.length ?? 1;
        const budget = defaultCourseBudget(moves);
        return { ...episode, narratedNodeIds: [], budgetLong: budget.long, budgetShort: budget.short };
      })
    }))
  };
  const message = `The AI outline failed its checks twice, so the episodes come from the code skeleton: ${problems.join('; ')}`;
  return { outline, warnings: [{ episodeId: null, code: 'outline', nodeId: null, message }] };
}

function outlineProblems(inputs: GenerationInputs, outline: CourseOutline): string[] {
  const { document } = inputs;
  return [...planProblems(inputs, outline), ...checkCourseOutline({
    kind: document.kind,
    outline,
    nodes: document.nodes,
    lines: document.lines,
    dossier: inputs.dossier,
    skeleton: inputs.skeleton,
    maxNarrated: courseBudget(document.kind, document.coachPersona).narratedMax
  })];
}

/** The prompt asks the model to keep code's plan; gemma-4-12b stretched the
 * master game's one-move intro over the whole game, duplicating every note. */
function planProblems(inputs: GenerationInputs, outline: CourseOutline): string[] {
  const plan = inputs.context.plan;
  if (!plan) return [];
  const written = new Map(outline.chapters.flatMap((chapter) => chapter.episodes).map((episode) => [episode.id, episode]));
  return plan.flatMap((chapter) => chapter.episodes).flatMap((planned) => {
    const episode = written.get(planned.id);
    if (!episode) return [`episode ${planned.id} (${planned.role}) from the plan is missing`];
    const problems: string[] = [];
    if (episode.role !== planned.role) problems.push(`episode ${planned.id} must have role ${planned.role}, as the plan says`);
    if (episode.startNodeId !== planned.startNodeId || episode.endNodeId !== planned.endNodeId) {
      problems.push(`episode ${planned.id} must run ${planned.startNodeId} to ${planned.endNodeId}, as the plan says (you wrote ${episode.startNodeId} to ${episode.endNodeId})`);
    }
    if ((episode.answerNodeId ?? null) !== planned.answerNodeId) problems.push(`episode ${planned.id} answerNodeId must be ${planned.answerNodeId ?? 'null'}, as the plan says`);
    return problems;
  });
}

/** The outline as the draft's chapters and (still empty) episodes. */
export function documentFromOutline(inputs: GenerationInputs, outline: CourseOutline): CourseDocument {
  return {
    ...inputs.document,
    title: outline.title,
    promise: outline.promise,
    hookOptions: outline.hookOptions,
    takeaways: outline.takeaways,
    clipSeconds: outline.clipSeconds,
    chapters: outline.chapters.map((chapter, index) => ({
      id: `c${index + 1}`,
      title: chapter.title,
      lineId: chapter.lineId,
      episodeIds: chapter.episodes.map((episode) => episode.id)
    })),
    episodes: outline.chapters.flatMap((chapter) =>
      chapter.episodes.map(
        (episode): CourseEpisode => ({
          id: episode.id,
          role: episode.role,
          focus: episode.focus,
          startNodeId: episode.startNodeId,
          endNodeId: episode.endNodeId,
          plies: [],
          budget: { long: episode.budgetLong, short: episode.budgetShort },
          drillNodeIds: learnerNodes(inputs, episode.startNodeId, episode.endNodeId)
        })
      )
    )
  };
}

/** The learner's own moves in the episode: its drill positions. */
export function learnerNodes(inputs: GenerationInputs, startNodeId: string, endNodeId: string): string[] {
  const sides = new Map(inputs.dossier.nodes.map((facts) => [facts.nodeId, facts.side]));
  return (courseNodePath(inputs.document.nodes, startNodeId, endNodeId) ?? []).filter((id) => sides.get(id) === inputs.document.learnerSide);
}
