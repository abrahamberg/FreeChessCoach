import type { TacticBaselineNoteDto } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { tacticBaselineDrill, tacticBaselineHeadline } from './tactic-baseline-text.js';

function note(overrides: Partial<TacticBaselineNoteDto> = {}): TacticBaselineNoteDto {
  return {
    motif: 'fork',
    kind: 'missed',
    tone: 'unusual',
    gameRate: 1,
    baselineRate: 0.1,
    gameChances: 2,
    baselineChances: 10,
    baselineGames: 9,
    ...overrides
  };
}

describe('tacticBaselineHeadline', () => {
  test('measures the lapse against the player, not against zero', () => {
    expect(tacticBaselineHeadline(note())).toBe(
      'You missed a fork this game, which is unusual for you — you normally find 90% of them.'
    );
  });

  test('a single lapse against a good record ends as a note, not a score', () => {
    expect(tacticBaselineHeadline(note({ gameChances: 1 }))).toContain('No big deal.');
  });

  test('a pattern says so, and says over how many games', () => {
    expect(tacticBaselineHeadline(note({ tone: 'habit', baselineRate: 0.7 }))).toBe(
      'You missed all 2 forks this game, and that has been the pattern across your last 9 games.'
    );
  });

  test('an allowed threat is told as something that happened to the reader', () => {
    expect(tacticBaselineHeadline(note({ kind: 'allowed' }))).toBe(
      'You allowed a fork this game, which is unusual for you — you normally stop 90% of them.'
    );
  });

  test('the good direction gets its own sentence', () => {
    expect(tacticBaselineHeadline(note({ kind: 'found', tone: 'strength', gameRate: 1, baselineRate: 0.4, gameChances: 3 }))).toBe(
      'You found all 3 forks this game — better than your usual 40%.'
    );
  });
});

describe('tacticBaselineDrill', () => {
  test('closes with something to do rather than restating the number', () => {
    expect(tacticBaselineDrill(note())).toBe('Next game, hunt for one thing: a chance to land a fork.');
  });

  test('a threat you allowed points at their ideas, not yours', () => {
    expect(tacticBaselineDrill(note({ kind: 'allowed' }))).toBe('Next game, before each move, ask what fork they have.');
  });
});
