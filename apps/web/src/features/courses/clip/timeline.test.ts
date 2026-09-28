import { parseCourseTree } from '@freechesscoach/chess-analysis';
import type { CourseBeat, CourseDocument, CourseEpisode } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { buildClipTimeline, clipEpisodes, segmentAt } from './timeline.js';

const tree = parseCourseTree('1. d4 e5 2. dxe5 Nc6 3. Nf3 Qe7 4. Bf4 Qb4+ 5. Bd2 Qxb2 6. Bc3 Bb4 7. Qd2 Bxc3 8. Qxc3 Qc1# *');
const beat = (nodeId: string | null, say: string, extra: Partial<CourseBeat> = {}): CourseBeat => ({ nodeId, say, caption: say.slice(0, 10), arrows: [], ...extra });
const episode = (id: string, role: string, beats: CourseBeat[]): CourseEpisode => ({ id, role, focus: '', startNodeId: 'n1', endNodeId: 'n16', beats, notes: [], drillNodeIds: [] });

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
  test('beats last their audio plus the gap and the quiz pause; moves between beats play fast; the end card closes', () => {
    const document = trap([
      episode('e1', 'hook', [beat(null, 'Greed loses.')]),
      episode('e2', 'setup', [beat('n2', 'The gambit.'), beat('n4', '')]),
      episode('e3', 'safety', [beat('n11', 'Your move.', { pauseMs: 3000 })])
    ]);
    const audio: Record<string, number> = { 'beat:e1:0': 2000, 'beat:e2:0': 1000, 'beat:e3:0': 1500 };

    const timeline = buildClipTimeline({ document, format: 'vertical', audioMs: (key) => audio[key], timing: TIMING });

    expect(timeline.segments.map((segment) => [segment.kind, segment.start, segment.end, segment.moveLabel, segment.audioKey])).toEqual([
      ['title', 0, 2010, null, 'beat:e1:0'],
      ['move', 2010, 2110, '1.d4', null],
      ['beat', 2110, 3120, '1…e5', 'beat:e2:0'],
      ['move', 3120, 3220, '2.dxe5', null],
      ['beat', 3220, 3720, '2…Nc6', null],
      ...['3.Nf3', '3…Qe7', '4.Bf4', '4…Qb4+', '5.Bd2', '5…Qxb2'].map((label, index) => ['move', 3720 + index * 100, 3820 + index * 100, label, null]),
      ['beat', 4320, 4320 + 1510 + 3000, '6.Bc3', 'beat:e3:0'],
      ['end', 8830, 9830, null, null]
    ]);
    expect(timeline.durationMs).toBe(9830);
    expect(timeline.segments[2]?.lastMove).toEqual({ from: 'e7', to: 'e5' });
    expect(timeline.segments.find((segment) => segment.kind === 'beat' && segment.pauseMs)?.pauseMs).toBe(3000);
    expect(segmentAt(timeline, 2110)?.moveLabel).toBe('1…e5');
    expect(segmentAt(timeline, 99_999)?.kind).toBe('end');
  });

  test('board sounds: each new move carries its sounds; a narrated move speaks after them', () => {
    const document = trap([episode('e1', 'setup', [beat('n2', 'The gambit.'), beat('n2', 'Again, no new move.')])]);
    const audio: Record<string, number> = { 'beat:e1:0': 1000, 'beat:e1:1': 500 };
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

  test("code adds the quiz moment: the position before the answer, the prompt spoken, a countdown; the model's pause is dropped", () => {
    const quiz = { answerNodeId: 'n12', prompt: 'What does Black play?', hint: '', reveal: '' };
    const document = trap([
      episode('e1', 'bait', [beat('n11', 'Bc3 hits the queen.')]),
      { ...episode('e2', 'quiz', [beat('n12', 'Bb4 pins it.', { pauseMs: 3000 })]), quiz }
    ]);
    const audio: Record<string, number> = { 'beat:e1:0': 1000, 'quiz:e2': 800, 'beat:e2:0': 900 };

    const segments = buildClipTimeline({ document, format: 'vertical', audioMs: (key) => audio[key], timing: TIMING }).segments.filter((segment) => segment.kind !== 'move');

    expect(segments.map((segment) => [segment.kind, segment.moveLabel, segment.caption, segment.end - segment.start, segment.pauseMs])).toEqual([
      ['beat', '6.Bc3', 'Bc3 hits t', 1010, 0],
      ['quiz', '6.Bc3', 'What does Black play?', 810 + 3000, 3000],
      ['beat', '6…Bb4', 'Bb4 pins i', 910, 0],
      ['end', null, '', 1000, 0]
    ]);
  });

  test('a beat back up the line (the safety move) cuts to it without replaying moves', () => {
    const document = trap([episode('e1', 'punish', [beat('n16', 'Mate.')]), episode('e2', 'safety', [beat('n11', 'Play Nc3 instead.')])]);
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
