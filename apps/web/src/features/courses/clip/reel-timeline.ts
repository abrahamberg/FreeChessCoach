import type { CourseNode } from '@freechesscoach/shared';
import { courseMoveSound } from '../player/course-move-list.js';
import { clipSoundLengthMs, type ClipSound } from './clip-sounds.js';
import { boardAt, SegmentWriter, type ClipTimeline, type TimelineOptions } from './timeline.js';

/** docs/courses.md §13.3, the reel's pace, in ms. */
export const REEL_TIMING = {
  /** The build-up: fast, so the board is never still for long. */
  moveMs: 500,
  gapMs: 250,
  /** A line or the hook with no audio yet. */
  silentBeatMs: 1200,
  /** The held breath before the climax: no voice, no board sound. */
  silenceMs: 500,
  /** The climax, slowed down, before its line. */
  climaxMs: 1400,
  /** A puzzle's countdown, over the riser. */
  countdownMs: 5000,
  /** The reel's length (CONFIG.courses.reelSeconds). */
  minMs: 30_000
};

/**
 * §13.3, the reel as timed segments: the spoken hook over the first
 * position (the top band on from frame one), a puzzle's countdown, the
 * build-up at 500 ms a move, half a second of silence, the climax slowed
 * with the payoff in the bottom band, the moves after it, the call to
 * action and the loop line. A promo stops before the climax. Code stretches
 * the climax, never the build-up, to reach 30 s.
 */
export function buildReelTimeline(options: TimelineOptions & { timing?: typeof REEL_TIMING }): ClipTimeline {
  const first = reelPass(options, 0);
  const timing = options.timing ?? REEL_TIMING;
  const short = timing.minMs - first.durationMs;
  return short > 0 && options.document.reel?.style !== 'promo' ? reelPass(options, short) : first;
}

function reelPass(options: TimelineOptions & { timing?: typeof REEL_TIMING }, climaxHoldMs: number): ClipTimeline {
  const { document, audioMs, timing = REEL_TIMING, sounds = null } = options;
  const reel = document.reel;
  const out = new SegmentWriter();
  if (!reel) return { product: 'reel', format: 'vertical', segments: [], durationMs: 0 };
  const byId = new Map(document.nodes.map((node) => [node.id, node]));
  const soundOf = (node: CourseNode): ClipSound | null => (sounds ? courseMoveSound(document, sounds.evals, node) : null);
  const soundLength = sounds?.lengthMs ?? clipSoundLengthMs;
  const spoken = (key: string, text: string): { key: string | null; length: number } => {
    const ms = text.trim() ? audioMs(key) : undefined;
    return ms === undefined ? { key: null, length: text.trim() ? timing.silentBeatMs : 0 } : { key, length: ms + timing.gapMs };
  };
  const path = spanOf(byId, reel.startNodeId, reel.endNodeId);
  const startBoard = path[0]?.parentId ? (byId.get(path[0].parentId) ?? null) : null;
  let shown: CourseNode | null = startBoard;
  const board = (node: CourseNode | null) => boardAt(document, node);

  const hook = spoken('reel:hook', reel.hook);
  out.push({ kind: 'beat', ...board(shown), lastMove: null, moveLabel: null, arrows: [], caption: '', audioKey: hook.key, pauseMs: 0 }, Math.max(hook.length, timing.silentBeatMs));
  if (reel.style === 'puzzle') {
    out.push({ kind: 'quiz', ...board(shown), lastMove: null, moveLabel: null, arrows: [], caption: '', audioKey: null, pauseMs: timing.countdownMs, sound: sounds ? 'riser' : null }, timing.countdownMs);
  }

  const beatOf = (nodeId: string) => reel.beats.find((beat) => beat.nodeId === nodeId);
  const playMove = (node: CourseNode, extra: { caption?: string; holdMs?: number } = {}): void => {
    const beat = beatOf(node.id);
    const sound = soundOf(node);
    const line = beat ? spoken(`reel:beat:${node.id}`, beat.say) : { key: null, length: 0 };
    const lead = sound && line.key ? soundLength(sound) : 0;
    const length = Math.max(timing.moveMs, line.length + lead) + (extra.holdMs ?? 0);
    out.push({ kind: beat ? 'beat' : 'move', ...board(node), arrows: [], caption: extra.caption ?? beat?.caption ?? '', audioKey: line.key, pauseMs: 0, sound, audioOffsetMs: lead }, length);
    shown = node;
  };

  const climaxAt = path.findIndex((node) => node.id === reel.climaxNodeId);
  path.slice(0, Math.max(climaxAt, 0)).forEach((node) => playMove(node));
  const climax = path[climaxAt];
  if (climax && reel.style !== 'promo') {
    out.push({ kind: 'silence', ...board(shown), arrows: [], caption: '', audioKey: null, pauseMs: 0 }, timing.silenceMs);
    playMove(climax, { caption: reel.payoff || beatOf(climax.id)?.caption, holdMs: timing.climaxMs + climaxHoldMs });
    path.slice(climaxAt + 1).forEach((node) => playMove(node));
  } else if (climax) {
    // A promo stops on the question: what happens next is in the video.
    out.push({ kind: 'silence', ...board(shown), arrows: [], caption: '', audioKey: null, pauseMs: 0 }, timing.silenceMs);
  }
  const cta = spoken('reel:cta', reel.cta);
  out.push({ kind: 'cta', ...board(shown), lastMove: null, moveLabel: null, arrows: [], caption: reel.cta, audioKey: cta.key, pauseMs: 0 }, Math.max(cta.length, timing.silentBeatMs));
  const loop = spoken('reel:loop', reel.loop);
  if (loop.length) out.push({ kind: 'beat', ...board(shown), lastMove: null, moveLabel: null, arrows: [], caption: '', audioKey: loop.key, pauseMs: 0 }, loop.length);
  return { product: 'reel', format: 'vertical', segments: out.segments, durationMs: out.clock, topText: reel.topText };
}

/** The moves from `startId` to `endId` on one line, start first. */
function spanOf(byId: ReadonlyMap<string, CourseNode>, startId: string, endId: string): CourseNode[] {
  const path: CourseNode[] = [];
  for (let node = byId.get(endId); node; node = node.parentId ? byId.get(node.parentId) : undefined) {
    path.unshift(node);
    if (node.id === startId) return path;
  }
  return [];
}
