import { parseCourseTree } from '@freechesscoach/chess-analysis';
import { describe, expect, test } from 'vitest';
import { markAlpha, MARK_MS, speechMarks } from './speech-marks.js';

// After 8.Qxc3 in the Englund: Black to play Qc1#.
const tree = parseCourseTree('1. d4 e5 2. dxe5 Nc6 3. Nf3 Qe7 4. Bf4 Qb4+ 5. Bd2 Qxb2 6. Bc3 Bb4 7. Qd2 Bxc3 8. Qxc3 Qc1# *');
const FEN = tree.nodes.find((node) => node.id === 'n15')?.fenAfter ?? '';

describe('speechMarks (§13.4)', () => {
  test('named squares light up and a legal named move gets an arrow, each at its place in the line', () => {
    const line = 'Qc1# is mate: the queen covers d1 and d2.';
    expect(speechMarks(line, FEN, 4100)).toEqual([
      { atMs: 0, from: 'b2', to: 'c1' },
      { atMs: Math.round((line.indexOf('d1') / line.length) * 4100), from: 'd1', to: 'd1' },
      { atMs: Math.round((line.indexOf('d2') / line.length) * 4100), from: 'd2', to: 'd2' }
    ]);
  });

  test('a move not legal on the board shown gets nothing; each square once; a silent line none', () => {
    expect(speechMarks('Bb4 pinned it. Nc3 was safer.', FEN, 1000)).toEqual([]);
    expect(speechMarks('c1, then c1 again.', FEN, 1000)).toHaveLength(1);
    expect(speechMarks('c1', FEN, 0)).toEqual([]);
  });

  test('a mark fades in, holds and fades out', () => {
    const mark = { atMs: 1000, from: 'c1', to: 'c1' };
    expect([markAlpha(mark, 999), markAlpha(mark, 1100), markAlpha(mark, 1500), markAlpha(mark, 1000 + MARK_MS)]).toEqual([0, 0.5, 1, 0]);
  });
});
