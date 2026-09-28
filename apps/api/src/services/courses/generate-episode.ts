import { courseLines, overusedOpeners, verifyCourseEpisode, type CourseVerifyProblem } from '@freechesscoach/chess-analysis';
import { buildCourseEpisodeMessages, courseBudget, episodeWordBudget } from '@freechesscoach/prompts';
import { courseVideos, EpisodeScriptSchema, type CourseEpisode, type CourseTempting, type CourseOutline, type CourseOutlineEpisode, type CourseWarning, type EpisodeScript } from '@freechesscoach/shared';
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
  const request = { context: inputs.context, outline, episodeId, creatorRequest, usedOpeners: overusedOpeners(courseLines(inputs.document, episodeId)) };
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

/** §13.5: each tempting move with the engine's answer from the dossier, for
 * the video to play out; one the dossier does not know keeps none (the
 * verifier flags it). */
/** §13.5: the model picks which of the dossier's tempting moves to discuss
 * and writes why; the move's spelling and its refutation are the dossier's.
 * One the dossier does not list at that move is dropped: the first real run
 * put 7…Qxa1 on a move where the engine never looked at it. */
function withRefutations(inputs: GenerationInputs, nodeId: string, tempting: { san: string; why: string }[]): CourseTempting[] {
  const facts = inputs.dossier.nodes.find((node) => node.nodeId === nodeId)?.tempting ?? [];
  // The dossier writes "Qxc3+?"; the model may keep the "?" or drop the "+".
  const plain = (san: string): string => san.replace(/[+#?!]+$/, '');
  return tempting.flatMap((each) => {
    const fact = facts.find((candidate) => plain(candidate.san) === plain(each.san));
    return fact ? [{ san: fact.san, why: each.why, refutation: fact.refutation }] : [];
  });
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
  // The course always; the video only when the course makes one (§13.1).
  const video = courseVideos(inputs.document).video;
  return {
    id: planned.id,
    role: planned.role,
    focus: planned.focus,
    startNodeId: planned.startNodeId,
    endNodeId: planned.endNodeId,
    plies: script.plies
      .map((ply) => ({ ...ply, video: video && ply.video }))
      .filter((ply) => ply.course || ply.video || ply.text.trim() || ply.arrows.length || ply.tempting.length)
      .map(({ say, caption, tempting, ...ply }) => {
        const known = withRefutations(inputs, ply.nodeId, tempting);
        return {
          ...ply,
          ...(video && say?.trim() ? { say } : {}),
          ...(video && caption?.trim() ? { caption } : {}),
          ...(known.length ? { tempting: known } : {})
        };
      }),
    budget: { course: planned.budgetCourse, video: planned.budgetVideo, ...(planned.keyNodeIds?.length ? { keyNodeIds: planned.keyNodeIds } : {}) },
    ...(script.quiz ? { quiz: script.quiz } : {}),
    drillNodeIds: learnerNodes(inputs, planned.startNodeId, planned.endNodeId)
  };
}
