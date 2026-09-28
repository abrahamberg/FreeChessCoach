import { describe, expect, test } from 'vitest';
import { moveSound } from './move-sounds.js';

describe('moveSound', () => {
  test('the learner’s move knocks, the opponent’s knocks softer, a capture hits, a check wins', () => {
    expect(moveSound({ san: 'e4', mover: 'white', learnerSide: 'white' })).toBe('move');
    expect(moveSound({ san: 'e5', mover: 'black', learnerSide: 'white' })).toBe('opponent');
    expect(moveSound({ san: 'exd5', mover: 'white', learnerSide: 'white' })).toBe('capture');
    expect(moveSound({ san: 'Nxe4', mover: 'black', learnerSide: 'white' })).toBe('capture');
    expect(moveSound({ san: 'Bb5+', mover: 'white', learnerSide: 'white' })).toBe('check');
    expect(moveSound({ san: 'Qxf7#', mover: 'black', learnerSide: 'white' })).toBe('check');
  });

  test('a live game has no quality, so never bad or great', () => {
    expect(moveSound({ san: 'Qh5', mover: 'white', learnerSide: 'white', cpBefore: 0, cpAfter: -900 })).toBe('move');
  });

  test('an analyzed move: a mistake or blunder is bad, a great or brilliant one great, for either side; a check stays a check', () => {
    expect(moveSound({ san: 'Bc3', mover: 'white', learnerSide: 'black', quality: 'blunder' })).toBe('bad');
    expect(moveSound({ san: 'Nf3', mover: 'white', learnerSide: 'white', quality: 'mistake' })).toBe('bad');
    expect(moveSound({ san: 'Nxd5', mover: 'white', learnerSide: 'black', quality: 'great' })).toBe('great');
    expect(moveSound({ san: 'Qb4+', mover: 'black', learnerSide: 'black', quality: 'brilliant' })).toBe('check');
    expect(moveSound({ san: 'a3', mover: 'white', learnerSide: 'white', quality: 'inaccuracy' })).toBe('move');
    expect(moveSound({ san: 'axb4', mover: 'white', learnerSide: 'white', quality: 'good' })).toBe('capture');
  });

  test('an analyzed move that turns the game is great, from the mover’s side', () => {
    expect(moveSound({ san: 'Qb4', mover: 'black', learnerSide: 'white', quality: 'best', cpBefore: 300, cpAfter: -300 })).toBe('great');
    expect(moveSound({ san: 'Rxe5', mover: 'white', learnerSide: 'white', quality: 'excellent', cpBefore: -250, cpAfter: 250 })).toBe('great');
    expect(moveSound({ san: 'Rxe5', mover: 'white', learnerSide: 'white', quality: 'best', cpBefore: -250, cpAfter: 0 })).toBe('capture');
  });
});
