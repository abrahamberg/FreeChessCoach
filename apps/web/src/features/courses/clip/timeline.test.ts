import { parseCourseTree } from '@freechesscoach/chess-analysis';
import type { CourseDocument, CourseEpisode, CoursePly } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { buildVideoTimeline, segmentAt } from './timeline.js';

const tree = parseCourseTree('1. d4 e5 2. dxe5 Nc6 3. Nf3 Qe7 4. Bf4 Qb4+ 5. Bd2 Qxb2 6. Bc3 Bb4 7. Qd2 Bxc3 8. Qxc3 Qc1# *');
/** A move in the video: its line, a caption from it. */
const clip = (nodeId: string, text: string): CoursePly => ({ nodeId, text, caption: text.slice(0, 10), arrows: [], course: false, video: true });
const episode = (id: string, role: string, plies: CoursePly[]): CourseEpisode => ({
  id, role, focus: '', startNodeId: 'n1', endNodeId: 'n16', plies, drillNodeIds: []
});

function trap(episodes: CourseEpisode[], kind: CourseDocument['kind'] = 'trap'): CourseDocument {
  return {
    version: 1,
    kind,
    title: 'Englund',
    promise: '',
    learnerSide: 'black',
    levelBand: 'novice',
    coachPersona: 'commander',
    startFen: tree.startFen,
    nodes: tree.nodes,
    lines: tree.lines,
    // No chapters: no chapter cards, unless a test adds them.
    chapters: [],
    episodes,
    takeaways: [],
    hookOptions: [],
    clipLinks: {}
  };
}

const TIMING = { moveMs: 100, gapMs: 10, silentBeatMs: 500, endCardMs: 1000, quizPauseMs: 3000, chapterMs: 2000, backMs: 100 };

describe('buildVideoTimeline (§13.4)', () => {
  test('the hook and each video move last their audio plus the gap; moves between play fast; the end card closes', () => {
    const document = trap([
      episode('e1', 'hook', []),
      episode('e2', 'setup', [clip('n2', 'The gambit.'), clip('n4', '')]),
      episode('e3', 'safety', [clip('n11', 'Your move.')])
    ]);
    document.video = { title: 'Greed', thumbnailText: 'Greed loses', hook: 'Greed loses.', outro: '' };
    const audio: Record<string, number> = { 'video:hook': 2000, 'clip:e2:n2': 1000, 'clip:e3:n11': 1500 };

    const timeline = buildVideoTimeline({ document, audioMs: (key) => audio[key], timing: TIMING });

    expect(timeline.segments.map((segment) => [segment.kind, segment.start, segment.end, segment.moveLabel, segment.audioKey])).toEqual([
      // The hook over the line's end, then the cut back to the start.
      ['title', 0, 2010, null, 'video:hook'],
      ['move', 2010, 2110, null, null],
      ['move', 2110, 2210, '1.d4', null],
      ['beat', 2210, 3220, '1…e5', 'clip:e2:n2'],
      ['move', 3220, 3320, '2.dxe5', null],
      ['beat', 3320, 3820, '2…Nc6', null],
      ...['3.Nf3', '3…Qe7', '4.Bf4', '4…Qb4+', '5.Bd2', '5…Qxb2'].map((label, index) => ['move', 3820 + index * 100, 3920 + index * 100, label, null]),
      ['beat', 4420, 4420 + 1510, '6.Bc3', 'clip:e3:n11'],
      ['end', 5930, 6930, null, null]
    ]);
    expect(timeline.durationMs).toBe(6930);
    expect(timeline.segments[0]?.fen).toBe(tree.nodes.at(-1)?.fenAfter);
    expect(timeline.segments[3]?.lastMove).toEqual({ from: 'e7', to: 'e5' });
    expect(segmentAt(timeline, 2210)?.moveLabel).toBe('1…e5');
    expect(segmentAt(timeline, 99_999)?.kind).toBe('end');
  });

  test('board sounds: each new move carries its sounds; a narrated move speaks after them', () => {
    const document = trap([episode('e1', 'setup', [clip('n2', 'The gambit.'), clip('n2', 'Again, no new move.')])]);
    const audio: Record<string, number> = { 'clip:e1:n2': 1000 };
    // White blundered the first move (either side plays bad and great in a clip).
    const evals = { n1: { cp: -200, quality: 'blunder' as const }, n2: { cp: -180, quality: 'best' as const } };

    const timeline = buildVideoTimeline({ document, audioMs: (key) => audio[key], timing: TIMING, sounds: { evals, lengthMs: () => 180 } });

    const [move, first, again] = timeline.segments;
    expect(move).toMatchObject({ kind: 'move', sound: 'bad', audioOffsetMs: 0, end: 100 });
    // The beat's audio waits for the knock; the beat is longer by as much.
    expect(first).toMatchObject({ kind: 'beat', sound: 'move', audioOffsetMs: 180, start: 100, end: 100 + 180 + 1010 });
    // The same move again: no sound, no wait.
    expect(again).toMatchObject({ kind: 'beat', sound: null, audioOffsetMs: 0 });

    const silent = buildVideoTimeline({ document, audioMs: (key) => audio[key], timing: TIMING });
    expect(silent.segments.every((segment) => segment.sound === null && segment.audioOffsetMs === 0)).toBe(true);
  });

  test('code adds the quiz moment: the position before the answer, the prompt spoken, a countdown', () => {
    const quiz = { answerNodeId: 'n12', prompt: 'What does Black play?', hint: '', reveal: '' };
    const document = trap([
      episode('e1', 'bait', [clip('n11', 'Bc3 hits the queen.')]),
      { ...episode('e2', 'quiz', [clip('n12', 'Bb4 pins it.')]), quiz }
    ]);
    const audio: Record<string, number> = { 'clip:e1:n11': 1000, 'quiz:e2': 800, 'clip:e2:n12': 900 };

    const segments = buildVideoTimeline({ document, audioMs: (key) => audio[key], timing: TIMING }).segments.filter((segment) => segment.kind !== 'move');

    expect(segments.map((segment) => [segment.kind, segment.moveLabel, segment.caption, segment.end - segment.start, segment.pauseMs])).toEqual([
      ['beat', '6.Bc3', 'Bc3 hits t', 1010, 0],
      ['quiz', '6.Bc3', 'What does Black play?', 810 + 3000, 3000],
      ['beat', '6…Bb4', 'Bb4 pins i', 910, 0],
      ['end', null, '', 1000, 0]
    ]);
  });

  test('a clip move back up the line (the safety move) cuts to it without replaying moves', () => {
    const document = trap([episode('e1', 'punish', [clip('n16', 'Mate.')]), episode('e2', 'safety', [clip('n11', 'Play Nc3 instead.')])]);
    const timeline = buildVideoTimeline({ document, audioMs: () => 1000, timing: TIMING });
    const kinds = timeline.segments.map((segment) => segment.kind);
    expect(kinds.slice(-3)).toEqual(['beat', 'beat', 'end']);
    expect(timeline.segments.at(-2)?.moveLabel).toBe('6.Bc3');
  });

  test('a card per chapter with a whoosh; the outro before the end card', () => {
    const document = trap([episode('e1', 'setup', [clip('n2', 'The gambit.')]), episode('e2', 'bait', [clip('n11', 'Bc3.')])]);
    document.chapters = [
      { id: 'c1', title: 'The setup', lineId: 'l1', episodeIds: ['e1'] },
      { id: 'c2', title: 'The bait', lineId: 'l1', episodeIds: ['e2'] }
    ];
    document.video = { title: 'T', thumbnailText: '', hook: '', outro: 'Would you take the pawn?' };
    const timeline = buildVideoTimeline({ document, audioMs: () => 1000, timing: TIMING, sounds: { evals: {}, lengthMs: () => 0 } });
    const cards = timeline.segments.filter((segment) => segment.kind === 'chapter' || segment.kind === 'outro');
    expect(cards.map((segment) => [segment.kind, segment.caption, segment.sound, segment.audioKey])).toEqual([
      ['chapter', 'The setup', 'whoosh', null],
      ['chapter', 'The bait', 'whoosh', null],
      ['outro', 'Would you take the pawn?', null, 'video:outro']
    ]);
    expect(timeline.segments.at(-1)?.kind).toBe('end');
  });

  test('a tempting move is shown and explained, played out with the engine’s answer, and taken back before the real move', () => {
    const bait: CoursePly = { ...clip('n12', 'Bb4 pins it.'), tempting: [{ san: 'Qxc3+', why: 'The queen takes with check, and loses the win.', refutation: ['Nxc3'] }] };
    const document = trap([episode('e1', 'quiz', [bait])]);
    const audio: Record<string, number> = { 'tempting:e1:n12:0': 1500, 'clip:e1:n12': 900 };
    const segments = buildVideoTimeline({ document, audioMs: (key) => audio[key], timing: TIMING, sounds: { evals: {}, lengthMs: () => 0 } }).segments;
    const from = segments.findIndex((segment) => segment.kind === 'tempting');

    expect(segments.slice(from, from + 5).map((segment) => [segment.kind, segment.moveLabel, segment.caption, segment.audioKey, segment.sound, segment.end - segment.start])).toEqual([
      ['tempting', '6.Bc3', 'Qxc3+?', 'tempting:e1:n12:0', null, 1510],
      ['move', '6…Qxc3+', 'Qxc3+?', null, 'bad', 100],
      ['move', '7.Nxc3', '', null, 'capture', 100],
      ['move', '6.Bc3', '', null, null, 100],
      ['beat', '6…Bb4', 'Bb4 pins i', 'clip:e1:n12', 'move', 910]
    ]);
    expect(segments[from]?.arrows).toEqual([{ from: 'b2', to: 'c3', kind: 'threat' }]);
  });
});

describe('the video from plies', () => {
  test('only video moves speak; a course-only move is played without a word; the caption comes from the line', () => {
    const courseOnly: CoursePly = { nodeId: 'n2', text: 'The course explains this at length.', arrows: [], course: true, video: false };
    const spoken: CoursePly = { nodeId: 'n4', text: 'Nc6 hits e5. Black wins the pawn back.', arrows: [], course: true, video: true };
    const document = trap([episode('e1', 'setup', [courseOnly, spoken])]);
    const beats = buildVideoTimeline({ document, audioMs: () => 1000, timing: TIMING }).segments.filter((segment) => segment.kind === 'beat');
    expect(beats.map((segment) => [segment.moveLabel, segment.audioKey, segment.caption])).toEqual([['2…Nc6', 'clip:e1:n4', 'Nc6 hits e5.']]);
  });
});
