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
const TIMING = { ...REEL_TIMING, minMs: 0 };
const summary = (document: CourseDocument, timing = TIMING) =>
  buildReelTimeline({ document, audioMs: (key) => audio[key], timing, sounds: { evals: {}, lengthMs: () => 100 } }).segments.map((segment) => [segment.kind, segment.moveLabel, segment.caption, segment.sound, segment.end - segment.start]);

describe('buildReelTimeline (§13.3)', () => {
  test('the hook on the first position, the build-up fast, silence, the climax slowed with the payoff, the call to action, the loop', () => {
    expect(summary(withReel({}))).toEqual([
      ['beat', null, '', null, 2250],
      ['move', '7.Qd2', '', 'opponent', 500],
      ['beat', '7…Bxc3', 'The pin', 'capture', 100 + 1250],
      ['move', '8.Qxc3', '', 'capture', 500],
      ['silence', '8.Qxc3', '', null, 500],
      ['move', '8…Qc1#', 'Mate in eight', 'check', 500 + 1400],
      ['cta', null, 'Follow for a trap a day.', null, 1750],
      ['beat', null, '', null, 1450]
    ]);
    const timeline = buildReelTimeline({ document: withReel({}), audioMs: (key) => audio[key], timing: TIMING });
    expect(timeline).toMatchObject({ product: 'reel', format: 'vertical', topText: 'Black to play' });
  });

  test('a puzzle counts down over the riser; a promo stops on the moment before the climax', () => {
    expect(summary(withReel({ style: 'puzzle' }))[1]).toEqual(['quiz', null, '', 'riser', 5000]);
    const promo = summary(withReel({ style: 'promo' }));
    expect(promo.map((segment) => segment[0])).toEqual(['beat', 'move', 'beat', 'move', 'silence', 'cta', 'beat']);
  });

  test('under 30 s, code holds the climax longer, never the build-up', () => {
    const timeline = buildReelTimeline({ document: withReel({}), audioMs: (key) => audio[key], sounds: null });
    expect(timeline.durationMs).toBe(REEL_TIMING.minMs);
    const climax = timeline.segments.find((segment) => segment.moveLabel === '8…Qc1#' && segment.kind === 'move');
    expect(climax!.end - climax!.start).toBeGreaterThan(REEL_TIMING.moveMs + REEL_TIMING.climaxMs);
    expect(timeline.segments.find((segment) => segment.moveLabel === '7.Qd2')!.end - timeline.segments.find((segment) => segment.moveLabel === '7.Qd2')!.start).toBe(REEL_TIMING.moveMs);
  });
});
