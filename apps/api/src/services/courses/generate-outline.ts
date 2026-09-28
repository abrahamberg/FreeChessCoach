import { checkCourseOutline, courseNodePath } from '@freechesscoach/chess-analysis';
import { buildCourseOutlineMessages, courseBudget } from '@freechesscoach/prompts';
import { CourseOutlineSchema, type CourseDocument, type CourseEpisode, type CourseOutline, type CourseWarning } from '@freechesscoach/shared';
import { ValidationError } from '../../lib/errors.js';
import type { CourseModelCall, GenerationInputs } from './generation-inputs.js';
import { buildManualEpisodes } from './manual-episodes.js';

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

  if (!inputs.skeleton) throw new ValidationError(`The AI outline failed its checks twice: ${problems.join('; ')}`);
  const manual = buildManualEpisodes({ document: inputs.document, skeleton: inputs.skeleton, dossier: inputs.dossier, lines: inputs.lineGames });
  const byId = new Map(manual.episodes.map((episode) => [episode.id, episode]));
  const outline: CourseOutline = {
    ...second,
    chapters: manual.chapters.map((chapter) => ({
      title: chapter.title,
      lineId: chapter.lineId,
      episodes: chapter.episodeIds.flatMap((id) => {
        const episode = byId.get(id);
        return episode ? [{ id, role: episode.role, focus: episode.focus, startNodeId: episode.startNodeId, endNodeId: episode.endNodeId, narratedNodeIds: [], answerNodeId: episode.quiz?.answerNodeId ?? null }] : [];
      })
    }))
  };
  const message = `The AI outline failed its checks twice, so the episodes come from the code skeleton: ${problems.join('; ')}`;
  return { outline, warnings: [{ episodeId: null, code: 'outline', nodeId: null, message }] };
}

function outlineProblems(inputs: GenerationInputs, outline: CourseOutline): string[] {
  const { document } = inputs;
  return checkCourseOutline({
    kind: document.kind,
    outline,
    nodes: document.nodes,
    lines: document.lines,
    dossier: inputs.dossier,
    skeleton: inputs.skeleton,
    maxNarrated: courseBudget(document.kind, document.coachPersona).narratedMax
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
          beats: [],
          notes: [],
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
