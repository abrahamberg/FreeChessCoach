import { GENERIC_CTAS, VIDEO_INTRO_PHRASES, type CourseDocument, type CourseEpisode, type CourseReel } from '@freechesscoach/shared';
import { CONFIG } from './config.js';
import type { CourseDossier } from './course-dossier.js';
import type { CourseVerifyNode, CourseVerifyProblem } from './course-verify.js';
import { episodeScope } from './course-verify-scope.js';
import { moveProblems, numberProblems, phraseProblems, tacticWordProblems, type EpisodeText } from './course-verify-text.js';

const MAX_HOOK_WORDS = 10;
const MAX_BAND_WORDS = 5;
const MAX_BEAT_WORDS = 16;
const MAX_VIDEO_TITLE = 55;
const MAX_THUMBNAIL_WORDS = 4;
const MAX_VIDEO_HOOK_WORDS = 40;
/** Seconds a reel spends besides its words (§13.3): the climax slowed down
 * with its silence, and the CTA card. */
const REEL_FIXED_SECONDS = 4;
const REEL_MOVE_SECONDS = 0.5;
const PUZZLE_COUNTDOWN_SECONDS = 5;
const WORDS_PER_SECOND = 2.5;

export interface CourseReelVerifyInput {
  reel: CourseReel;
  startFen: string;
  nodes: readonly CourseVerifyNode[];
  dossier: CourseDossier | null;
  direction?: string;
  hasVideo: boolean;
}

/** docs/courses.md §13.9, the reel: its lines stay in its span and on the
 * analysis, the bands stay short, the CTA is specific, and it fits 45 s. */
export function verifyCourseReel(input: CourseReelVerifyInput): CourseVerifyProblem[] {
  const { reel } = input;
  const span: CourseEpisode = { id: 'reel', role: 'reel', focus: '', startNodeId: reel.startNodeId, endNodeId: reel.endNodeId, plies: [], drillNodeIds: [] };
  const scope = episodeScope(span, input.startFen, input.nodes, input.dossier);
  if (!scope) return [{ code: 'reel', nodeId: reel.endNodeId, message: `The reel runs from ${reel.startNodeId} to ${reel.endNodeId}, which is not one line` }];

  const problems: CourseVerifyProblem[] = [];
  const texts: EpisodeText[] = [
    { where: "the reel's hook", nodeId: null, text: reel.hook },
    { where: "the reel's top text", nodeId: null, text: reel.topText },
    ...reel.beats.flatMap((beat) => [
      { where: `the reel line on ${beat.nodeId}`, nodeId: beat.nodeId, text: beat.say },
      { where: `the reel caption on ${beat.nodeId}`, nodeId: beat.nodeId, text: beat.caption }
    ]),
    { where: "the reel's payoff", nodeId: null, text: reel.payoff },
    { where: "the reel's call to action", nodeId: null, text: reel.cta },
    { where: "the reel's last line", nodeId: null, text: reel.loop }
  ];
  for (const beat of reel.beats) {
    if (!scope.inside.has(beat.nodeId)) problems.push({ code: 'reel', nodeId: beat.nodeId, message: `The reel line on ${beat.nodeId} is outside the reel's moves` });
    if (words(beat.say) > MAX_BEAT_WORDS) problems.push({ code: 'reel', nodeId: beat.nodeId, message: `The reel line on ${beat.nodeId} has ${words(beat.say)} words (at most ${MAX_BEAT_WORDS})` });
  }
  if (!reel.hook.trim()) problems.push({ code: 'reel', nodeId: null, message: 'The reel has no hook: name the idea in the first words' });
  if (words(reel.hook) > MAX_HOOK_WORDS) problems.push({ code: 'reel', nodeId: null, message: `The reel's hook has ${words(reel.hook)} words (at most ${MAX_HOOK_WORDS})` });
  for (const [where, text] of [['top text', reel.topText], ['payoff', reel.payoff]] as const) {
    if (words(text) > MAX_BAND_WORDS) problems.push({ code: 'reel', nodeId: null, message: `The reel's ${where} has ${words(text)} words (at most ${MAX_BAND_WORDS})` });
  }
  problems.push(...introProblems(reel.hook, "the reel's hook"));
  const cta = normalised(reel.cta);
  if (!cta) problems.push({ code: 'reel', nodeId: null, message: 'The reel has no call to action' });
  for (const generic of GENERIC_CTAS) if (cta.includes(generic)) problems.push({ code: 'reel', nodeId: null, message: `"${generic}" is a generic call to action: say what the viewer gets` });
  if (reel.style === 'promo' && !input.hasVideo) problems.push({ code: 'reel', nodeId: null, message: 'A promo reel sends viewers to the YouTube video, and this course has none' });
  const seconds = reelSeconds(reel, scope.path.length);
  if (seconds > CONFIG.courses.reelSeconds.max) problems.push({ code: 'reel', nodeId: null, message: `The reel runs about ${Math.round(seconds)} s (at most ${CONFIG.courses.reelSeconds.max}): cut words` });

  return [
    ...problems,
    ...moveProblems(texts, scope, input.dossier !== null),
    ...(input.dossier ? tacticWordProblems(texts, scope) : []),
    ...numberProblems(texts, input.direction ?? ''),
    ...phraseProblems(texts)
  ];
}

/** The reel's rough length: its words, its moves at build-up pace, the
 * climax and the CTA card, and a puzzle's countdown. */
export function reelSeconds(reel: CourseReel, moves: number): number {
  const spoken = [reel.hook, ...reel.beats.map((beat) => beat.say), reel.cta, reel.loop].reduce((sum, text) => sum + words(text), 0);
  return spoken / WORDS_PER_SECOND + moves * REEL_MOVE_SECONDS + REEL_FIXED_SECONDS + (reel.style === 'puzzle' ? PUZZLE_COUNTDOWN_SECONDS : 0);
}

/**
 * §13.9, the whole course: the YouTube video's packaging, and the voice
 * across episodes (no line starting like two others in one episode, no line
 * said twice).
 */
export function verifyCourseFrame(document: CourseDocument): CourseVerifyProblem[] {
  const problems: CourseVerifyProblem[] = [];
  const video = document.video;
  if (video) {
    if (video.title.length > MAX_VIDEO_TITLE) problems.push({ code: 'video', nodeId: null, message: `The video title has ${video.title.length} characters (at most ${MAX_VIDEO_TITLE})` });
    if (words(video.thumbnailText) > MAX_THUMBNAIL_WORDS) problems.push({ code: 'video', nodeId: null, message: `The thumbnail text has ${words(video.thumbnailText)} words (at most ${MAX_THUMBNAIL_WORDS})` });
    if (words(video.hook) > MAX_VIDEO_HOOK_WORDS) problems.push({ code: 'video', nodeId: null, message: `The video's hook has ${words(video.hook)} words (at most ${MAX_VIDEO_HOOK_WORDS}): the first 15 seconds` });
    problems.push(...introProblems(video.hook, "the video's hook"));
    if (video.outro.trim() && !video.outro.includes('?')) problems.push({ code: 'video', nodeId: null, message: "The video's outro asks the viewer nothing: end on a question for the comments" });
  }
  const seen = new Map<string, string>();
  for (const episode of document.episodes) {
    const lines = episode.plies.flatMap((ply) => [ply.course ? ply.text : '', ply.video && ply.say ? ply.say : '']).filter((line) => line.trim());
    const openers = new Map<string, number>();
    for (const line of lines) {
      const first = normalised(line).split(/\s+/)[0] ?? '';
      if (first.length > 3) openers.set(first, (openers.get(first) ?? 0) + 1);
      const key = normalised(line);
      const earlier = seen.get(key);
      if (earlier && earlier !== episode.id) problems.push({ code: 'voice', nodeId: null, message: `"${line.trim()}" is said in ${earlier} and again in ${episode.id}` });
      seen.set(key, earlier ?? episode.id);
    }
    for (const [word, count] of openers) {
      if (count > 2) problems.push({ code: 'voice', nodeId: null, message: `${count} lines in ${episode.id} start with "${word}": vary how the coach starts` });
    }
  }
  return problems;
}

function introProblems(text: string, where: string): CourseVerifyProblem[] {
  const lower = normalised(text);
  return VIDEO_INTRO_PHRASES.filter((phrase) => lower.includes(phrase)).map((phrase) => ({ code: 'reel' as const, nodeId: null, message: `"${phrase}" in ${where}: start on the idea, not an intro` }));
}

function normalised(text: string): string {
  return text.toLowerCase().replace(/’/g, "'").replace(/[.!?,;:]+$/g, '').trim();
}

function words(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
