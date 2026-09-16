import { describe, expect, test } from 'vitest';
import { interpolateAnchors } from './interpolate.js';

const linear = (yLower: number, yUpper: number, t: number): number => yLower + t * (yUpper - yLower);

describe('interpolateAnchors', () => {
  const anchors: ReadonlyArray<readonly [number, number]> = [
    [0, 0],
    [10, 100],
    [20, 120]
  ];

  test('returns the exact anchor value at an anchor x', () => {
    expect(interpolateAnchors(anchors, 0, linear)).toBe(0);
    expect(interpolateAnchors(anchors, 10, linear)).toBe(100);
    expect(interpolateAnchors(anchors, 20, linear)).toBe(120);
  });

  test('interpolates between the bracketing anchors', () => {
    expect(interpolateAnchors(anchors, 5, linear)).toBe(50);
    expect(interpolateAnchors(anchors, 15, linear)).toBe(110);
  });

  test('clamps below the first anchor and above the last instead of extrapolating', () => {
    expect(interpolateAnchors(anchors, -100, linear)).toBe(0);
    expect(interpolateAnchors(anchors, 9999, linear)).toBe(120);
  });

  test('uses the caller-supplied lerp, not a hardcoded linear blend', () => {
    const midpointOnly = (yLower: number, yUpper: number): number => (yLower + yUpper) / 2;
    expect(interpolateAnchors(anchors, 5, midpointOnly)).toBe(50);
    expect(interpolateAnchors(anchors, 1, midpointOnly)).toBe(50);
  });

  test('throws on an empty anchor list', () => {
    expect(() => interpolateAnchors([], 5, linear)).toThrow(/non-empty/);
  });
});
