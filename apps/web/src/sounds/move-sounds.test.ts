import { describe, expect, test } from 'vitest';
import { moveSounds } from './move-sounds.js';

describe('moveSounds', () => {
  test('the learner’s move knocks, the opponent’s knocks softer, a capture hits, a check chimes', () => {
    expect(moveSounds({ san: 'e4', mover: 'white', learnerSide: 'white' })).toEqual({ base: 'move', stinger: null });
    expect(moveSounds({ san: 'e5', mover: 'black', learnerSide: 'white' })).toEqual({ base: 'opponent', stinger: null });
    expect(moveSounds({ san: 'Bb5+', mover: 'white', learnerSide: 'white' })).toEqual({ base: 'check', stinger: null });
    expect(moveSounds({ san: 'Qxf7#', mover: 'black', learnerSide: 'white' })).toEqual({ base: 'check', stinger: null });
    // A capture has its own sound, whoever takes; a check still wins.
    expect(moveSounds({ san: 'exd5', mover: 'white', learnerSide: 'white' })).toEqual({ base: 'capture', stinger: null });
    expect(moveSounds({ san: 'Nxe4', mover: 'black', learnerSide: 'white' })).toEqual({ base: 'capture', stinger: null });
  });

  test('a live game has no quality, so no bad or great sound', () => {
    expect(moveSounds({ san: 'Qh5', mover: 'white', learnerSide: 'white', cpBefore: 0, cpAfter: -900 }).stinger).toBeNull();
  });

  test('an analyzed move: a mistake or blunder is bad, a great or brilliant one great, for either side', () => {
    expect(moveSounds({ san: 'Bc3', mover: 'white', learnerSide: 'black', quality: 'blunder' }).stinger).toBe('bad');
    expect(moveSounds({ san: 'Nf3', mover: 'white', learnerSide: 'white', quality: 'mistake' }).stinger).toBe('bad');
    expect(moveSounds({ san: 'Qb4+', mover: 'black', learnerSide: 'black', quality: 'brilliant' })).toEqual({ base: 'check', stinger: 'great' });
    expect(moveSounds({ san: 'Nd5', mover: 'white', learnerSide: 'black', quality: 'great' }).stinger).toBe('great');
    expect(moveSounds({ san: 'a3', mover: 'white', learnerSide: 'white', quality: 'inaccuracy' }).stinger).toBeNull();
    expect(moveSounds({ san: 'a3', mover: 'white', learnerSide: 'white', quality: 'good' }).stinger).toBeNull();
  });

  test('an analyzed move that turns the game is great, from the mover’s side', () => {
    // Black goes from losing (White +300) to winning (White -300).
    expect(moveSounds({ san: 'Qb4', mover: 'black', learnerSide: 'white', quality: 'best', cpBefore: 300, cpAfter: -300 }).stinger).toBe('great');
    // White's own swing the same way.
    expect(moveSounds({ san: 'Rxe5', mover: 'white', learnerSide: 'white', quality: 'excellent', cpBefore: -250, cpAfter: 250 }).stinger).toBe('great');
    // Better, but not turned.
    expect(moveSounds({ san: 'Rxe5', mover: 'white', learnerSide: 'white', quality: 'best', cpBefore: -250, cpAfter: 0 }).stinger).toBeNull();
  });
});
