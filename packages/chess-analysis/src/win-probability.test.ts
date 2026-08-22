import { describe, expect, test } from 'vitest';
import { toCpWhite, winPctFor, winPctWhite } from './win-probability.js';

describe('toCpWhite', () => {
  test('folds mate scores onto the signed centipawn scale', () => {
    expect(toCpWhite({ cp: null, mateIn: 1 })).toBe(1990);
    expect(toCpWhite({ cp: null, mateIn: -10 })).toBe(-1900);
    expect(toCpWhite({ cp: null, mateIn: 50 })).toBe(1500);
    expect(toCpWhite({ cp: null, mateIn: -100 })).toBe(-1500);
  });

  test('uses a clamped centipawn score when no mate is present', () => {
    expect(toCpWhite({ cp: 350, mateIn: null })).toBe(350);
    expect(toCpWhite({ cp: null, mateIn: null })).toBe(0);
    expect(toCpWhite({ cp: 2500, mateIn: null })).toBe(2000);
    expect(toCpWhite({ cp: -2500, mateIn: null })).toBe(-2000);
  });
});

describe('winPctWhite', () => {
  test.each([
    [0, 50.00],
    [25, 52.30],
    [50, 54.59],
    [100, 59.10],
    [150, 63.47],
    [200, 67.62],
    [300, 75.11],
    [500, 86.31],
    [800, 95.01],
    [1000, 97.54],
    [2000, 99.94]
  ])('maps %d cp to %s win percent', (cp, expected) => {
    expect(Number(winPctWhite(cp).toFixed(2))).toBe(expected);
  });
});

describe('winPctFor', () => {
  test('returns the white perspective for White', () => {
    expect(winPctFor('white', 200)).toBe(winPctWhite(200));
  });

  test('mirrors the white perspective for Black', () => {
    expect(winPctFor('black', 200)).toBe(100 - winPctWhite(200));
  });
});
