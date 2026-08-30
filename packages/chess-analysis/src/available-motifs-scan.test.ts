import type { EngineLine } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { scanAvailableMotifs } from './available-motifs-scan.js';
import { scanTacticsForLines } from './scan-tactics-for-lines.js';

// Same fork setup as pv-tactics.test.ts: white knight f4-d5 forks the black
// rook on b6 and knight on f6.
const FORK_SETUP_FEN = '4k3/8/1r3n2/8/5N2/8/8/7K w - - 0 1';
// A ply-3 fork: Kh2 (ply1, quiet) / Ke7 (ply2, opponent reply) / Nd5 (ply3,
// the fork) — neither king move disturbs the rook/knight/knight fork setup.
const FORK_IN_3_PV = ['Kh2', 'Ke7', 'Nd5'];

// Mirror of FORK_SETUP_FEN (rank-flipped, colors swapped), white to move:
// black knight f5 forks white rook b3 and white knight f3 on its reply
// (ply 2) after a quiet white king move (ply 1) — used to prove an
// even-ply-only motif is never credited.
const EVEN_PLY_FORK_FEN = '7k/8/8/5n2/8/1R3N2/8/4K3 w - - 0 1';

function quietLine(moveUci: string, moveSan: string): EngineLine {
  return { moveUci, moveSan, cp: 0, mateIn: null };
}

describe('scanAvailableMotifs', () => {
  test('parity with scanTacticsForLines when every line has a single-element (or absent) pvSan', () => {
    const lines: EngineLine[] = [{ moveUci: 'f4d5', moveSan: 'Nd5', cp: 500, mateIn: null }];

    const scan = scanAvailableMotifs(FORK_SETUP_FEN, lines);
    const legacy = scanTacticsForLines(FORK_SETUP_FEN, lines, 'white');

    expect(scan.sightings).toEqual(legacy.map((sighting) => ({ ...sighting, ply: 1 })));
    expect([...scan.motifs]).toEqual(['fork']);
  });

  test('a synthetic fork-at-ply-3 fixture is picked up for a rank whose schedule depth is >=3', () => {
    const lines: EngineLine[] = [{ moveUci: 'h1h2', moveSan: 'Kh2', cp: 0, mateIn: null, pvSan: FORK_IN_3_PV }];

    // rank 0 (multiPv default 5) -> schedule depth 7, comfortably reaches ply 3.
    const scan = scanAvailableMotifs(FORK_SETUP_FEN, lines);

    expect(scan.sightings).toEqual([{ rank: 0, ply: 3, moveSan: 'Nd5+', motif: 'fork' }]);
    expect([...scan.motifs]).toEqual(['fork']);
  });

  test('the same fork-at-ply-3 fixture is missed when it sits at a lower rank capped at depth 1', () => {
    const lines: EngineLine[] = [
      quietLine('h1g1', 'Kg1'),
      quietLine('h1g2', 'Kg2'),
      quietLine('h1h2', 'Kh2'),
      quietLine('h1g1', 'Kg1'),
      { moveUci: 'h1h2', moveSan: 'Kh2', cp: 0, mateIn: null, pvSan: FORK_IN_3_PV }
    ];

    // rank 4 (multiPv default 5) -> schedule depth 1, only ply 1 (Kh2) is walked.
    const scan = scanAvailableMotifs(FORK_SETUP_FEN, lines);

    expect(scan.sightings).toEqual([]);
    expect(scan.motifs.size).toBe(0);
  });

  test('an even-ply motif (the opponent\'s own hypothetical reply) is never included', () => {
    const lines: EngineLine[] = [{ moveUci: 'e1d2', moveSan: 'Kd2', cp: 0, mateIn: null, pvSan: ['Kd2', 'Nd4'] }];

    const scan = scanAvailableMotifs(EVEN_PLY_FORK_FEN, lines);

    expect(scan.motifs.has('fork')).toBe(false);
    expect(scan.sightings.some((s) => s.ply % 2 === 0)).toBe(false);
  });

  test('empty lines does not throw and returns an empty scan', () => {
    const scan = scanAvailableMotifs(FORK_SETUP_FEN, []);

    expect(scan.sightings).toEqual([]);
    expect(scan.motifs.size).toBe(0);
  });

  test('a line with an empty pvSan array falls back to its own moveSan, not a crash', () => {
    const lines: EngineLine[] = [{ moveUci: 'f4d5', moveSan: 'Nd5', cp: 500, mateIn: null, pvSan: [] }];

    const scan = scanAvailableMotifs(FORK_SETUP_FEN, lines);

    expect([...scan.motifs]).toEqual(['fork']);
  });
});
