import { describe, expect, test } from 'vitest';
import { moveAccuracy } from './accuracy-curve.js';

describe('moveAccuracy', () => {
  test.each([
    [0, 100.00],
    [1, 95.60],
    [2, 91.40],
    [5, 79.82],
    [10, 63.58],
    [15, 50.52],
    [20, 40.02],
    [30, 24.78],
    [50, 8.53],
    [70, 1.73]
  ])('maps a %d-point drop to %s accuracy', (drop, expected) => {
    expect(Number(moveAccuracy(drop).toFixed(2))).toBe(expected);
  });

  test('clamps accuracy to 100 for a negative drop', () => {
    expect(moveAccuracy(-1)).toBe(100);
  });

  test('clamps accuracy to 0 when the curve falls below zero', () => {
    expect(moveAccuracy(200)).toBe(0);
  });
});
