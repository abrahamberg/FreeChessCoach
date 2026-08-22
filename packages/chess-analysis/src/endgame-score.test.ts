import { describe, expect, test } from 'vitest';
import { conversionScore, endgameScore } from './endgame-score.js';

describe('conversionScore', () => {
  test('winning (>=75): converting scores 100, drawing 40, losing 0', () => {
    expect(conversionScore(80, 'win')).toBe(100);
    expect(conversionScore(80, 'draw')).toBe(40);
    expect(conversionScore(80, 'loss')).toBe(0);
  });

  test('roughly equal (45-75): winning scores 100, drawing 75, losing 35', () => {
    expect(conversionScore(60, 'win')).toBe(100);
    expect(conversionScore(60, 'draw')).toBe(75);
    expect(conversionScore(60, 'loss')).toBe(35);
  });

  test('worse (<45): winning scores 100, drawing 90, losing 60', () => {
    expect(conversionScore(20, 'win')).toBe(100);
    expect(conversionScore(20, 'draw')).toBe(90);
    expect(conversionScore(20, 'loss')).toBe(60);
  });

  test('bucket boundaries are inclusive on the lower edge', () => {
    expect(conversionScore(75, 'draw')).toBe(40);
    expect(conversionScore(45, 'draw')).toBe(75);
  });
});

describe('endgameScore', () => {
  test('applies the 0.7/0.3 weighted sum', () => {
    // 0.7*90 + 0.3*100 (winning + converted) = 63 + 30 = 93
    expect(endgameScore(90, 80, 'win')).toBeCloseTo(93, 5);
  });

  test('returns null when the game never reached the endgame phase', () => {
    expect(endgameScore(null, null, 'win')).toBeNull();
  });

  test('returns null if only one of the two endgame-derived inputs is missing', () => {
    expect(endgameScore(null, 80, 'win')).toBeNull();
    expect(endgameScore(90, null, 'win')).toBeNull();
  });
});
