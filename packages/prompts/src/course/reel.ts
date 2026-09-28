import { courseNodePath, renderCourseDossier } from '@freechesscoach/chess-analysis';
import type { CourseReel } from '@freechesscoach/shared';
import { buildCourseSystemPrompt, nodeLabel, type CourseMessages, type CoursePromptContext } from './context.js';
import { episodeDossier } from './episode.js';

export const REEL_SCRIPT_JSON_SCHEMA = `{
  "hook": string (spoken in the first 2 seconds, at most 10 words, names the idea),
  "topText": string (the top band for the whole reel, at most 5 words),
  "beats": [{ "nodeId": string, "say": string (at most 16 words), "caption": string (the bottom band, at most 6 words) }] (in move order, at most 4),
  "payoff": string (shown at the climax, at most 5 words),
  "cta": string (what the viewer gets for following),
  "loop": string (the last line, runs straight back into the hook)
}`;

const STYLE_TEXT: Record<CourseReel['style'], string> = {
  highlight: 'highlight: the build-up plays fast, the climax slowed down; the moves that speak carry the idea.',
  puzzle: 'puzzle: the viewer sees the position and the question, the app counts down 5 seconds over a rising hum, then plays the solution. Speak after the climax: why it works.',
  promo: 'promo: a cliffhanger. The reel stops on the moment before the climax; the call to action sends viewers to the full YouTube video to see what happens.'
};

export interface CourseReelRequest {
  context: CoursePromptContext;
  title: string;
  promise: string;
  reel: CourseReel;
  /** The YouTube video's title, for a promo's call to action. */
  videoTitle: string | null;
  retry?: { previousOutput: string; problems: string[] } | null;
}

/** docs/courses.md §13.3: the reel's one call, after the episodes. The
 * system prompt is the course's, so it is cached with theirs. */
export function buildCourseReelMessages(request: CourseReelRequest): CourseMessages {
  const { context, reel } = request;
  const path = courseNodePath(context.nodes, reel.startNodeId, reel.endNodeId) ?? [];
  const moves = path.map((nodeId) => `${nodeLabel(context, nodeId)}${nodeId === reel.climaxNodeId ? '   <- THE CLIMAX' : ''}`).join('\n');
  const sections = [
    `COURSE\nTitle: ${request.title}\nPromise: ${request.promise}${request.videoTitle ? `\nThe YouTube video: "${request.videoTitle}"` : ''}`,
    `THE REEL (9:16, 30 to 45 seconds, one idea)
Style: ${STYLE_TEXT[reel.style]}
Its moves, from the position before the first:
${moves}
- The first words name the idea and its keywords (the opening, the tactic, the piece):
  platforms listen to them. No greeting, no "today".
- The top band holds the challenge the whole time ("White to play", "Mate in 3?").
- Lines only on the moves that carry the idea; the rest play without a word.
- The app plays the build-up fast, cuts the sound for half a second before the climax,
  then plays it slowly: the words at the climax can wait for it.
- The call to action says what the viewer gets ("Follow for a daily mate-in-3"),
  never "subscribe for more" or "like and subscribe".
- The last line flows back into the first, so the reel loops.
Every beat nodeId is one of: ${path.join(', ')}.`,
    `DOSSIER (the reel's moves only)\n${renderCourseDossier(episodeDossier(context, { startNodeId: reel.startNodeId, endNodeId: reel.endNodeId, answerNodeId: null }))}`,
    request.retry
      ? `YOUR PREVIOUS ANSWER HAD THESE PROBLEMS — fix every one\n${request.retry.problems.map((problem) => `- ${problem}`).join('\n')}\n\nYour previous answer:\n${request.retry.previousOutput}`
      : '',
    `OUTPUT SCHEMA\n${REEL_SCRIPT_JSON_SCHEMA}`
  ];
  return { system: buildCourseSystemPrompt(context), user: sections.filter(Boolean).join('\n\n') };
}
