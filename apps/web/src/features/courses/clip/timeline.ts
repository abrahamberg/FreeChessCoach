import { Chess } from 'chess.js';
import { videoCaption, videoLine, type CourseArrow, type CourseDocument, type CourseEpisode, type CourseNode, type CoursePly } from '@freechesscoach/shared';
import { moveSound } from '../../../sounds/move-sounds.js';
import { courseMoveSound, type CourseEvals } from '../player/course-move-list.js';
import { moveLabel as sanLabel } from '@freechesscoach/chess-analysis';
import { moveLabel } from '../courseEdits.js';
import { clipSoundLengthMs, type ClipSound } from './clip-sounds.js';
import { speechMarks, type ClipMark } from './speech-marks.js';

/** docs/courses.md §13.1: the YouTube video is 16:9, the reel 9:16. */
export type ClipFormat = 'vertical' | 'landscape';
export type ClipProduct = 'video' | 'reel';

export const CLIP_SIZES: Record<ClipFormat, { width: number; height: number }> = {
  vertical: { width: 1080, height: 1920 },
  landscape: { width: 1920, height: 1080 }
};

export const PRODUCT_FORMAT: Record<ClipProduct, ClipFormat> = { video: 'landscape', reel: 'vertical' };

/** How long the pieces of the YouTube video last, in ms. */
export const CLIP_TIMING = {
  /** An unnarrated move between lines. */
  moveMs: 700,
  /** After each line's audio. */
  gapMs: 350,
  /** A line with no words (a caption only). */
  silentBeatMs: 1500,
  /** The end card with the course link. */
  endCardMs: 3000,
  /** The quiz countdown after its prompt (CONFIG.courses.quizPauseSeconds). */
  quizPauseMs: 3000,
  /** A chapter's card (§13.4). */
  chapterMs: 2000,
  /** The board back where it was after a tempting move is played out. */
  backMs: 500
};

export interface ClipSegment {
  start: number;
  end: number;
  /** `title`: the hook, no move; `chapter`: a chapter card; `move`: a move
   * played without a word; `quiz`: the position before the answer, the
   * prompt and a countdown; `beat`: a narrated moment; `tempting`: a move
   * that looks right, shown and explained before it is played out;
   * `silence`: the held breath before a reel's climax; `outro`, `cta`: the
   * closing cards; `end`: the end card. */
  kind: 'title' | 'chapter' | 'move' | 'quiz' | 'beat' | 'tempting' | 'silence' | 'outro' | 'cta' | 'end';
  fen: string;
  /** The move just played, highlighted on the board. */
  lastMove: { from: string; to: string } | null;
  /** "6.Bc3", shown with the move; null on cards. */
  moveLabel: string | null;
  arrows: CourseArrow[];
  caption: string;
  /** prepare-audio.ts's key for the segment's audio; null when silent. */
  audioKey: string | null;
  /** A countdown's length, at the end of the segment. */
  pauseMs: number;
  /** The sound at the segment's start: the move's, or a cut's; null when
   * none (sounds off, no new move). */
  sound: ClipSound | null;
  /** The segment's audio starts this long after the segment: after the
   * move's sound, so they never talk over each other. */
  audioOffsetMs: number;
  /** The squares and moves the line names, timed from its audio's start
   * (speech-marks.ts); absent when it names none. */
  marks?: ClipMark[];
}

export interface ClipTimeline {
  product: ClipProduct;
  format: ClipFormat;
  segments: ClipSegment[];
  durationMs: number;
  /** The reel's top band, on screen the whole reel (§13.3). */
  topText?: string;
}

export interface TimelineOptions {
  document: CourseDocument;
  /** Audio length per prepare-audio key, in ms at playback speed. */
  audioMs: (key: string) => number | undefined;
  /** Board sounds under the moves: the course's evaluations (bad and great
   * for either side) and how long a sound lasts. Absent: none. */
  sounds?: { evals: CourseEvals; lengthMs?: (sound: ClipSound) => number } | null;
}

type NewSegment = Omit<ClipSegment, 'start' | 'end' | 'sound' | 'audioOffsetMs'> & Partial<Pick<ClipSegment, 'sound' | 'audioOffsetMs'>>;

/** Appends segments back to back. */
export class SegmentWriter {
  readonly segments: ClipSegment[] = [];
  clock = 0;

  push(segment: NewSegment, length: number): void {
    this.segments.push({ sound: null, audioOffsetMs: 0, ...segment, start: this.clock, end: this.clock + length });
    this.clock += length;
  }
}

/** A segment's marks for its spoken `text` over `fen`: none when silent. */
export function marksFor(text: string, fen: string, audioMs: number | undefined): Pick<ClipSegment, 'marks'> {
  const marks = audioMs === undefined ? [] : speechMarks(text, fen, audioMs);
  return marks.length ? { marks } : {};
}

/** The board after `node`, or the start. */
export function boardAt(document: CourseDocument, node: CourseNode | null): Pick<ClipSegment, 'fen' | 'lastMove' | 'moveLabel'> {
  return {
    fen: node?.fenAfter ?? document.startFen,
    lastMove: node ? { from: node.uci.slice(0, 2), to: node.uci.slice(2, 4) } : null,
    moveLabel: node ? moveLabel(document, node) : null
  };
}

/** The moves after `from` up to, not including, `to`, when `to` is further
 * down the same line; none when it is not (a cut). */
export function movesBetween(byId: ReadonlyMap<string, CourseNode>, from: CourseNode | null, to: CourseNode): CourseNode[] {
  const path: CourseNode[] = [];
  for (let node = to.parentId ? byId.get(to.parentId) : undefined; node; node = node.parentId ? byId.get(node.parentId) : undefined) {
    if (node.id === from?.id) return path;
    path.unshift(node);
  }
  return from ? [] : path;
}

/** The episodes in chapter order, with their chapter. */
function chapteredEpisodes(document: CourseDocument): { chapter: string | null; episode: CourseEpisode }[] {
  const byId = new Map(document.episodes.map((episode) => [episode.id, episode]));
  const ordered = document.chapters.flatMap((chapter) => chapter.episodeIds.flatMap((id, index) => {
    const episode = byId.get(id);
    return episode ? [{ chapter: index === 0 ? chapter.title : null, episode }] : [];
  }));
  return ordered.length ? ordered : document.episodes.map((episode) => ({ chapter: null, episode }));
}

/**
 * docs/courses.md §13.4, the YouTube video as timed segments: the hook over
 * the climax, a card per chapter, and each speaking move with its tempting
 * moves first: each shown with an arrow while the coach says why it fails,
 * then played out with the engine's answer, then the board goes back. Lines
 * last their audio plus a gap; the moves between play fast; a line off the
 * line shown (the trap's safety move) cuts straight to it. Pure, so the
 * preview and the recording are the same video.
 */
export function buildVideoTimeline(options: TimelineOptions & { timing?: typeof CLIP_TIMING }): ClipTimeline {
  const { document, audioMs, timing = CLIP_TIMING, sounds = null } = options;
  const soundOf = (node: CourseNode): ClipSound | null => (sounds ? courseMoveSound(document, sounds.evals, node) : null);
  const soundLength = sounds?.lengthMs ?? clipSoundLengthMs;
  const byId = new Map(document.nodes.map((node) => [node.id, node]));
  const out = new SegmentWriter();
  let shown: CourseNode | null = null;
  const board = (node: CourseNode | null) => boardAt(document, node);
  const spokenLength = (key: string, has: boolean): { key: string | null; length: number } => {
    const spoken = has ? audioMs(key) : undefined;
    return spoken === undefined ? { key: null, length: timing.silentBeatMs } : { key, length: spoken + timing.gapMs };
  };
  const playTo = (node: CourseNode): void => {
    for (const between of movesBetween(byId, shown, node)) out.push({ kind: 'move', ...board(between), arrows: [], caption: '', audioKey: null, pauseMs: 0, sound: soundOf(between) }, timing.moveMs);
  };

  // §13.4: the hook over the climax, then the cut back to the start.
  const hook = document.video?.hook.trim();
  let cut = false;
  if (hook) {
    const climax = byId.get(document.reel?.climaxNodeId ?? document.lines[0]?.leafNodeId ?? '') ?? null;
    const spoken = spokenLength('video:hook', true);
    const shownBoard = board(climax);
    const marks = marksFor(hook, shownBoard.fen, audioMs('video:hook'));
    out.push({ kind: 'title', ...shownBoard, moveLabel: null, arrows: [], caption: document.video?.thumbnailText ?? '', audioKey: spoken.key, pauseMs: 0, ...marks }, spoken.length);
    cut = true;
  }

  const quizMoment = (episode: CourseEpisode): void => {
    const answer = episode.quiz ? byId.get(episode.quiz.answerNodeId) : undefined;
    const before = answer?.parentId ? byId.get(answer.parentId) : undefined;
    if (!episode.quiz || !answer) return;
    if (before) {
      playTo(before);
      shown = before;
    }
    const key = `quiz:${episode.id}`;
    const spoken = episode.quiz.prompt.trim() ? audioMs(key) : undefined;
    const length = (spoken === undefined ? 0 : spoken + timing.gapMs) + timing.quizPauseMs;
    out.push({ kind: 'quiz', ...board(before ?? null), arrows: [], caption: episode.quiz.prompt, audioKey: spoken === undefined ? null : key, pauseMs: timing.quizPauseMs }, length);
  };

  const temptingMoves = (episode: CourseEpisode, ply: CoursePly, node: CourseNode): void => {
    const before = node.parentId ? (byId.get(node.parentId) ?? null) : null;
    (ply.tempting ?? []).forEach((tempting, index) => {
      const played = playOut(before?.fenAfter ?? document.startFen, [tempting.san, ...(tempting.refutation ?? [])]);
      const first = played[0];
      if (!first) return;
      const key = `tempting:${episode.id}:${ply.nodeId}:${index}`;
      const spoken = spokenLength(key, Boolean(tempting.why.trim()));
      const marks = marksFor(tempting.why, before?.fenAfter ?? document.startFen, spoken.key ? audioMs(key) : undefined);
      out.push(
        { kind: 'tempting', ...board(before), arrows: [{ from: first.from, to: first.to, kind: 'threat' }], caption: `${tempting.san}?`, audioKey: spoken.key, pauseMs: 0, ...marks },
        spoken.length
      );
      played.forEach((move, at) => {
        const sound = sounds ? (at === 0 ? 'bad' : moveSound({ san: move.san, mover: move.mover, learnerSide: document.learnerSide })) : null;
        out.push({ kind: 'move', fen: move.fen, lastMove: { from: move.from, to: move.to }, moveLabel: move.label, arrows: [], caption: at === 0 ? `${tempting.san}?` : '', audioKey: null, pauseMs: 0, sound }, timing.moveMs);
      });
      out.push({ kind: 'move', ...board(before), arrows: [], caption: '', audioKey: null, pauseMs: 0 }, timing.backMs);
    });
  };

  // A line off the tree (the trap's safe line): the board goes back to
  // before the move and plays the line while the coach says it.
  const lineOff = (episode: CourseEpisode, ply: CoursePly, node: CourseNode): void => {
    const before = node.parentId ? (byId.get(node.parentId) ?? null) : null;
    const played = playOut(before?.fenAfter ?? document.startFen, ply.playOut ?? []);
    const spoken = spokenLength(`clip:${episode.id}:${ply.nodeId}`, Boolean(videoLine(ply)));
    const step = Math.max(timing.moveMs, Math.round(spoken.length / (played.length + 1)));
    const caption = videoCaption(ply);
    out.push({ kind: 'beat', ...board(before), arrows: [], caption, audioKey: spoken.key, pauseMs: 0, sound: sounds ? 'whoosh' : null }, step);
    for (const move of played) {
      const sound = sounds ? moveSound({ san: move.san, mover: move.mover, learnerSide: document.learnerSide }) : null;
      out.push({ kind: 'beat', fen: move.fen, lastMove: { from: move.from, to: move.to }, moveLabel: move.label, arrows: [], caption, audioKey: null, pauseMs: 0, sound }, step);
    }
    shown = before;
  };

  for (const { chapter, episode } of chapteredEpisodes(document)) {
    if (chapter !== null) {
      out.push({ kind: 'chapter', ...board(shown), moveLabel: null, lastMove: null, arrows: [], caption: chapter, audioKey: null, pauseMs: 0, sound: sounds ? 'whoosh' : null }, timing.chapterMs);
      cut = false;
    }
    if (cut) {
      // The hook's cut back to the start, when no chapter card makes it.
      out.push({ kind: 'move', ...board(null), arrows: [], caption: '', audioKey: null, pauseMs: 0, sound: sounds ? 'whoosh' : null }, timing.backMs);
      shown = null;
      cut = false;
    }
    const videoPlies = episode.plies.filter((ply) => ply.video);
    // Code owns the quiz moment: before the answer is shown, never twice.
    const answerAt = episode.quiz ? videoPlies.findIndex((ply) => ply.nodeId === episode.quiz?.answerNodeId) : -1;
    if (episode.quiz && answerAt <= 0) quizMoment(episode);
    videoPlies.forEach((ply, index) => {
      if (episode.quiz && index === answerAt && index > 0) quizMoment(episode);
      const node = byId.get(ply.nodeId);
      if (!node) return;
      if (ply.playOut?.length) {
        lineOff(episode, ply, node);
        return;
      }
      if (shown?.id !== node.id) {
        playTo(node);
        if (node.parentId) shown = byId.get(node.parentId) ?? shown;
        temptingMoves(episode, ply, node);
      }
      const key = `clip:${episode.id}:${ply.nodeId}`;
      const spoken = spokenLength(key, Boolean(videoLine(ply)));
      // A move shown for the first time sounds; its line waits for it.
      const sound = shown?.id === node.id ? null : soundOf(node);
      const lead = sound && spoken.key ? soundLength(sound) : 0;
      shown = node;
      const marks = marksFor(videoLine(ply), node.fenAfter, spoken.key ? audioMs(key) : undefined);
      out.push({ kind: 'beat', ...board(node), arrows: ply.arrows, caption: videoCaption(ply), audioKey: spoken.key, pauseMs: 0, sound, audioOffsetMs: lead, ...marks }, spoken.length + lead);
    });
  }
  const outro = document.video?.outro.trim();
  if (outro) {
    const spoken = spokenLength('video:outro', true);
    out.push({ kind: 'outro', ...board(shown), moveLabel: null, arrows: [], caption: outro, audioKey: spoken.key, pauseMs: 0 }, spoken.length);
  }
  out.push({ kind: 'end', ...board(shown), lastMove: null, moveLabel: null, arrows: [], caption: '', audioKey: null, pauseMs: 0 }, timing.endCardMs);
  return { product: 'video', format: 'landscape', segments: out.segments, durationMs: out.clock };
}

/** Moves off the course's tree (a tempting move and its refutation), played
 * from `fen` while they are legal. */
export function playOut(fen: string, sans: string[]): { san: string; from: string; to: string; fen: string; mover: 'white' | 'black'; label: string }[] {
  const chess = new Chess(fen);
  const played: { san: string; from: string; to: string; fen: string; mover: 'white' | 'black'; label: string }[] = [];
  for (const san of sans) {
    const fenBefore = chess.fen();
    try {
      const move = chess.move(san);
      played.push({ san: move.san, from: move.from, to: move.to, fen: chess.fen(), mover: move.color === 'w' ? 'white' : 'black', label: sanLabel(fenBefore, move.san) });
    } catch {
      break;
    }
  }
  return played;
}

/** The segment playing at `ms` (the last one past the end). */
export function segmentAt(timeline: ClipTimeline, ms: number): ClipSegment | undefined {
  return timeline.segments.find((segment) => ms < segment.end) ?? timeline.segments[timeline.segments.length - 1];
}
