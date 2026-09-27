import { describe, expect, test } from 'vitest';
import { cpToWords, mateToWords } from './eval-words.js';

describe('eval-words', () => {
  test('cpToWords names the better side in bands', () => {
    expect(cpToWords(30, 'w')).toBe('The position is roughly equal');
    expect(cpToWords(100, 'w')).toBe('White is slightly better');
    expect(cpToWords(200, 'b')).toBe('Black is better');
    expect(cpToWords(-500, 'w')).toBe('Black is much better');
    expect(cpToWords(-1000, 'b')).toBe('White is winning');
  });

  test('mateToWords flips through the side to move', () => {
    expect(mateToWords(3, 'w')).toBe('White has a forced mate in 3');
    expect(mateToWords(3, 'b')).toBe('Black has a forced mate in 3');
    expect(mateToWords(-2, 'b')).toBe('White has a forced mate in 2');
  });
});
