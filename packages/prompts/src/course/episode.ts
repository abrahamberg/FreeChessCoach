import { courseNodePath, renderCourseDossier, type CourseDossier } from '@freechesscoach/chess-analysis';
import type { CourseOutline, CourseOutlineEpisode } from '@freechesscoach/shared';
import { courseBudget, episodeWordBudget } from './budget.js';
import { buildCourseSystemPrompt, nodeLabel, type CourseMessages, type CoursePromptContext } from './context.js';

export const EPISODE_SCRIPT_JSON_SCHEMA = `{
  "episodeId": string,
  "opener": { "say": string, "caption": string } | null (the clip's opening card, a hook's only),
  "plies": [{ "nodeId": string, "text": string, "clipText": string | null, "caption": string | null,
    "arrows": [{ "from": square, "to": square, "kind": "best" | "threat" | "idea" }],
    "long": boolean (speaks in the course), "short": boolean (speaks in the clip) }] (in move order,
    only the moves that speak or carry arrows),
  "quiz": { "answerNodeId": string, "prompt": string, "hint": string (points at the target, never names the move),
    "reveal": string (names the move and says in one sentence why it works) } | null
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
    ? `\nQuiz: the answer is ${episode.answerNodeId}. The app shows the position before it, says quiz.prompt and pauses ${budget.pauseSeconds}s; the clip's moves start at the answer and reveal it.`
    : '\nQuiz: none in this episode, so "quiz" is null.';
  const sections = [
    `COURSE\nTitle: ${outline.title}\nPromise: ${outline.promise}`,
    `OUTLINE\n${renderOutline(outline, episodeId)}`,
    `THIS EPISODE\n${episode.id} ${episode.role}, ${episode.startNodeId} to ${episode.endNodeId}\nFocus: ${episode.focus}\nThe plan's key moves: ${episode.narratedNodeIds.join(', ') || 'none'}${quizLine}\n${ownNodesLine(context, episode)}\nSpeaking budget: at most ${episode.budgetLong} moves with "long": true, at most ${episode.budgetShort} with "short": true.\nClip words: at most ${words.wordsPerEpisode} spoken in this episode's clip (the opener included), at most ${words.wordsPerBeat} per move; captions at most 6 words.\nSay every line as the coach in VOICE would.`,
    `DOSSIER (this episode only)\n${renderCourseDossier(episodeDossier(context, episode))}`,
    request.creatorRequest ? `CREATOR'S REQUEST FOR THIS EPISODE\n"${request.creatorRequest}"` : '',
    request.retry
      ? `YOUR PREVIOUS ANSWER HAD THESE PROBLEMS — fix every one\n${request.retry.problems.map((problem) => `- ${problem}`).join('\n')}\n\nYour previous answer:\n${request.retry.previousOutput}`
      : '',
    `OUTPUT SCHEMA\n${EPISODE_SCRIPT_JSON_SCHEMA}`
  ];
  return { system: buildCourseSystemPrompt(context), user: sections.filter(Boolean).join('\n\n') };
}

/** Where the moves may be. The dossier also shows the move before the
 * episode, and gpt-6-luna put notes there until this said it was context only. */
function ownNodesLine(context: CoursePromptContext, episode: CourseOutlineEpisode): string {
  const path = courseNodePath(context.nodes, episode.startNodeId, episode.endNodeId) ?? [];
  const before = context.nodes.find((node) => node.id === episode.startNodeId)?.parentId;
  const own = `Every plies nodeId is one of: ${path.map((nodeId) => nodeLabel(context, nodeId)).join(', ')}.`;
  return before ? `${own} ${before} in the dossier is the move before, for context only: no line on it.` : own;
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
