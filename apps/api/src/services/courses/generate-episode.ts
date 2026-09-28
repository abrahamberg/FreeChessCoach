import { verifyCourseEpisode, type CourseVerifyProblem } from '@freechesscoach/chess-analysis';
import { buildCourseEpisodeMessages, courseBudget, episodeWordBudget } from '@freechesscoach/prompts';
import { courseVersions, EpisodeScriptSchema, type CourseEpisode, type CourseOutline, type CourseOutlineEpisode, type CourseWarning, type EpisodeScript } from '@freechesscoach/shared';
import { learnerNodes } from './generate-outline.js';
import type { CourseModelCall, GenerationInputs } from './generation-inputs.js';

export interface WrittenEpisode {
  episode: CourseEpisode;
  warnings: CourseWarning[];
}

/**
 * docs/courses.md §6.5 and §7: one episode call, the verifier, and at most
 * one repair call with the problems listed. Whatever still fails is kept and
 * returned as warnings for the editor.
 */
export async function writeEpisode(
  inputs: GenerationInputs,
  outline: CourseOutline,
  episodeId: string,
  call: CourseModelCall,
  creatorRequest: string | null = null
): Promise<WrittenEpisode> {
  const request = { context: inputs.context, outline, episodeId, creatorRequest };
  const label = { step: 'episode', episodeId, repair: false } as const;
  const first = await call(buildCourseEpisodeMessages(request), EpisodeScriptSchema, label);
  let episode = toEpisode(inputs, outline, episodeId, first);
  let problems = verify(inputs, outline, episode);
  await call.checked?.(label, messagesOf(problems));

  if (problems.length > 0) {
    const retry = { previousOutput: JSON.stringify(first), problems: messagesOf(problems) };
    const repairLabel = { ...label, repair: true };
    const repaired = await call(buildCourseEpisodeMessages({ ...request, retry }), EpisodeScriptSchema, repairLabel);
    episode = toEpisode(inputs, outline, episodeId, repaired);
    problems = verify(inputs, outline, episode);
    await call.checked?.(repairLabel, messagesOf(problems));
  }
  return { episode, warnings: problems.map((problem) => ({ episodeId, ...problem })) };
}

const messagesOf = (problems: CourseVerifyProblem[]): string[] => problems.map((problem) => problem.message);

function verify(inputs: GenerationInputs, outline: CourseOutline, episode: CourseEpisode): CourseVerifyProblem[] {
  const { document } = inputs;
  return [...plannedQuizProblems(outline, episode), ...verifyCourseEpisode({
    episode,
    startFen: document.startFen,
    nodes: document.nodes,
    dossier: inputs.dossier,
    direction: inputs.context.direction,
    budget: episodeWordBudget(courseBudget(document.kind, document.coachPersona), outline, episode.id)
  })];
}

/** The verifier sees one episode, not the outline: a quiz goes exactly
 * where the outline put an answer, and nowhere else. */
function plannedQuizProblems(outline: CourseOutline, episode: CourseEpisode): CourseVerifyProblem[] {
  const answer = plannedEpisode(outline, episode.id).answerNodeId;
  const given = episode.quiz?.answerNodeId ?? null;
  if (answer === given) return [];
  const message = answer === null ? 'The outline gives this episode no quiz, so quiz must be null' : `The outline puts this episode's quiz on ${answer}, so quiz.answerNodeId must be ${answer}`;
  return [{ code: 'quiz', nodeId: given ?? answer, message }];
}

function plannedEpisode(outline: CourseOutline, episodeId: string): CourseOutlineEpisode {
  const planned = outline.chapters.flatMap((chapter) => chapter.episodes).find((episode) => episode.id === episodeId);
  if (!planned) throw new Error(`Episode ${episodeId} is not in the outline`);
  return planned;
}

/** The outline's frame with the script's moves and the plan's budget; null
 * fields become absent. A move with nothing on it (no words, no arrows, not
 * speaking) is dropped: small models write one per move, and the moves play
 * anyway. */
function toEpisode(inputs: GenerationInputs, outline: CourseOutline, episodeId: string, script: EpisodeScript): CourseEpisode {
  const planned = plannedEpisode(outline, episodeId);
  // Only the versions the creator asked for (Phase 91); they add the other by hand.
  const versions = courseVersions(inputs.document);
  return {
    id: planned.id,
    role: planned.role,
    focus: planned.focus,
    startNodeId: planned.startNodeId,
    endNodeId: planned.endNodeId,
    ...(versions.short && script.opener && (script.opener.say.trim() || script.opener.caption.trim()) ? { opener: script.opener } : {}),
    plies: script.plies
      .map((ply) => ({ ...ply, long: versions.long && ply.long, short: versions.short && ply.short }))
      .filter((ply) => ply.long || ply.short || ply.text.trim() || ply.arrows.length)
      .map(({ clipText, caption, ...ply }) => ({
        ...ply,
        ...(versions.short && clipText?.trim() ? { clipText } : {}),
        ...(versions.short && caption?.trim() ? { caption } : {})
      })),
    budget: { long: planned.budgetLong, short: planned.budgetShort, ...(planned.keyNodeIds?.length ? { keyNodeIds: planned.keyNodeIds } : {}) },
    ...(script.quiz ? { quiz: script.quiz } : {}),
    drillNodeIds: learnerNodes(inputs, planned.startNodeId, planned.endNodeId)
  };
}
