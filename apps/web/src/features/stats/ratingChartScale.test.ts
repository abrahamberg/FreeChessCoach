import { describe, expect, test } from 'vitest';
import { ratingDomain, ratingTicks, xFor, xTickIndices, yForRating } from './ratingChartScale.js';

describe('ratingDomain', () => {
  test('spans the actual min/max when ratings differ', () => {
    expect(ratingDomain([1500, 1200, 1800])).toEqual([1200, 1800]);
  });

  test('falls back to a centered window when every rating is equal', () => {
    expect(ratingDomain([1500, 1500])).toEqual([1400, 1600]);
  });
});

describe('ratingTicks', () => {
  test('produces round-number ticks that fully contain the domain', () => {
    const ticks = ratingTicks(1210, 1790);
    expect(ticks[0]).toBeLessThanOrEqual(1210);
    expect(ticks.at(-1)).toBeGreaterThanOrEqual(1790);
    for (const tick of ticks) expect(tick % 50).toBe(0);
  });

  test('never divides by zero for a zero-span domain', () => {
    expect(() => ratingTicks(1500, 1500)).not.toThrow();
  });
});

describe('xFor', () => {
  test('spreads points evenly across the plot width, first and last at the edges', () => {
    expect(xFor(0, 3)).toBeLessThan(xFor(1, 3));
    expect(xFor(1, 3)).toBeLessThan(xFor(2, 3));
  });

  test('centers a single point', () => {
    expect(xFor(0, 1)).toBeCloseTo(xFor(0, 1));
  });
});

describe('yForRating', () => {
  test('higher ratings plot higher on screen (smaller y)', () => {
    expect(yForRating(1800, 1200, 1800)).toBeLessThan(yForRating(1200, 1200, 1800));
  });
});

describe('xTickIndices', () => {
  test('returns every index when there are fewer points than the cap', () => {
    expect(xTickIndices(4, 6)).toEqual([0, 1, 2, 3]);
  });

  test('caps and spreads evenly, always including the first and last point', () => {
    const indices = xTickIndices(50, 6);
    expect(indices.length).toBeLessThanOrEqual(6);
    expect(indices[0]).toBe(0);
    expect(indices.at(-1)).toBe(49);
  });
});
