import type { EngineEval } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { buildMoveMetrics, buildWinPctSeries, computeMoveDrop } from './move-metrics.js';
import { moveAccuracy } from './accuracy-curve.js';
import { winPctFor, winPctWhite } from './win-probability.js';

function evalAt(ply: number, cp: number | null, mateIn: number | null = null): EngineEval {
  return {
    ply,
    fen: `position-${ply}`,
    depth: 18,
    lines: [{ moveUci: 'a1a2', moveSan: 'Ka2', cp, mateIn }]
  };
}

describe('buildWinPctSeries', () => {
  test('uses each position evaluation rather than a previous position PV evaluation', () => {
    const evals = [evalAt(0, 100), evalAt(1, -250), evalAt(2, 300)];

    expect(buildWinPctSeries(evals)).toEqual([winPctWhite(100), winPctWhite(-250), winPctWhite(300)]);
  });

  test('folds mate scores and treats terminal positions without lines as zero', () => {
    const evals = [evalAt(0, null, 1), { ...evalAt(1, 0), lines: [] }];

    expect(buildWinPctSeries(evals)).toEqual([winPctWhite(1990), winPctWhite(0)]);
  });
});

describe('computeMoveDrop', () => {
  test('measures a White win-percentage loss for White', () => {
    expect(computeMoveDrop(60, 52, 'white')).toBe(8);
  });

  test('mirrors the White win-percentage change for Black', () => {
    expect(computeMoveDrop(52, 60, 'black')).toBe(8);
  });

  test('clamps an improvement to zero', () => {
    expect(computeMoveDrop(52, 60, 'white')).toBe(0);
    expect(computeMoveDrop(60, 52, 'black')).toBe(0);
  });
});

describe('buildMoveMetrics', () => {
  test('assembles one metric per played ply in mover perspective', () => {
    const evals = [evalAt(0, 100), evalAt(1, 50), evalAt(2, 150)];
    const whiteBefore = winPctWhite(100);
    const whiteAfter = winPctWhite(50);
    const blackBefore = winPctWhite(50);
    const blackAfter = winPctWhite(150);

    expect(buildMoveMetrics(evals, ['white', 'black'])).toEqual([
      {
        ply: 1,
        cpBeforeWhite: 100,
        cpAfterWhite: 50,
        winPctBefore: winPctFor('white', 100),
        winPctAfter: winPctFor('white', 50),
        drop: whiteBefore - whiteAfter,
        accuracy: moveAccuracy(whiteBefore - whiteAfter)
      },
      {
        ply: 2,
        cpBeforeWhite: 50,
        cpAfterWhite: 150,
        winPctBefore: winPctFor('black', 50),
        winPctAfter: winPctFor('black', 150),
        drop: blackAfter - blackBefore,
        accuracy: moveAccuracy(blackAfter - blackBefore)
      }
    ]);
  });
});
