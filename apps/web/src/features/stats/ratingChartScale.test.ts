import { describe, expect, test } from 'vitest';
import { CHART_MARGIN, PLOT_WIDTH, ratingDomain, ratingTicks, xForTime, xTickTimes, yForRating } from './ratingChartScale.js';

const DAY = 24 * 60 * 60 * 1000;

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

describe('xForTime', () => {
  test('puts the first and last game at the plot edges', () => {
    expect(xForTime(0, 0, 10 * DAY)).toBe(CHART_MARGIN.left);
    expect(xForTime(10 * DAY, 0, 10 * DAY)).toBe(CHART_MARGIN.left + PLOT_WIDTH);
  });

  test('spaces games by when they were played, not by how many there were', () => {
    // Ninety games crammed into the first day, then one a year later: the
    // crowd stays at the left instead of being stretched across the chart.
    const crowded = xForTime(0.5 * DAY, 0, 365 * DAY);
    expect(crowded).toBeLessThan(CHART_MARGIN.left + PLOT_WIDTH * 0.01);
    expect(xForTime(182.5 * DAY, 0, 365 * DAY)).toBeCloseTo(CHART_MARGIN.left + PLOT_WIDTH / 2);
  });

  test('centers a lone game, or several played at the same instant', () => {
    expect(xForTime(5 * DAY, 5 * DAY, 5 * DAY)).toBe(CHART_MARGIN.left + PLOT_WIDTH / 2);
  });
});

describe('yForRating', () => {
  test('higher ratings plot higher on screen (smaller y)', () => {
    expect(yForRating(1800, 1200, 1800)).toBeLessThan(yForRating(1200, 1200, 1800));
  });
});

describe('xTickTimes', () => {
  test('spreads at most the cap of labels evenly, always including the first and last time', () => {
    const ticks = xTickTimes(0, 100 * DAY, 6);
    expect(ticks).toHaveLength(6);
    expect(ticks[0]).toBe(0);
    expect(ticks.at(-1)).toBe(100 * DAY);
    expect(ticks[1]! - ticks[0]!).toBeCloseTo(ticks[2]! - ticks[1]!);
  });

  test('gives a single label when everything happened within one day', () => {
    expect(xTickTimes(0, DAY / 2, 6)).toEqual([0]);
  });
});
