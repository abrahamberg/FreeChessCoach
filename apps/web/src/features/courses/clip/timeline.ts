import { Chess } from 'chess.js';
import { temptingEvalKey, videoCaption, videoLine, type MoveQuality, type CourseArrow, type CourseDocument, type CourseEpisode, type CourseNode, type CoursePly } from '@freechesscoach/shared';
import { moveSound } from '../../../sounds/move-sounds.js';
import { courseMoveSound, type CourseEvals } from '../player/course-move-list.js';
import { moveLabel as sanLabel } from '@freechesscoach/chess-analysis';
import { climaxNode, fenBefore, moveLabel } from '../courseEdits.js';
import { checkedKing, type CheckedKing } from '../../board/checked-king.js';
import { clipSoundLengthMs, cutSoundOf, type ClipSound } from './clip-sounds.js';

export { checkedKing, type CheckedKing };
import { speechMarks, type ClipMark, type ClipWord } from './speech-marks.js';

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
  /** An unnarrated move between lines (the owner, 2026-10-18: 30% longer). */
  moveMs: 910,
  /** The same for a move the creator marked `@fast`. */
  fastMoveMs: 350,
  /** How long a move the creator marked `@slow` is held, on top of its own length. */
  slowHoldMs: 1500,
  /** After each line's audio: the coach finishes the sentence and the
   * viewer gets a breath before the board moves on (the owner, 2026-10-12:
   * the film cut on while he was still talking). The video's length is a
   * guide, never a reason to hurry a line. */
  gapMs: 1000,
  /** More after the line on a capture or a check, so it lands before the next move. */
  landMs: 600,
  /** And after the line on a checkmate: the mated king is held on screen. */
  mateMs: 2500,
  /** A line with no words (a caption only). */
  silentBeatMs: 1500,
  /** The end card with the course link. */
  endCardMs: 3000,
  /** The quiz countdown after its prompt (CONFIG.courses.quizPauseSeconds). */
  quizPauseMs: 3000,
  /** A chapter's card (§13.4), at least; the coach reading its name can make it longer. */
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
  /** `lastMove` was played from the board before this segment, here: its
   * pale arrow shows for the segment's first moments (draw-frame.ts). False
   * on a board that holds a move already shown, or after a cut. */
  played?: boolean;
  /** The king in check on this board, lit; `mated` when it is checkmate. */
  king?: CheckedKing;
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
  /** The engine's word on the lesson move this board shows, as the app's
   * review shows it: the evaluation for the bar (centipawns, White's side)
   * and the move's quality for its badge. Absent on a board the engine pass
   * did not rate (the start, a move played out off the lesson's line). */
  rated?: { cp: number; quality: MoveQuality };
  /** The reel's words as they are said, timed from the audio's start, for
   * its captions word by word (draw-frame.ts); absent when silent. */
  words?: ClipWord[];
  /** The reel's climax: the board zooms in on it and its quality pops. */
  climax?: boolean;
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
  /** The course's evaluations, for the evaluation bar and the quality
   * badges. Absent: neither is drawn. */
  evals?: CourseEvals;
}

/** The hold after the line on `san`: a capture or a check lands, a mate stays. */
export function landingMs(san: string, timing: { landMs: number; mateMs: number }): number {
  if (san.endsWith('#')) return timing.mateMs;
  return san.includes('x') || san.endsWith('+') ? timing.landMs : 0;
}

type NewSegment = Omit<ClipSegment, 'start' | 'end' | 'sound' | 'audioOffsetMs'> & Partial<Pick<ClipSegment, 'sound' | 'audioOffsetMs'>>;

/** Appends segments back to back. */
export class SegmentWriter {
  readonly segments: ClipSegment[] = [];
  clock = 0;

  push(segment: NewSegment, length: number): void {
    const before = this.segments.at(-1);
    const played = !!before && !!segment.lastMove && playedFrom(before.fen, segment.lastMove, segment.fen);
    this.segments.push({ sound: null, audioOffsetMs: 0, ...segment, ...(played ? { played } : {}), start: this.clock, end: this.clock + length });
    this.clock += length;
  }
}

/** Whether `move` played on `beforeFen` gives `fen`'s board. */
function playedFrom(beforeFen: string, move: { from: string; to: string }, fen: string): boolean {
  if (beforeFen === fen) return false;
  const placement = fen.split(' ')[0];
  try {
    return new Chess(beforeFen).moves({ verbose: true }).some((each) => each.from === move.from && each.to === move.to && each.after.split(' ')[0] === placement);
  } catch {
    return false;
  }
}

/** A segment's marks for its spoken `text` over `fen`: none when silent. */
export function marksFor(text: string, fen: string, audioMs: number | undefined): Pick<ClipSegment, 'marks'> {
  const marks = audioMs === undefined ? [] : speechMarks(text, fen, audioMs);
  return marks.length ? { marks } : {};
}

/** How much of a "what if" line is said before its first move plays: its
 * first sentence's share of the words (the question), or an even share when
 * it is one sentence. */
function leadShare(why: string, moves: number): number {
  const words = (text: string): number => text.split(/\s+/).filter(Boolean).length;
  const sentences = why.trim().split(/(?<=[.!?:])\s+/);
  const even = 1 / (moves + 1);
  if (sentences.length < 2 || !words(why)) return even;
  return Math.min(0.5, Math.max(even / 2, words(sentences[0]!) / words(why)));
}

type Board = Pick<ClipSegment, 'fen' | 'lastMove' | 'moveLabel' | 'king' | 'rated'>;

/** The board after `node`, or the course's start. */
export function boardAt(document: CourseDocument, node: CourseNode | null, evals?: CourseEvals): Board {
  if (!node) return boardOfPosition(document.startFen);
  const rated = evals?.[node.id];
  return {
    ...checkedKing(node.fenAfter),
    ...(rated ? { rated } : {}),
    fen: node.fenAfter,
    lastMove: { from: node.uci.slice(0, 2), to: node.uci.slice(2, 4) },
    moveLabel: moveLabel(document, node)
  };
}

/** A position with no move just played: an example's start. */
export function boardOfPosition(fen: string): Board {
  return { ...checkedKing(fen), fen, lastMove: null, moveLabel: null };
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

/** How long a move without words lasts: a creator's `@fast` plays it quickly,
 * a `@slow` holds it. */
export function movePaceMs(node: CourseNode, moveMs: number, fastMoveMs: number, slowHoldMs: number): number {
  if (node.marks.includes('fast')) return fastMoveMs;
  return node.marks.includes('slow') ? moveMs + slowHoldMs : moveMs;
}

/** The episodes in chapter order, with their chapter. */
function chapteredEpisodes(document: CourseDocument): { chapter: { id: string; title: string } | null; episode: CourseEpisode }[] {
  const byId = new Map(document.episodes.map((episode) => [episode.id, episode]));
  const ordered = document.chapters.flatMap((chapter) => chapter.episodeIds.flatMap((id, index) => {
    const episode = byId.get(id);
    return episode ? [{ chapter: index === 0 ? { id: chapter.id, title: chapter.title } : null, episode }] : [];
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
  /** A cut's sound: the whoosh, or the coach's own. */
  const cutSound = sounds ? cutSoundOf(document.coachPersona) : null;
  const byId = new Map(document.nodes.map((node) => [node.id, node]));
  const out = new SegmentWriter();
  let shown: CourseNode | null = null;
  const board = (node: CourseNode | null) => boardAt(document, node, options.evals);
  /** The board before `node` is played: its parent's, or, at an example's first move, that example's start. */
  const boardBefore = (node: CourseNode): Board => {
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    return parent ? board(parent) : boardOfPosition(fenBefore(document, node));
  };
  const spokenLength = (key: string, has: boolean): { key: string | null; length: number } => {
    const spoken = has ? audioMs(key) : undefined;
    return spoken === undefined ? { key: null, length: timing.silentBeatMs } : { key, length: spoken + timing.gapMs };
  };
  const playTo = (node: CourseNode): void => {
    for (const between of movesBetween(byId, shown, node)) out.push({ kind: 'move', ...board(between), arrows: [], caption: '', audioKey: null, pauseMs: 0, sound: soundOf(between) }, movePaceMs(between, timing.moveMs, timing.fastMoveMs, timing.slowHoldMs));
  };

  // §13.4: the hook over the climax, then the cut back to the start.
  const hook = document.video?.hook.trim();
  let cut = false;
  if (hook) {
    const climax = climaxNode(document) ?? null;
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
    // The scene first: what is going on, said over the position, before the question.
    const scene = episode.quiz.scene.trim() ? spokenLength(`quiz-scene:${episode.id}`, true) : null;
    const shownBefore = boardBefore(answer);
    if (scene) out.push({ kind: 'beat', ...shownBefore, arrows: [], caption: '', audioKey: scene.key, pauseMs: 0, ...marksFor(episode.quiz.scene, shownBefore.fen, scene.key ? audioMs(scene.key) : undefined) }, scene.length);
    const key = `quiz:${episode.id}`;
    const spoken = episode.quiz.prompt.trim() ? audioMs(key) : undefined;
    const length = (spoken === undefined ? 0 : spoken + timing.gapMs) + timing.quizPauseMs;
    out.push({ kind: 'quiz', ...shownBefore, arrows: [], caption: episode.quiz.prompt, audioKey: spoken === undefined ? null : key, pauseMs: timing.quizPauseMs }, length);
  };

  // A trap's film runs its line without a detour (the owner's note,
  // 2026-10-11): the opponent's other tries wait for the line's end, and the
  // learner's own are the course's, since the learner is springing the trap.
  const trap = document.kind === 'trap';
  const sideRoads: (() => void)[] = [];
  const temptingMoves = (episode: CourseEpisode, ply: CoursePly, node: CourseNode): void => {
    const learners = sideToMove(fenBefore(document, node)) === document.learnerSide;
    if (trap && learners) return;
    if (trap) sideRoads.push(() => playTempting(episode, ply, node));
    else playTempting(episode, ply, node);
  };
  const playTempting = (episode: CourseEpisode, ply: CoursePly, node: CourseNode): void => {
    const startFen = fenBefore(document, node);
    (ply.tempting ?? []).forEach((tempting, index) => {
      const played = playOut(startFen, [tempting.san, ...(tempting.refutation ?? [])]);
      const first = played[0];
      if (!first) return;
      const key = `tempting:${episode.id}:${ply.nodeId}:${index}`;
      const spoken = spokenLength(key, Boolean(tempting.why.trim()));
      const marks = marksFor(tempting.why, startFen, spoken.key ? audioMs(key) : undefined);
      // The moves play while the coach tells them, not after: a long "why"
      // over a still board was hard to follow (the owner, 2026-10-12). The
      // arrow stays for the opening question, the line's first sentence, and
      // the moves share the rest of the audio.
      // The engine's word on the tempting move; its answer is the engine's
      // own line, so each move of it is the best and the figure holds.
      const verdict = options.evals?.[temptingEvalKey(ply.nodeId, tempting.san)];
      const ratedAt = (at: number): Pick<ClipSegment, 'rated'> => (verdict ? { rated: at === 0 ? verdict : { cp: verdict.cp, quality: 'best' } } : {});
      const step = Math.max(timing.moveMs, Math.floor((spoken.length * (1 - leadShare(tempting.why, played.length))) / played.length));
      const lead = Math.max(timing.moveMs, spoken.length - step * played.length);
      out.push(
        { kind: 'tempting', ...boardBefore(node), moveLabel: first.label, arrows: [{ from: first.from, to: first.to, kind: 'threat' }], caption: `${tempting.san}?`, audioKey: spoken.key, pauseMs: 0, ...marks },
        lead
      );
      played.forEach((move, at) => {
        const sound = sounds ? (at === 0 ? 'bad' : moveSound({ san: move.san, mover: move.mover, learnerSide: document.learnerSide })) : null;
        out.push({ kind: 'move', fen: move.fen, ...checkedKing(move.fen), lastMove: { from: move.from, to: move.to }, moveLabel: move.label, arrows: [], caption: at === 0 ? `${tempting.san}?` : '', audioKey: null, pauseMs: 0, sound, ...ratedAt(at) }, step);
      });
      out.push({ kind: 'move', ...boardBefore(node), arrows: [], caption: '', audioKey: null, pauseMs: 0 }, timing.backMs);
    });
  };

  // A line off the tree (the trap's safe line): the board goes back to
  // before the move and plays the line while the coach says it.
  const lineOff = (episode: CourseEpisode, ply: CoursePly, node: CourseNode): void => {
    const before = node.parentId ? (byId.get(node.parentId) ?? null) : null;
    const played = playOut(fenBefore(document, node), ply.playOut ?? []);
    const spoken = spokenLength(`clip:${episode.id}:${ply.nodeId}`, Boolean(videoLine(ply)));
    const step = Math.max(timing.moveMs, Math.round(spoken.length / (played.length + 1)));
    const caption = videoCaption(ply);
    // The cut's sound first, then the coach (the owner, 2026-10-18: they overlapped).
    const lead = cutSound && spoken.key ? soundLength(cutSound) : 0;
    out.push({ kind: 'beat', ...boardBefore(node), arrows: [], caption, audioKey: spoken.key, pauseMs: 0, sound: cutSound, audioOffsetMs: lead }, lead + step);
    // The safe line is the engine's best from here: the evaluation before it holds along it.
    const held = before ? options.evals?.[before.id] : undefined;
    const rated: Pick<ClipSegment, 'rated'> = held ? { rated: { cp: held.cp, quality: 'best' } } : {};
    for (const move of played) {
      const sound = sounds ? moveSound({ san: move.san, mover: move.mover, learnerSide: document.learnerSide }) : null;
      out.push({ kind: 'beat', fen: move.fen, ...checkedKing(move.fen), lastMove: { from: move.from, to: move.to }, moveLabel: move.label, arrows: [], caption, audioKey: null, pauseMs: 0, sound, ...rated }, step);
    }
    shown = before;
  };

  for (const { chapter, episode } of chapteredEpisodes(document)) {
    if (chapter !== null) {
      // The cut's sound, then the coach reads the chapter's name (the owner,
      // 2026-10-18: not over each other); the card stays until the name is read.
      const key = `chapter:${chapter.id}`;
      const spoken = audioMs(key) === undefined ? null : spokenLength(key, true);
      const lead = cutSound && spoken ? soundLength(cutSound) : 0;
      out.push({ kind: 'chapter', ...board(shown), moveLabel: null, lastMove: null, arrows: [], caption: chapter.title, audioKey: spoken?.key ?? null, pauseMs: 0, sound: cutSound, audioOffsetMs: lead }, Math.max(timing.chapterMs, lead + (spoken?.length ?? 0)));
      cut = false;
    }
    if (SIDE_ROAD_ROLES.has(episode.role)) sideRoads.splice(0).forEach((play) => play());
    if (cut) {
      // The hook's cut back to the start, when no chapter card makes it.
      out.push({ kind: 'move', ...board(null), arrows: [], caption: '', audioKey: null, pauseMs: 0, sound: cutSound }, timing.backMs);
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
      out.push({ kind: 'beat', ...board(node), arrows: ply.arrows, caption: videoCaption(ply), audioKey: spoken.key, pauseMs: 0, sound, audioOffsetMs: lead, ...marks }, spoken.length + lead + landingMs(node.san, timing) + (node.marks.includes('slow') ? timing.slowHoldMs : 0));
    });
  }
  sideRoads.splice(0).forEach((play) => play());
  const outro = document.video?.outro.trim();
  if (outro) {
    const spoken = spokenLength('video:outro', true);
    out.push({ kind: 'outro', ...board(shown), moveLabel: null, arrows: [], caption: outro, audioKey: spoken.key, pauseMs: 0 }, spoken.length);
  }
  out.push({ kind: 'end', ...board(shown), lastMove: null, moveLabel: null, arrows: [], caption: '', audioKey: null, pauseMs: 0 }, timing.endCardMs);
  return { product: 'video', format: 'landscape', segments: out.segments, durationMs: out.clock };
}

/** A trap's episodes after its line: the side roads open before the first. */
const SIDE_ROAD_ROLES = new Set(['safety', 'defence', 'alternative']);

function sideToMove(fen: string): 'white' | 'black' {
  return fen.split(' ')[1] === 'b' ? 'black' : 'white';
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
