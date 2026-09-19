import { describe, expect, it } from 'vitest';
import { averageSlope, estimatedRatingOnDay, trueRatingOnDay, YEAR_DAYS } from './rating-curve.js';
import { mulberry32 } from './rng.js';

describe('trueRatingOnDay', () => {
  it('starts at 450 and ends at 2130 after a year', () => {
    expect(trueRatingOnDay(0)).toBe(450);
    expect(trueRatingOnDay(YEAR_DAYS - 1)).toBe(2130);
  });

  it('reaches 1000 fast and 1600 well after it', () => {
    expect(trueRatingOnDay(60)).toBeGreaterThanOrEqual(995);
    expect(trueRatingOnDay(60)).toBeLessThanOrEqual(1005);
    const dayOf1600 = Array.from({ length: YEAR_DAYS }, (_, day) => day).find((day) => trueRatingOnDay(day) >= 1600);
    expect(dayOf1600).toBeGreaterThan(120);
    expect(dayOf1600).toBeLessThan(200);
  });

  it('slows down at each stage: 450→1000 is faster than 1000→1600 is faster than 1600→2130', () => {
    const firstStage = averageSlope(0, 60);
    const middleStage = averageSlope(60, 158);
    const lastStage = averageSlope(158, YEAR_DAYS - 1);
    expect(firstStage).toBeGreaterThan(middleStage * 1.4);
    expect(middleStage).toBeGreaterThan(lastStage * 1.8);
  });

  it('is a believable curve, not a straight line up: it stalls and dips a little', () => {
    let runningMax = 0;
    let deepestDip = 0;
    for (let day = 0; day < YEAR_DAYS; day++) {
      const rating = trueRatingOnDay(day);
      runningMax = Math.max(runningMax, rating);
      deepestDip = Math.max(deepestDip, runningMax - rating);
    }
    expect(deepestDip).toBeGreaterThan(5);
    expect(deepestDip).toBeLessThan(45);
  });
});

describe('estimatedRatingOnDay', () => {
  it('scatters around the true rating without drifting from it', () => {
    const rng = mulberry32(7);
    const samples = Array.from({ length: 2000 }, () => estimatedRatingOnDay(rng, 200));
    const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    expect(Math.abs(mean - trueRatingOnDay(200))).toBeLessThan(10);
    expect(new Set(samples).size).toBeGreaterThan(100);
  });
});
