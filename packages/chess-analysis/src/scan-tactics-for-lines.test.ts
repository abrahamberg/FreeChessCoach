import type { EngineLine } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { scanTacticsForLines } from './scan-tactics-for-lines.js';

const FORK_FEN = '4k3/1r6/8/8/2N5/8/8/K7 w - - 0 1';
const LINES: EngineLine[] = [
  { moveUci: 'a1b2', moveSan: 'Kb2', cp: 400, mateIn: null },
  { moveUci: 'c4d6', moveSan: 'Nd6+', cp: 500, mateIn: null },
  { moveUci: 'a1b1', moveSan: 'Kb1', cp: 300, mateIn: null }
];

describe('scanTacticsForLines', () => {
  test('classifies each of the top-N lines, keeping only the ones with a motif', () => {
    const sightings = scanTacticsForLines(FORK_FEN, LINES, 'white', 3);

    expect(sightings).toEqual([{ moveSan: 'Nd6+', motif: 'fork', rank: 1 }]);
  });

  test('a smaller topN excludes lines beyond it', () => {
    const sightings = scanTacticsForLines(FORK_FEN, LINES, 'white', 1);

    expect(sightings).toEqual([]);
  });

  test('defaults topN to CONFIG.tacticScan.defaultTopN when omitted', () => {
    const sightings = scanTacticsForLines(FORK_FEN, LINES, 'white');

    expect(sightings).toEqual([{ moveSan: 'Nd6+', motif: 'fork', rank: 1 }]);
  });
});
