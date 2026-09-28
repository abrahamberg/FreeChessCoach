import { verifyCourseEpisode, type CourseVerifyProblem } from '@freechesscoach/chess-analysis';
import { buildCourseEpisodeMessages, courseBudget, episodeWordBudget } from '@freechesscoach/prompts';
import { EpisodeScriptSchema, type CourseEpisode, type CourseOutline, type CourseOutlineEpisode, type CourseWarning, type EpisodeScript } from '@freechesscoach/shared';
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
  const first = await call(buildCourseEpisodeMessages(request), EpisodeScriptSchema);
  let episode = toEpisode(inputs, outline, episodeId, first);
  let problems = verify(inputs, outline, episode);

  if (problems.length > 0) {
    const retry = { previousOutput: JSON.stringify(first), problems: problems.map((problem) => problem.message) };
    const repaired = await call(buildCourseEpisodeMessages({ ...request, retry }), EpisodeScriptSchema);
    episode = toEpisode(inputs, outline, episodeId, repaired);
    problems = verify(inputs, outline, episode);
  }
  return { episode, warnings: problems.map((problem) => ({ episodeId, ...problem })) };
}

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

/** The outline's frame with the script's text; null fields become absent. */
function toEpisode(inputs: GenerationInputs, outline: CourseOutline, episodeId: string, script: EpisodeScript): CourseEpisode {
  const planned = plannedEpisode(outline, episodeId);
  return {
    id: planned.id,
    role: planned.role,
    focus: planned.focus,
    startNodeId: planned.startNodeId,
    endNodeId: planned.endNodeId,
    beats: script.beats.map(({ pauseMs, ...beat }) => (pauseMs === null ? beat : { ...beat, pauseMs })),
    notes: script.notes,
    ...(script.quiz ? { quiz: script.quiz } : {}),
    drillNodeIds: learnerNodes(inputs, planned.startNodeId, planned.endNodeId)
  };
}
