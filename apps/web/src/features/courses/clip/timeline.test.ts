import { parseCourseTree } from '@freechesscoach/chess-analysis';
import type { CourseDocument, CourseEpisode, CoursePly } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { buildClipTimeline, clipEpisodes, segmentAt } from './timeline.js';

const tree = parseCourseTree('1. d4 e5 2. dxe5 Nc6 3. Nf3 Qe7 4. Bf4 Qb4+ 5. Bd2 Qxb2 6. Bc3 Bb4 7. Qd2 Bxc3 8. Qxc3 Qc1# *');
/** A move in the clip: its line, a caption from it. */
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
    chapters: [{ id: 'c1', title: 'Trap', lineId: 'l1', episodeIds: episodes.map((each) => each.id) }],
    episodes,
    takeaways: [],
    hookOptions: [],
    clipLinks: {}
  };
}

const TIMING = { moveMs: 100, gapMs: 10, silentBeatMs: 500, endCardMs: 1000, quizPauseMs: 3000 };

describe('buildClipTimeline', () => {
  test('the hook and each video move last their audio plus the gap; moves between play fast; the end card closes', () => {
    const document = trap([
      episode('e1', 'hook', []),
      episode('e2', 'setup', [clip('n2', 'The gambit.'), clip('n4', '')]),
      episode('e3', 'safety', [clip('n11', 'Your move.')])
    ]);
    document.video = { title: 'Greed', thumbnailText: 'Greed loses', hook: 'Greed loses.', outro: '' };
    const audio: Record<string, number> = { 'video:hook': 2000, 'clip:e2:n2': 1000, 'clip:e3:n11': 1500 };

    const timeline = buildClipTimeline({ document, format: 'vertical', audioMs: (key) => audio[key], timing: TIMING });

    expect(timeline.segments.map((segment) => [segment.kind, segment.start, segment.end, segment.moveLabel, segment.audioKey])).toEqual([
      ['title', 0, 2010, null, 'video:hook'],
      ['move', 2010, 2110, '1.d4', null],
      ['beat', 2110, 3120, '1…e5', 'clip:e2:n2'],
      ['move', 3120, 3220, '2.dxe5', null],
      ['beat', 3220, 3720, '2…Nc6', null],
      ...['3.Nf3', '3…Qe7', '4.Bf4', '4…Qb4+', '5.Bd2', '5…Qxb2'].map((label, index) => ['move', 3720 + index * 100, 3820 + index * 100, label, null]),
      ['beat', 4320, 4320 + 1510, '6.Bc3', 'clip:e3:n11'],
      ['end', 5830, 6830, null, null]
    ]);
    expect(timeline.durationMs).toBe(6830);
    expect(timeline.segments[2]?.lastMove).toEqual({ from: 'e7', to: 'e5' });
    expect(segmentAt(timeline, 2110)?.moveLabel).toBe('1…e5');
    expect(segmentAt(timeline, 99_999)?.kind).toBe('end');
  });

  test('board sounds: each new move carries its sounds; a narrated move speaks after them', () => {
    const document = trap([episode('e1', 'setup', [clip('n2', 'The gambit.'), clip('n2', 'Again, no new move.')])]);
    const audio: Record<string, number> = { 'clip:e1:n2': 1000 };
    // White blundered the first move (either side plays bad and great in a clip).
    const evals = { n1: { cp: -200, quality: 'blunder' as const }, n2: { cp: -180, quality: 'best' as const } };

    const timeline = buildClipTimeline({ document, format: 'vertical', audioMs: (key) => audio[key], timing: TIMING, sounds: { evals, lengthMs: () => 180 } });

    const [move, first, again] = timeline.segments;
    expect(move).toMatchObject({ kind: 'move', sound: 'bad', audioOffsetMs: 0, end: 100 });
    // The beat's audio waits for the knock; the beat is longer by as much.
    expect(first).toMatchObject({ kind: 'beat', sound: 'move', audioOffsetMs: 180, start: 100, end: 100 + 180 + 1010 });
    // The same move again: no sound, no wait.
    expect(again).toMatchObject({ kind: 'beat', sound: null, audioOffsetMs: 0 });

    const silent = buildClipTimeline({ document, format: 'vertical', audioMs: (key) => audio[key], timing: TIMING });
    expect(silent.segments.every((segment) => segment.sound === null && segment.audioOffsetMs === 0)).toBe(true);
  });

  test('code adds the quiz moment: the position before the answer, the prompt spoken, a countdown', () => {
    const quiz = { answerNodeId: 'n12', prompt: 'What does Black play?', hint: '', reveal: '' };
    const document = trap([
      episode('e1', 'bait', [clip('n11', 'Bc3 hits the queen.')]),
      { ...episode('e2', 'quiz', [clip('n12', 'Bb4 pins it.')]), quiz }
    ]);
    const audio: Record<string, number> = { 'clip:e1:n11': 1000, 'quiz:e2': 800, 'clip:e2:n12': 900 };

    const segments = buildClipTimeline({ document, format: 'vertical', audioMs: (key) => audio[key], timing: TIMING }).segments.filter((segment) => segment.kind !== 'move');

    expect(segments.map((segment) => [segment.kind, segment.moveLabel, segment.caption, segment.end - segment.start, segment.pauseMs])).toEqual([
      ['beat', '6.Bc3', 'Bc3 hits t', 1010, 0],
      ['quiz', '6.Bc3', 'What does Black play?', 810 + 3000, 3000],
      ['beat', '6…Bb4', 'Bb4 pins i', 910, 0],
      ['end', null, '', 1000, 0]
    ]);
  });

  test('a clip move back up the line (the safety move) cuts to it without replaying moves', () => {
    const document = trap([episode('e1', 'punish', [clip('n16', 'Mate.')]), episode('e2', 'safety', [clip('n11', 'Play Nc3 instead.')])]);
    const timeline = buildClipTimeline({ document, format: 'vertical', audioMs: () => 1000, timing: TIMING });
    const kinds = timeline.segments.map((segment) => segment.kind);
    expect(kinds.slice(-3)).toEqual(['beat', 'beat', 'end']);
    expect(timeline.segments.at(-2)?.moveLabel).toBe('6.Bc3');
  });

  test('the vertical tactics clip stops after the first example; the 16:9 one has them all', () => {
    const episodes = [episode('e1', 'concept', []), episode('e2', 'example', []), episode('e3', 'example', []), episode('e4', 'scan', [])];
    expect(clipEpisodes(trap(episodes, 'tactics'), 'vertical').map((each) => each.id)).toEqual(['e1', 'e2']);
    expect(clipEpisodes(trap(episodes, 'tactics'), 'landscape').map((each) => each.id)).toEqual(['e1', 'e2', 'e3', 'e4']);
  });
});

describe('the clip from plies', () => {
  test('only clip moves speak; a course-only move is played without a word; the caption comes from the line', () => {
    const courseOnly: CoursePly = { nodeId: 'n2', text: 'The course explains this at length.', arrows: [], course: true, video: false };
    const spoken: CoursePly = { nodeId: 'n4', text: 'Nc6 hits e5. Black wins the pawn back.', arrows: [], course: true, video: true };
    const document = trap([episode('e1', 'setup', [courseOnly, spoken])]);
    const beats = buildClipTimeline({ document, format: 'vertical', audioMs: () => 1000, timing: TIMING }).segments.filter((segment) => segment.kind === 'beat');
    expect(beats.map((segment) => [segment.moveLabel, segment.audioKey, segment.caption])).toEqual([['2…Nc6', 'clip:e1:n4', 'Nc6 hits e5.']]);
  });
});
