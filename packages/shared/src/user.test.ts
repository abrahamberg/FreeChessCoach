import { describe, expect, test } from 'vitest';
import { deriveRatingBand } from './user.js';

describe('deriveRatingBand', () => {
  test('below 900 is novice', () => {
    expect(deriveRatingBand(100)).toBe('novice');
    expect(deriveRatingBand(899)).toBe('novice');
  });

  test('900-1299 is improving', () => {
    expect(deriveRatingBand(900)).toBe('improving');
    expect(deriveRatingBand(1299)).toBe('improving');
  });

  test('1300-1699 is club', () => {
    expect(deriveRatingBand(1300)).toBe('club');
    expect(deriveRatingBand(1699)).toBe('club');
  });

  test('1700 and above is advanced, with no upper cap', () => {
    expect(deriveRatingBand(1700)).toBe('advanced');
    expect(deriveRatingBand(2800)).toBe('advanced');
  });
});
