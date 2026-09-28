import type { CourseArrow, CourseDocument, CourseEpisode, CourseKind, CourseNode } from '@freechesscoach/shared';
import { boardSoundsLengthMs } from '../../../sounds/board-sounds.js';
import type { MoveSounds } from '../../../sounds/move-sounds.js';
import { courseMoveSounds, type CourseEvals } from '../player/course-move-list.js';
import { moveLabel } from '../courseEdits.js';

/** docs/courses.md §8: 9:16 for reels and Shorts, 16:9 for YouTube. */
export type ClipFormat = 'vertical' | 'landscape';

export const CLIP_SIZES: Record<ClipFormat, { width: number; height: number }> = {
  vertical: { width: 1080, height: 1920 },
  landscape: { width: 1920, height: 1080 }
};

/** §3's clip column: the format each kind is made for first. */
export function defaultClipFormat(kind: CourseKind): ClipFormat {
  return kind === 'opening_reel' || kind === 'trap' || kind === 'tactics' ? 'vertical' : 'landscape';
}

/** How long the pieces of a clip last, in ms. */
export const CLIP_TIMING = {
  /** An unnarrated move between beats ("the setup moves play fast"). */
  moveMs: 700,
  /** After each beat's audio. */
  gapMs: 350,
  /** A beat with no words (a caption only). */
  silentBeatMs: 1500,
  /** The end card with the course link. */
  endCardMs: 3000,
  /** The quiz countdown after its prompt (CONFIG.courses.quizPauseSeconds). */
  quizPauseMs: 3000
};

export interface ClipSegment {
  start: number;
  end: number;
  /** `title`: a beat with no node (the hook card); `move`: an unnarrated move
   * played fast; `quiz`: the position before the answer, the prompt and a
   * countdown; `beat`: a narrated moment; `end`: the end card. */
  kind: 'title' | 'move' | 'quiz' | 'beat' | 'end';
  fen: string;
  /** The move just played, highlighted on the board. */
  lastMove: { from: string; to: string } | null;
  /** "6.Bc3", shown with the move; null on title and end cards. */
  moveLabel: string | null;
  arrows: CourseArrow[];
  caption: string;
  /** prepare-audio.ts's key for the beat's audio; null when silent. */
  audioKey: string | null;
  /** A quiz beat's pause, at the end of the segment (a countdown). */
  pauseMs: number;
  /** The move's board sounds, at the segment's start; null when it shows no
   * new move or the clip has sounds off (docs/plan.md Phase 88). */
  sound: MoveSounds | null;
  /** The segment's audio starts this long after the segment: after the
   * move's sounds, so they never talk over each other. */
  audioOffsetMs: number;
}

export interface ClipTimeline {
  format: ClipFormat;
  segments: ClipSegment[];
  durationMs: number;
}

/** The episodes a clip covers, in chapter order. The 9:16 tactics clip is
 * the first example only (with the concept before it, §3). */
export function clipEpisodes(document: CourseDocument, format: ClipFormat): CourseEpisode[] {
  const byId = new Map(document.episodes.map((episode) => [episode.id, episode]));
  const ordered = document.chapters.flatMap((chapter) => chapter.episodeIds.flatMap((id) => byId.get(id) ?? []));
  const episodes = ordered.length ? ordered : document.episodes;
  if (document.kind !== 'tactics' || format !== 'vertical') return episodes;
  const firstExample = episodes.findIndex((episode) => episode.role === 'example');
  return firstExample < 0 ? episodes : episodes.slice(0, firstExample + 1);
}

/** The clip as timed segments: beats last their audio (already at the
 * persona's playback rate) plus a gap plus any quiz pause; the moves
 * between two beats on the same line play fast; a beat off the line shown
 * (the trap's safety move) cuts straight to it. Pure, so the preview and
 * the recording are the same clip. */
export function buildClipTimeline(options: {
  document: CourseDocument;
  format: ClipFormat;
  /** Audio length per prepare-audio key, in ms at playback speed. */
  audioMs: (key: string) => number | undefined;
  timing?: typeof CLIP_TIMING;
  /** Board sounds under the moves: the course's evaluations (bad and great
   * for either side) and how long a move's sounds last. Absent: none. */
  sounds?: { evals: CourseEvals; lengthMs?: (sounds: MoveSounds) => number } | null;
}): ClipTimeline {
  const { document, format, audioMs, timing = CLIP_TIMING, sounds = null } = options;
  const soundOf = (node: CourseNode): MoveSounds | null => (sounds ? courseMoveSounds(document, sounds.evals, node) : null);
  const soundLength = sounds?.lengthMs ?? boardSoundsLengthMs;
  const byId = new Map(document.nodes.map((node) => [node.id, node]));
  const segments: ClipSegment[] = [];
  let clock = 0;
  let shown: CourseNode | null = null;

  const push = (segment: Omit<ClipSegment, 'start' | 'end' | 'sound' | 'audioOffsetMs'> & Partial<Pick<ClipSegment, 'sound' | 'audioOffsetMs'>>, length: number): void => {
    segments.push({ sound: null, audioOffsetMs: 0, ...segment, start: clock, end: clock + length });
    clock += length;
  };
  const board = (node: CourseNode | null) => ({
    fen: node?.fenAfter ?? document.startFen,
    lastMove: node ? { from: node.uci.slice(0, 2), to: node.uci.slice(2, 4) } : null,
    moveLabel: node ? moveLabel(document, node) : null
  });

  const quizMoment = (episode: CourseEpisode): void => {
    const answer = episode.quiz ? byId.get(episode.quiz.answerNodeId) : undefined;
    const before = answer?.parentId ? byId.get(answer.parentId) : undefined;
    if (!episode.quiz || !answer) return;
    if (before) {
      for (const between of movesBetween(byId, shown, before)) push({ kind: 'move', ...board(between), arrows: [], caption: '', audioKey: null, pauseMs: 0, sound: soundOf(between) }, timing.moveMs);
      shown = before;
    }
    const key = `quiz:${episode.id}`;
    const spoken = episode.quiz.prompt.trim() ? audioMs(key) : undefined;
    const length = (spoken === undefined ? 0 : spoken + timing.gapMs) + timing.quizPauseMs;
    push({ kind: 'quiz', ...board(before ?? null), arrows: [], caption: episode.quiz.prompt, audioKey: spoken === undefined ? null : key, pauseMs: timing.quizPauseMs }, length);
  };

  for (const episode of clipEpisodes(document, format)) {
    // Code owns the quiz moment: before the answer is shown, never twice.
    const answerAt = episode.quiz ? episode.beats.findIndex((beat) => beat.nodeId === episode.quiz?.answerNodeId) : -1;
    if (episode.quiz && answerAt <= 0) quizMoment(episode);
    episode.beats.forEach((beat, index) => {
      if (episode.quiz && index === answerAt && index > 0) quizMoment(episode);
      const key = `beat:${episode.id}:${index}`;
      const spoken = beat.say.trim() ? audioMs(key) : undefined;
      const pauseMs = episode.quiz ? 0 : (beat.pauseMs ?? 0);
      const length = (spoken === undefined ? timing.silentBeatMs : spoken + timing.gapMs) + pauseMs;
      const common = { arrows: beat.arrows, caption: beat.caption, audioKey: spoken === undefined ? null : key, pauseMs };
      const node = beat.nodeId ? byId.get(beat.nodeId) : undefined;
      if (!node) {
        push({ kind: 'title', ...board(shown), lastMove: null, moveLabel: null, ...common }, length);
        return;
      }
      for (const between of movesBetween(byId, shown, node)) push({ kind: 'move', ...board(between), arrows: [], caption: '', audioKey: null, pauseMs: 0, sound: soundOf(between) }, timing.moveMs);
      // A move shown for the first time sounds; its narration waits for it.
      const sound = shown?.id === node.id ? null : soundOf(node);
      const lead = sound && common.audioKey ? soundLength(sound) : 0;
      shown = node;
      push({ kind: 'beat', ...board(node), ...common, sound, audioOffsetMs: lead }, length + lead);
    });
  }
  push({ kind: 'end', ...board(shown), lastMove: null, moveLabel: null, arrows: [], caption: '', audioKey: null, pauseMs: 0 }, timing.endCardMs);
  return { format, segments, durationMs: clock };
}

/** The moves after `from` up to, not including, `to`, when `to` is further
 * down the same line; none when it is not (a cut). */
function movesBetween(byId: Map<string, CourseNode>, from: CourseNode | null, to: CourseNode): CourseNode[] {
  const path: CourseNode[] = [];
  for (let node = to.parentId ? byId.get(to.parentId) : undefined; node; node = node.parentId ? byId.get(node.parentId) : undefined) {
    if (node.id === from?.id) return path;
    path.unshift(node);
  }
  return from ? [] : path;
}

/** The segment playing at `ms` (the last one past the end). */
export function segmentAt(timeline: ClipTimeline, ms: number): ClipSegment | undefined {
  return timeline.segments.find((segment) => ms < segment.end) ?? timeline.segments[timeline.segments.length - 1];
}
