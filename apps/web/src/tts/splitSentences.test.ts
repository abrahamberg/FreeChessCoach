import { describe, expect, test } from 'vitest';
import { splitIntoSentences } from './splitSentences.js';

describe('splitIntoSentences', () => {
  test('splits on sentence-ending punctuation followed by whitespace', () => {
    expect(splitIntoSentences('Good move. Keep your king safe.')).toEqual(['Good move.', 'Keep your king safe.']);
  });

  test('splits on question marks and exclamation marks too', () => {
    expect(splitIntoSentences('Are you sure? Really! Think again.')).toEqual(['Are you sure?', 'Really!', 'Think again.']);
  });

  test('returns the whole text as one sentence when there is no terminal punctuation', () => {
    expect(splitIntoSentences('what do you think')).toEqual(['what do you think']);
  });

  test('does not split between consecutive dots with no whitespace between them', () => {
    expect(splitIntoSentences('wait... really? Yes.')).toEqual(['wait...', 'really?', 'Yes.']);
  });

  test('trims surrounding whitespace and drops empty fragments', () => {
    expect(splitIntoSentences('  One.   Two.  ')).toEqual(['One.', 'Two.']);
  });

  test('handles text already translated by sanToSpokenText.ts, with no stray split on a move number', () => {
    expect(splitIntoSentences('move 24, a4 was the idea. Black had to respond.')).toEqual([
      'move 24, a4 was the idea.',
      'Black had to respond.'
    ]);
  });

  test('empty string produces no sentences', () => {
    expect(splitIntoSentences('')).toEqual([]);
  });
});
