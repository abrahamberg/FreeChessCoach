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
    chapters: [], diagnosisCodes: [],
    episodes,
    takeaways: [],
    hookOptions: [],
    clipLinks: {}
  };
}

const TIMING = { moveMs: 100, fastMoveMs: 40, slowHoldMs: 250, gapMs: 10, landMs: 0, mateMs: 0, silentBeatMs: 500, endCardMs: 1000, quizPauseMs: 3000, chapterMs: 2000, backMs: 100 };

describe('buildVideoTimeline (§13.4)', () => {
  // The owner's note on the Stafford film (2026-10-11): a pause where things
  // land, and the mated king shown.
  test('a line on a capture or a check is held longer, a mate longest, and the checked king is on the segment', () => {
    const document = trap([episode('e1', 'punish', [clip('n8', 'Check.'), clip('n10', 'Takes.'), clip('n11', 'Quiet.'), clip('n16', 'Mate.')])]);
    const timeline = buildVideoTimeline({ document, audioMs: () => 1000, timing: { ...TIMING, landMs: 300, mateMs: 900 } });
    const beats = timeline.segments.filter((segment) => segment.kind === 'beat');
    expect(beats.map((segment) => [segment.moveLabel, segment.end - segment.start, segment.king ?? null])).toEqual([
      ['4…Qb4+', 1310, { square: 'e1', mated: false, shut: [] }],
      ['5…Qxb2', 1310, null],
      ['6.Bc3', 1010, null],
      ['8…Qc1#', 1910, { square: 'e1', mated: true, shut: ['d1', 'd2'] }]
    ]);
  });

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

  // The owner (2026-10-12): the move-quality icons and the evaluation bar in the film.
  test("a board that shows a lesson move carries the engine's evaluation and the move's quality", () => {
    const document = trap([episode('e1', 'bait', [clip('n11', 'It hits the queen.')])]);
    const evals = { n10: { cp: -120, quality: 'best' as const }, n11: { cp: -380, quality: 'blunder' as const } };
    const { segments } = buildVideoTimeline({ document, audioMs: () => 500, timing: TIMING, evals });
    expect(segments.find((segment) => segment.kind === 'beat')?.rated).toEqual({ cp: -380, quality: 'blunder' });
    expect(segments.filter((segment) => segment.kind === 'move' && segment.rated).map((segment) => segment.rated?.quality)).toEqual(['best']);
    // Without the course's evaluations, neither is drawn.
    expect(buildVideoTimeline({ document, audioMs: () => 500, timing: TIMING }).segments.every((segment) => !segment.rated)).toBe(true);
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
    const quiz = { answerNodeId: 'n12', scene: '', prompt: 'What does Black play?', hint: '', reveal: '' };
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

  // The owner (2026-10-18): a pale arrow on each move as it is played.
  test('a board whose move was just played from the board before is marked played; a held board, a take-back or a cut is not', () => {
    const bait: CoursePly = { ...clip('n12', 'Bb4 pins it.'), tempting: [{ san: 'Qxc3+', why: 'The queen takes with check.', refutation: ['Nxc3'] }] };
    const document = trap([episode('e1', 'quiz', [bait]), episode('e2', 'safety', [clip('n11', 'Play Nc3 instead.')])], 'tactics');
    const segments = buildVideoTimeline({ document, audioMs: () => 1000, timing: TIMING }).segments;
    const from = segments.findIndex((segment) => segment.kind === 'tempting');
    // The film opens on 1.d4 already played: no board came before it.
    expect(segments.slice(0, 2).map((segment) => [segment.moveLabel, segment.played ?? false])).toEqual([['1.d4', false], ['1…e5', true]]);
    expect(segments.slice(from).map((segment) => [segment.kind, segment.moveLabel, segment.played ?? false])).toEqual([
      ['tempting', '6…Qxc3+', false],
      ['move', '6…Qxc3+', true],
      ['move', '7.Nxc3', true],
      ['move', '6.Bc3', false],
      ['beat', '6…Bb4', true],
      // The safety move is a cut back up the line.
      ['beat', '6.Bc3', false],
      ['end', null, false]
    ]);
  });

  test('a clip move back up the line (the safety move) cuts to it without replaying moves', () => {
    const document = trap([episode('e1', 'punish', [clip('n16', 'Mate.')]), episode('e2', 'safety', [clip('n11', 'Play Nc3 instead.')])]);
    const timeline = buildVideoTimeline({ document, audioMs: () => 1000, timing: TIMING });
    const kinds = timeline.segments.map((segment) => segment.kind);
    expect(kinds.slice(-3)).toEqual(['beat', 'beat', 'end']);
    expect(timeline.segments.at(-2)?.moveLabel).toBe('6.Bc3');
  });

  test("the trap's safe line: the board goes back before the bait and plays the line over the coach's words", () => {
    const safety: CoursePly = { ...clip('n11', 'Nc3 holds, then Bb4 Rb1.'), playOut: ['Nc3', 'Bb4', 'Rb1'] };
    const document = trap([episode('e1', 'punish', [clip('n16', 'Mate.')]), episode('e2', 'safety', [safety])]);
    const timeline = buildVideoTimeline({ document, audioMs: () => 2000, timing: TIMING });
    const from = timeline.segments.findIndex((segment) => segment.audioKey === 'clip:e2:n11');

    expect(timeline.segments.slice(from, from + 4).map((segment) => [segment.moveLabel, segment.end - segment.start, segment.audioKey])).toEqual([
      ['5…Qxb2', 503, 'clip:e2:n11'],
      ['6.Nc3', 503, null],
      ['6…Bb4', 503, null],
      ['7.Rb1', 503, null]
    ]);
    expect(timeline.segments[from + 4]?.kind).toBe('end');
    // The engine's best line from there: the evaluation before it holds on every move.
    const rated = buildVideoTimeline({ document, audioMs: () => 2000, timing: TIMING, evals: { n10: { cp: -120, quality: 'good' } } }).segments.slice(from, from + 4);
    expect(rated.map((segment) => segment.rated)).toEqual([{ cp: -120, quality: 'good' }, ...Array.from({ length: 3 }, () => ({ cp: -120, quality: 'best' }))]);
  });

  test('a line lights the squares and legal moves it names, timed from its audio', () => {
    const document = trap([episode('e1', 'punish', [clip('n15', 'Qc1# comes: c1 is bare.')])]);
    const beat = buildVideoTimeline({ document, audioMs: () => 2300, timing: TIMING }).segments.find((segment) => segment.kind === 'beat');
    expect(beat?.marks).toEqual([{ atMs: 0, from: 'b2', to: 'c1' }, { atMs: 1200, from: 'c1', to: 'c1' }]);
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
      ['chapter', 'The setup', 'whoosh', 'chapter:c1'],
      ['chapter', 'The bait', 'whoosh', 'chapter:c2'],
      ['outro', 'Would you take the pawn?', null, 'video:outro']
    ]);
    expect(timeline.segments.at(-1)?.kind).toBe('end');
  });

  test('a chapter card stays until its name has been read', () => {
    const document = trap([episode('e1', 'setup', [clip('n2', 'The gambit.')])]);
    document.chapters = [{ id: 'c1', title: 'The setup', lineId: 'l1', episodeIds: ['e1'] }];
    const card = (ms: number) => buildVideoTimeline({ document, audioMs: (key) => (key === 'chapter:c1' ? ms : 1000), timing: TIMING }).segments.find((segment) => segment.kind === 'chapter');
    expect(card(5000)).toMatchObject({ audioKey: 'chapter:c1', end: 5010 });
    expect(card(500)).toMatchObject({ end: 2000 });
  });

  // The owner (2026-10-18): the whoosh came over the coach reading the name.
  test('with sounds, the chapter card whooshes first, then the name is read; the card stays for both', () => {
    const document = trap([episode('e1', 'setup', [clip('n2', 'The gambit.')])]);
    document.chapters = [{ id: 'c1', title: 'The setup', lineId: 'l1', episodeIds: ['e1'] }];
    const card = (ms: number) => buildVideoTimeline({ document, audioMs: (key) => (key === 'chapter:c1' ? ms : 1000), timing: TIMING, sounds: { evals: {}, lengthMs: () => 450 } }).segments.find((segment) => segment.kind === 'chapter');
    expect(card(5000)).toMatchObject({ sound: 'whoosh', audioKey: 'chapter:c1', audioOffsetMs: 450, end: 450 + 5010 });
    expect(card(1600)).toMatchObject({ audioOffsetMs: 450, end: 2060 });
    expect(card(500)).toMatchObject({ end: 2000 });
  });

  // The owner (2026-10-18): Vesper waves her wand where the others whoosh.
  test("a coach with a cut sound of their own has it in place of the whoosh", () => {
    const document = trap([episode('e1', 'hook', []), episode('e2', 'setup', [clip('n2', 'The gambit.')])]);
    document.chapters = [{ id: 'c1', title: 'The setup', lineId: 'l1', episodeIds: ['e2'] }];
    const cuts = () => buildVideoTimeline({ document, audioMs: () => 1000, timing: TIMING, sounds: { evals: {}, lengthMs: () => 450 } }).segments.filter((segment) => segment.kind === 'chapter').map((segment) => segment.sound);
    expect(cuts()).toEqual(['whoosh']);
    document.coachPersona = 'witch';
    expect(cuts()).toEqual(['wand']);
  });

  test("with sounds, the safe line's whoosh plays before the coach starts it", () => {
    const safety: CoursePly = { ...clip('n11', 'Nc3 holds, then Bb4 Rb1.'), playOut: ['Nc3', 'Bb4', 'Rb1'] };
    const document = trap([episode('e1', 'punish', [clip('n16', 'Mate.')]), episode('e2', 'safety', [safety])]);
    const segments = buildVideoTimeline({ document, audioMs: () => 2000, timing: TIMING, sounds: { evals: {}, lengthMs: () => 450 } }).segments;
    const beat = segments.find((segment) => segment.audioKey === 'clip:e2:n11');
    expect(beat).toMatchObject({ sound: 'whoosh', audioOffsetMs: 450 });
    expect(beat!.end - beat!.start).toBe(450 + 503);
  });

  // The owner (2026-10-12): a long line said before anything moved was hard to follow.
  test('a tempting move is shown, then played out with the engine’s answer while the coach explains it, and taken back before the real move', () => {
    const bait: CoursePly = { ...clip('n12', 'Bb4 pins it.'), tempting: [{ san: 'Qxc3+', why: 'The queen takes with check, and loses the win.', refutation: ['Nxc3'] }] };
    const document = trap([episode('e1', 'quiz', [bait])], 'tactics');
    const audio: Record<string, number> = { 'tempting:e1:n12:0': 1500, 'clip:e1:n12': 900 };
    const segments = buildVideoTimeline({ document, audioMs: (key) => audio[key], timing: TIMING, sounds: { evals: {}, lengthMs: () => 0 } }).segments;
    const from = segments.findIndex((segment) => segment.kind === 'tempting');

    expect(segments.slice(from, from + 5).map((segment) => [segment.kind, segment.moveLabel, segment.caption, segment.audioKey, segment.sound, segment.end - segment.start])).toEqual([
      // One sentence, two moves: the line's 1510 ms in three even parts.
      ['tempting', '6…Qxc3+', 'Qxc3+?', 'tempting:e1:n12:0', null, 504],
      ['move', '6…Qxc3+', 'Qxc3+?', null, 'bad', 503],
      ['move', '7.Nxc3', '', null, 'capture', 503],
      ['move', '6.Bc3', '', null, null, 100],
      ['beat', '6…Bb4', 'Bb4 pins i', 'clip:e1:n12', 'move', 910]
    ]);
    expect(segments[from]?.arrows).toEqual([{ from: 'b2', to: 'c3', kind: 'threat' }]);
    // The owner (2026-10-12): the played-out moves had no badge and an empty bar.
    const evals = { n11: { cp: -900, quality: 'blunder' as const }, 'tempting:n12:Qxc3+': { cp: 150, quality: 'blunder' as const } };
    const rated = buildVideoTimeline({ document, audioMs: (key) => audio[key], timing: TIMING, evals }).segments.slice(from, from + 4);
    expect(rated.map((segment) => segment.rated)).toEqual([{ cp: -900, quality: 'blunder' }, { cp: 150, quality: 'blunder' }, { cp: 150, quality: 'best' }, { cp: -900, quality: 'blunder' }]);
  });

  test('the arrow stays for the opening question, and the moves share the rest of the line', () => {
    const why = 'What if the queen takes with check? The knight takes back, and the win is gone for good.';
    const bait: CoursePly = { ...clip('n12', 'Bb4 pins it.'), tempting: [{ san: 'Qxc3+', why, refutation: ['Nxc3'] }] };
    const document = trap([episode('e1', 'quiz', [bait])], 'tactics');
    const segments = buildVideoTimeline({ document, audioMs: (key) => (key.startsWith('tempting') ? 8990 : 900), timing: TIMING }).segments;
    const from = segments.findIndex((segment) => segment.kind === 'tempting');
    // 7 of the 18 words are the question: 3500 of the 9000 ms.
    expect(segments.slice(from, from + 3).map((segment) => segment.end - segment.start)).toEqual([3500, 2750, 2750]);
  });
});

// The owner's note on the second Stafford film (2026-10-11): the main line
// first, then the side lines; the learner's own other moves not at all.
describe("a trap's film runs its line without a detour", () => {
  test("the opponent's tempting moves play after the line, before the safety episode; the learner's are the course's", () => {
    const bait: CoursePly = { ...clip('n11', 'The bishop blocks.'), tempting: [{ san: 'Nc3', why: 'What if the knight blocks instead?', refutation: ['Bb4'] }] };
    const answer: CoursePly = { ...clip('n12', 'Pin it.'), tempting: [{ san: 'Qxc3+', why: 'Taking loses the win.', refutation: ['Nxc3'] }] };
    const document = trap([episode('e1', 'bait', [bait]), episode('e2', 'punish', [answer, clip('n16', 'Mate.')]), episode('e3', 'safety', [clip('n11', 'Stay safe.')])]);
    const segments = buildVideoTimeline({ document, audioMs: () => 500, timing: TIMING }).segments;
    const told = segments.filter((segment) => segment.audioKey).map((segment) => segment.audioKey);
    expect(told).toEqual(['clip:e1:n11', 'clip:e2:n12', 'clip:e2:n16', 'tempting:e1:n11:0', 'clip:e3:n11']);
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

describe('the quiz moment: scene, question, countdown, answer', () => {
  const quizDocument = (scene: string): CourseDocument =>
    trap([episode('e1', 'bait', [clip('n11', 'Bc3 hits the queen.')]), { ...episode('e2', 'quiz', [clip('n12', 'Bb4 pins it.')]), quiz: { answerNodeId: 'n12', scene, prompt: 'What does Black play?', hint: '', reveal: '' } }]);
  const audio: Record<string, number> = { 'clip:e1:n11': 1000, 'quiz-scene:e2': 700, quiz: 0, 'quiz:e2': 800, 'clip:e2:n12': 900 };
  const kinds = (document: CourseDocument): string[][] =>
    buildVideoTimeline({ document, audioMs: (key) => audio[key], timing: TIMING }).segments.filter((segment) => segment.kind !== 'move').map((segment) => [segment.kind, segment.audioKey ?? '', String(segment.end - segment.start)]);

  test('the scene is said over the position before the answer, then the question with its countdown, then the answer', () => {
    expect(kinds(quizDocument('Black is a pawn down but ahead in development.'))).toEqual([
      ['beat', 'clip:e1:n11', '1010'],
      ['beat', 'quiz-scene:e2', '710'],
      ['quiz', 'quiz:e2', '3810'],
      ['beat', 'clip:e2:n12', '910'],
      ['end', '', '1000']
    ]);
  });

  test('a quiz with no scene has no scene segment', () => {
    expect(kinds(quizDocument('')).map(([kind]) => kind)).toEqual(['beat', 'quiz', 'beat', 'end']);
  });
});

describe('the creator’s pace marks', () => {
  const plain = parseCourseTree('1. d4 e5 2. dxe5 Nc6 3. Nf3 Qe7 4. Bf4 *');
  const total = (marked: typeof plain): number =>
    buildVideoTimeline({ document: { ...trap([episode('e1', 'line', [clip('n7', 'Fine.')])]), nodes: marked.nodes, lines: marked.lines }, audioMs: () => undefined, timing: TIMING }).durationMs;

  test('a move marked @fast plays quicker, by moveMs - fastMoveMs', () => {
    const fast = parseCourseTree('1. d4 @fast e5 2. dxe5 Nc6 3. Nf3 Qe7 4. Bf4 *');

    expect(total(plain) - total(fast)).toBe(TIMING.moveMs - TIMING.fastMoveMs);
  });

  test('a move marked @slow is held for slowHoldMs more', () => {
    const slow = parseCourseTree('1. d4 @slow e5 2. dxe5 Nc6 3. Nf3 Qe7 4. Bf4 *');

    expect(total(slow) - total(plain)).toBe(TIMING.slowHoldMs);
  });
});
