import { parseCourseTree } from '@freechesscoach/chess-analysis';
import type { CourseDocument, CourseReel } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { buildReelTimeline, REEL_TIMING } from './reel-timeline.js';

const tree = parseCourseTree('1. d4 e5 2. dxe5 Nc6 3. Nf3 Qe7 4. Bf4 Qb4+ 5. Bd2 Qxb2 6. Bc3 Bb4 7. Qd2 Bxc3 8. Qxc3 Qc1# *');

function withReel(reel: Partial<CourseReel>): CourseDocument {
  return {
    version: 1, kind: 'trap', title: 'Englund', promise: '', learnerSide: 'black', levelBand: 'novice', coachPersona: 'commander',
    startFen: tree.startFen, nodes: tree.nodes, lines: tree.lines, chapters: [], diagnosisCodes: [], episodes: [], takeaways: [], hookOptions: [], clipLinks: {},
    reel: {
      style: 'highlight', startNodeId: 'n13', climaxNodeId: 'n16', endNodeId: 'n16',
      hook: 'The Englund trap that mates in eight.', topText: 'Black to play', beats: [{ nodeId: 'n14', say: 'The pin pays.', caption: 'The pin' }],
      payoff: 'Mate in eight', cta: 'Follow for a trap a day.', loop: 'All from one gambit.', ...reel
    }
  };
}

const audio: Record<string, number> = { 'reel:hook': 2000, 'reel:beat:n14': 1000, 'reel:cta': 1500, 'reel:loop': 1200 };
const TIMING = { ...REEL_TIMING, landMs: 0, mateMs: 0 };
const summary = (document: CourseDocument, timing = TIMING) =>
  buildReelTimeline({ document, audioMs: (key) => audio[key], timing, sounds: { evals: {}, lengthMs: () => 100 } }).segments.map((segment) => [segment.kind, segment.moveLabel, segment.caption, segment.sound, segment.end - segment.start]);

describe('buildReelTimeline (§13.3)', () => {
  test('the hook on the first position, the build-up fast, silence, the climax slowed with the payoff, the call to action, the loop', () => {
    expect(summary(withReel({}))).toEqual([
      ['beat', null, '', null, 2500],
      ['move', '7.Qd2', '', 'opponent', 650],
      ['beat', '7…Bxc3', 'The pin', 'capture', 100 + 1500],
      ['move', '8.Qxc3', '', 'capture', 650],
      ['silence', '8.Qxc3', '', null, 500],
      ['move', '8…Qc1#', 'Mate in eight', 'check', 650 + 1400],
      ['cta', null, 'Follow for a trap a day.', null, 2000],
      ['beat', null, '', null, 1700]
    ]);
    const timeline = buildReelTimeline({ document: withReel({}), audioMs: (key) => audio[key], timing: TIMING });
    expect(timeline).toMatchObject({ product: 'reel', format: 'vertical', topText: 'Black to play' });
  });

  test('a puzzle counts down over the riser; a promo stops on the moment before the climax', () => {
    expect(summary(withReel({ style: 'puzzle' }))[1]).toEqual(['quiz', null, '', 'riser', 5000]);
    const promo = summary(withReel({ style: 'promo' }));
    expect(promo.map((segment) => segment[0])).toEqual(['beat', 'move', 'beat', 'move', 'silence', 'cta', 'beat']);
  });

  test('the climax keeps its own hold, never stretched to a length; the loop line is on the first board, so the replay has no jump', () => {
    const timeline = buildReelTimeline({ document: withReel({}), audioMs: (key) => audio[key], sounds: null });
    const climax = timeline.segments.find((segment) => segment.climax);
    expect(climax).toMatchObject({ moveLabel: '8…Qc1#' });
    expect(climax!.end - climax!.start).toBe(REEL_TIMING.moveMs + REEL_TIMING.climaxMs);
    expect(timeline.segments.at(-1)!.fen).toBe(timeline.segments[0]!.fen);
    expect(timeline.segments[0]!.words?.map((word) => word.text)).toEqual(['The', 'Englund', 'trap', 'that', 'mates', 'in', 'eight.']);
  });

  test('the build-up moves the creator marked play at their pace: @fast quicker, @slow held', () => {
    const marked = parseCourseTree('1. d4 e5 2. dxe5 Nc6 3. Nf3 Qe7 4. Bf4 Qb4+ 5. Bd2 Qxb2 6. Bc3 Bb4 7. Qd2 @fast Bxc3 8. Qxc3 @slow Qc1# *');
    const lengths = (nodes: typeof tree.nodes) => buildReelTimeline({ document: { ...withReel({ beats: [] }), nodes }, audioMs: () => undefined, timing: TIMING }).segments;
    const base = lengths(tree.nodes).find((segment) => segment.moveLabel === '7.Qd2');
    const fast = lengths(marked.nodes).find((segment) => segment.moveLabel === '7.Qd2');
    const slow = lengths(marked.nodes).find((segment) => segment.moveLabel === '8.Qxc3');

    expect(base!.end - base!.start).toBe(TIMING.moveMs);
    expect(fast!.end - fast!.start).toBe(TIMING.fastMoveMs);
    expect(slow!.end - slow!.start).toBe(TIMING.moveMs + TIMING.slowHoldMs);
  });
});
