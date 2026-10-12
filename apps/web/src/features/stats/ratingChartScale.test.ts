import { describe, expect, it } from 'vitest';
import { dailyAverages } from './ratingChartScale.js';

describe('dailyAverages', () => {
  it('averages the games of one day and keeps days apart, oldest first', () => {
    const at = (day: number, hour: number) => new Date(2026, 5, day, hour).toISOString();
    const result = dailyAverages([
      { playedAt: at(3, 20), estimatedRating: 900 },
      { playedAt: at(2, 9), estimatedRating: 800 },
      { playedAt: at(3, 8), estimatedRating: 1000 }
    ]);
    expect(result.map((day) => day.rating)).toEqual([800, 950]);
    expect(result[1]!.time).toBe((new Date(at(3, 20)).getTime() + new Date(at(3, 8)).getTime()) / 2);
  });
});
