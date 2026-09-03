import { describe, expect, test } from 'vitest';
import { pgnFilename } from './pgn-filename.js';

describe('pgnFilename', () => {
  test('builds a lowercase hyphenated name from both players and the played date', () => {
    expect(
      pgnFilename({
        whiteName: 'Daniel Abrahamberg',
        blackName: 'Nate Brooks',
        playedAt: new Date('2026-09-03T19:07:19.976Z'),
        createdAt: new Date('2026-09-01T00:00:00Z')
      })
    ).toBe('daniel-abrahamberg-vs-nate-brooks-2026-09-03.pgn');
  });

  test('falls back to createdAt when playedAt is null', () => {
    expect(
      pgnFilename({ whiteName: 'A', blackName: 'B', playedAt: null, createdAt: new Date('2026-01-15T12:00:00Z') })
    ).toBe('a-vs-b-2026-01-15.pgn');
  });

  test('falls back to "unknown" for a missing player name', () => {
    expect(
      pgnFilename({ whiteName: null, blackName: 'Nate Brooks', playedAt: null, createdAt: new Date('2026-01-15T12:00:00Z') })
    ).toBe('unknown-vs-nate-brooks-2026-01-15.pgn');
  });

  test('strips characters that are unsafe in a filename/header', () => {
    expect(
      pgnFilename({
        whiteName: 'O\'Brien "The Ace"',
        blackName: 'Léa/Test',
        playedAt: null,
        createdAt: new Date('2026-01-15T12:00:00Z')
      })
    ).toBe('o-brien-the-ace-vs-l-a-test-2026-01-15.pgn');
  });
});
