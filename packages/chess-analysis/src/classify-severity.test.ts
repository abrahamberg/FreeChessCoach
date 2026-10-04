import { describe, expect, test } from 'vitest';
import { classifySeverity } from './classify-severity.js';

describe('classifySeverity', () => {
  test('uses the report drop thresholds', () => {
    expect(classifySeverity({ mover: 'white', drop: 0.99, beforeWin: 50, afterWin: 48, cpBefore: 0, cpAfter: -20 })).toBe('excellent');
    expect(classifySeverity({ mover: 'white', drop: 1, beforeWin: 50, afterWin: 48, cpBefore: 0, cpAfter: -20 })).toBe('good');
    expect(classifySeverity({ mover: 'white', drop: 4, beforeWin: 50, afterWin: 46, cpBefore: 0, cpAfter: -40 })).toBe('inaccuracy');
    expect(classifySeverity({ mover: 'white', drop: 10, beforeWin: 50, afterWin: 40, cpBefore: 0, cpAfter: -100 })).toBe('mistake');
    expect(classifySeverity({ mover: 'white', drop: 20, beforeWin: 50, afterWin: 30, cpBefore: 0, cpAfter: -200 })).toBe('blunder');
  });

  test('judges a decided game by centipawns lost, not win percentage', () => {
    // 21.Rxb8 at -10.8 allowed mate: win% 1.9 -> 0.07, 913 cp.
    expect(classifySeverity({ mover: 'white', drop: 1.8, beforeWin: 1.9, afterWin: 0.07, cpBefore: -1077, cpAfter: -1990 })).toBe('blunder');
    expect(classifySeverity({ mover: 'white', drop: 1.4, beforeWin: 4.9, afterWin: 3.5, cpBefore: -806, cpAfter: -899 })).toBe('inaccuracy');
    expect(classifySeverity({ mover: 'black', drop: 0.04, beforeWin: 96.5, afterWin: 96.4, cpBefore: -899, cpAfter: -896 })).toBe('excellent');
    expect(classifySeverity({ mover: 'white', drop: 25, beforeWin: 99, afterWin: 94, cpBefore: 900, cpAfter: 400 })).toBe('blunder');
  });

  test('being mated slower or faster lost nothing', () => {
    expect(classifySeverity({ mover: 'white', drop: 0, beforeWin: 0.1, afterWin: 0.1, cpBefore: -1830, cpAfter: -1960 })).toBe('excellent');
    expect(classifySeverity({ mover: 'black', drop: 0, beforeWin: 0.1, afterWin: 0.1, cpBefore: 1900, cpAfter: 1830 })).toBe('excellent');
  });

  test('the fastest mate is the best one: a much slower mate is a fault', () => {
    expect(classifySeverity({ mover: 'black', drop: 0, beforeWin: 99.9, afterWin: 99.9, cpBefore: -1980, cpAfter: -1830 })).toBe('mistake');
    expect(classifySeverity({ mover: 'white', drop: 0, beforeWin: 99.9, afterWin: 99.9, cpBefore: 1980, cpAfter: 1900 })).toBe('inaccuracy');
    expect(classifySeverity({ mover: 'white', drop: 0, beforeWin: 99.9, afterWin: 99.9, cpBefore: 1980, cpAfter: 1950 })).toBe('excellent');
  });

  test('dead-drawn technical positions stay capped at good', () => {
    expect(classifySeverity({ mover: 'white', drop: 12, beforeWin: 50, afterWin: 50, cpBefore: 10, cpAfter: -20 })).toBe('good');
  });
});
