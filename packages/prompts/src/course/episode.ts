import { courseNodePath, renderCourseDossier, type CourseDossier } from '@freechesscoach/chess-analysis';
import type { CourseOutline, CourseOutlineEpisode } from '@freechesscoach/shared';
import { courseBudget, episodeWordBudget } from './budget.js';
import { buildCourseSystemPrompt, type CourseMessages, type CoursePromptContext } from './context.js';

export const EPISODE_SCRIPT_JSON_SCHEMA = `{
  "episodeId": string,
  "beats": [{ "nodeId": string | null, "say": string, "caption": string,
    "arrows": [{ "from": square, "to": square, "kind": "best" | "threat" | "idea" }],
    "pauseMs": number | null }],
  "notes": [{ "nodeId": string, "text": string, "arrows": [same as beats] }],
  "quiz": { "answerNodeId": string, "prompt": string, "hint": string, "reveal": string } | null
}`;

export interface CourseEpisodeRequest {
  context: CoursePromptContext;
  outline: CourseOutline;
  episodeId: string;
  /** From the editor's "regenerate": "punchier", "mention the pin earlier". */
  creatorRequest?: string | null;
  /** The verifier's problems with the previous answer (§7: sent back once). */
  retry?: { previousOutput: string; problems: string[] } | null;
}

/** docs/courses.md §6.5: one call per episode. The system prompt is the
 * course's, so it is cached across the episode calls. */
export function buildCourseEpisodeMessages(request: CourseEpisodeRequest): CourseMessages {
  const { context, outline, episodeId } = request;
  const episode = outline.chapters.flatMap((chapter) => chapter.episodes).find((candidate) => candidate.id === episodeId);
  if (!episode) throw new Error(`Episode ${episodeId} is not in the outline`);

  const budget = courseBudget(context.kind, context.persona);
  const words = episodeWordBudget(budget, outline, episodeId);
  const quizLine = episode.answerNodeId
    ? `\nQuiz: the answer is ${episode.answerNodeId}; the quiz beat pauses the clip (pauseMs ${budget.pauseSeconds * 1000}).`
    : '';
  const sections = [
    `COURSE\nTitle: ${outline.title}\nPromise: ${outline.promise}`,
    `OUTLINE\n${renderOutline(outline, episodeId)}`,
    `THIS EPISODE\n${episode.id} ${episode.role}, ${episode.startNodeId} to ${episode.endNodeId}\nFocus: ${episode.focus}\nNarrated nodes: ${episode.narratedNodeIds.join(', ') || 'none'}${quizLine}\nBudget: at most ${words.wordsPerEpisode} spoken words in this episode, at most ${words.wordsPerBeat} words per beat, captions at most 6 words.`,
    `DOSSIER (this episode only)\n${renderCourseDossier(episodeDossier(context, episode))}`,
    request.creatorRequest ? `CREATOR'S REQUEST FOR THIS EPISODE\n"${request.creatorRequest}"` : '',
    request.retry
      ? `YOUR PREVIOUS ANSWER HAD THESE PROBLEMS — fix every one\n${request.retry.problems.map((problem) => `- ${problem}`).join('\n')}\n\nYour previous answer:\n${request.retry.previousOutput}`
      : '',
    `OUTPUT SCHEMA\n${EPISODE_SCRIPT_JSON_SCHEMA}`
  ];
  return { system: buildCourseSystemPrompt(context), user: sections.filter(Boolean).join('\n\n') };
}

/** Only this episode's nodes, the one before it and its quiz answer, with
 * the lines they are on. */
export function episodeDossier(context: CoursePromptContext, episode: Pick<CourseOutlineEpisode, 'startNodeId' | 'endNodeId' | 'answerNodeId'>): CourseDossier {
  const path = courseNodePath(context.nodes, episode.startNodeId, episode.endNodeId) ?? [];
  const before = context.nodes.find((node) => node.id === episode.startNodeId)?.parentId;
  const ids = new Set([...(before ? [before] : []), ...path, ...(episode.answerNodeId ? [episode.answerNodeId] : [])]);
  const nodes = context.dossier.nodes.filter((node) => ids.has(node.nodeId));
  const lineIds = new Set(nodes.map((node) => node.lineId));
  return { ...context.dossier, nodes, lines: context.dossier.lines.filter((line) => lineIds.has(line.lineId)) };
}

function renderOutline(outline: CourseOutline, current: string): string {
  return outline.chapters
    .flatMap((chapter, index) => [
      `Chapter ${index + 1} "${chapter.title}" (${chapter.lineId})`,
      ...chapter.episodes.map(
        (episode) =>
          `  ${episode.id} ${episode.role}, ${episode.startNodeId}–${episode.endNodeId}: ${episode.focus}${episode.id === current ? '   <- THIS EPISODE' : ''}`
      )
    ])
    .join('\n');
}
