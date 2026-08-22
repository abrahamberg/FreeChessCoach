import { describe, expect, test } from 'vitest';
import { classifySeverity } from './classify-severity.js';

describe('classifySeverity', () => {
  test('uses the report drop thresholds', () => {
    expect(classifySeverity({ drop: 1.99, beforeWin: 50, afterWin: 48, cpBefore: 0, cpAfter: -20 })).toBe('excellent');
    expect(classifySeverity({ drop: 2, beforeWin: 50, afterWin: 48, cpBefore: 0, cpAfter: -20 })).toBe('good');
    expect(classifySeverity({ drop: 5, beforeWin: 50, afterWin: 45, cpBefore: 0, cpAfter: -50 })).toBe('inaccuracy');
    expect(classifySeverity({ drop: 10, beforeWin: 50, afterWin: 40, cpBefore: 0, cpAfter: -100 })).toBe('mistake');
    expect(classifySeverity({ drop: 20, beforeWin: 50, afterWin: 30, cpBefore: 0, cpAfter: -200 })).toBe('blunder');
  });

  test('caps a still-winning move at inaccuracy', () => {
    expect(classifySeverity({ drop: 40, beforeWin: 99, afterWin: 94, cpBefore: 1200, cpAfter: 600 })).toBe('inaccuracy');
  });

  test('does not call a +9.0 to +4.0 move a blunder', () => {
    expect(classifySeverity({ drop: 25, beforeWin: 99, afterWin: 94, cpBefore: 900, cpAfter: 400 })).not.toBe('blunder');
  });

  test('caps already-lost positions and dead-drawn technical positions', () => {
    expect(classifySeverity({ drop: 40, beforeWin: 5, afterWin: 2, cpBefore: -1200, cpAfter: -600 })).toBe('inaccuracy');
    expect(classifySeverity({ drop: 12, beforeWin: 50, afterWin: 50, cpBefore: 10, cpAfter: -20 })).toBe('good');
  });
});
