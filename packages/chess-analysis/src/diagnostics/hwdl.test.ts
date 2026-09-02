import { describe, expect, test } from 'vitest';
import { computeHwdl, hwdlSeverity } from './hwdl.js';

describe('computeHwdl', () => {
  test('is the mover-perspective win% drop, as a [0,1] fraction', () => {
    expect(computeHwdl({ winPctBefore: 80, winPctAfter: 50 })).toBeCloseTo(0.3);
  });

  test('clamps to 0 when the move improved the mover\'s win%', () => {
    expect(computeHwdl({ winPctBefore: 40, winPctAfter: 60 })).toBe(0);
  });

  test('is 0 for a move that didn\'t change the win%', () => {
    expect(computeHwdl({ winPctBefore: 55, winPctAfter: 55 })).toBe(0);
  });
});

describe('hwdlSeverity', () => {
  const undecided = { cpBefore: 0, cpAfter: 0 };

  test('a small drop is minor', () => {
    expect(hwdlSeverity(0.02, { winPctBefore: 52, winPctAfter: 50, ...undecided })).toBe('minor');
  });

  test('a moderate drop is meaningful', () => {
    expect(hwdlSeverity(0.07, { winPctBefore: 57, winPctAfter: 50, ...undecided })).toBe('meaningful');
  });

  test('a large drop is major', () => {
    expect(hwdlSeverity(0.15, { winPctBefore: 65, winPctAfter: 50, ...undecided })).toBe('major');
  });

  test('a huge drop is decisive', () => {
    expect(hwdlSeverity(0.4, { winPctBefore: 90, winPctAfter: 50, ...undecided })).toBe('decisive');
  });

  test('a big swing between two already-winning positions is capped to minor, not decisive', () => {
    // Both sides of the move are >= CONFIG.severity.dampingHighWin (90) —
    // the game's practical outcome never changes, so raw magnitude doesn't
    // matter (the same principle classify-severity.ts's damping encodes).
    const hwdl = computeHwdl({ winPctBefore: 99, winPctAfter: 91 });

    expect(hwdlSeverity(hwdl, { winPctBefore: 99, winPctAfter: 91, cpBefore: 900, cpAfter: 500 })).toBe('minor');
  });

  test('a swing between two already-lost positions is likewise capped to minor', () => {
    const hwdl = computeHwdl({ winPctBefore: 9, winPctAfter: 1 });

    expect(hwdlSeverity(hwdl, { winPctBefore: 9, winPctAfter: 1, cpBefore: -900, cpAfter: -1200 })).toBe('minor');
  });

  test('a swing inside a technically-drawn quiet position is capped to minor', () => {
    // Both win% readings sit inside [45, 55] and both |cp| stay under 30 —
    // CONFIG.severity's dead-draw-technical window.
    const hwdl = computeHwdl({ winPctBefore: 54, winPctAfter: 46 });

    expect(hwdlSeverity(hwdl, { winPctBefore: 54, winPctAfter: 46, cpBefore: 10, cpAfter: -10 })).toBe('minor');
  });

  test('the same win%-band swing is NOT damped once the position is actually sharp (large |cp|)', () => {
    const hwdl = computeHwdl({ winPctBefore: 54, winPctAfter: 46 });

    // Not "minor" under the dead-draw rule since |cp| exceeds deadDrawCpAbs,
    // and 0.08 is above minorMaxHwdl (0.05) too, so it should read as its
    // own un-damped band.
    expect(hwdlSeverity(hwdl, { winPctBefore: 54, winPctAfter: 46, cpBefore: 300, cpAfter: -300 })).toBe('meaningful');
  });
});
