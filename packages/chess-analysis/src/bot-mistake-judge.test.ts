import { describe, expect, test } from 'vitest';
import { acceptsMistake, cpLoss, mistakeTier, moveLoss, moverWinPct, positionState, winPctLoss } from './bot-mistake-judge.js';

const equal = { cp: 0, mateIn: null };

describe('winPctLoss', () => {
  test('the same 250 cp is a big loss in an equal position and almost nothing when already winning big', () => {
    const inEqual = winPctLoss(equal, { cp: -250, mateIn: null });
    const inWon = winPctLoss({ cp: 1500, mateIn: null }, { cp: 1250, mateIn: null });

    expect(inEqual).toBeGreaterThan(20);
    expect(inWon).toBeLessThan(2);
  });

  test('walking into a mate is the full loss, whatever the previous cp was', () => {
    expect(winPctLoss({ cp: 300, mateIn: null }, { cp: null, mateIn: -3 })).toBeGreaterThan(70);
  });

  test('a move that improves the score loses nothing (negative)', () => {
    expect(winPctLoss(equal, { cp: 100, mateIn: null })).toBeLessThan(0);
  });
});

describe('mistakeTier', () => {
  test.each([
    [0, 'fine'],
    [10, 'fine'],
    [10.5, 'mistake'],
    [20, 'mistake'],
    [20.5, 'blunder'],
    [60, 'blunder']
  ] as const)('an open position: a %s point win%% drop is %s', (loss, tier) => {
    expect(mistakeTier('open', loss)).toBe(tier);
  });

  test.each([
    [0, 'fine'],
    [99, 'fine'],
    [100, 'mistake'],
    [249, 'mistake'],
    [250, 'blunder'],
    [900, 'blunder']
  ] as const)('a winning position: a %s cp drop is %s', (loss, tier) => {
    expect(mistakeTier('winning', loss)).toBe(tier);
  });
});

describe('moveLoss', () => {
  test('a winning bot that drops a knight has made a real mistake, even though its win chance barely moves', () => {
    const before = { cp: 900, mateIn: null };
    const after = { cp: 600, mateIn: null };

    expect(winPctLoss(before, after)).toBeLessThan(10);
    expect(cpLoss(before, after)).toBe(300);
    expect(mistakeTier('winning', moveLoss('winning', before, after))).toBe('blunder');
  });

  test('an open position is judged in win percentage', () => {
    const loss = moveLoss('open', equal, { cp: -250, mateIn: null });

    expect(loss).toBeCloseTo(winPctLoss(equal, { cp: -250, mateIn: null }));
    expect(mistakeTier('open', loss)).toBe('blunder');
  });

  test('throwing away a forced mate is a blunder in centipawns too', () => {
    const loss = moveLoss('winning', { cp: null, mateIn: 4 }, { cp: 300, mateIn: null });

    expect(mistakeTier('winning', loss)).toBe('blunder');
  });
});

describe('positionState', () => {
  test('is decided only when the bot is far ahead or far behind', () => {
    expect(positionState(equal)).toBe('open');
    expect(positionState({ cp: 400, mateIn: null })).toBe('open');
    expect(positionState({ cp: 800, mateIn: null })).toBe('winning');
    expect(positionState({ cp: -1500, mateIn: null })).toBe('losing');
    expect(positionState({ cp: null, mateIn: 4 })).toBe('winning');
  });
});

describe('acceptsMistake', () => {
  test('a blunder branch needs a blunder, a mistake branch takes anything not fine', () => {
    expect(acceptsMistake('open', 'blunder', 'mistake')).toBe(false);
    expect(acceptsMistake('open', 'blunder', 'blunder')).toBe(true);
    expect(acceptsMistake('open', 'mistake', 'fine')).toBe(false);
    expect(acceptsMistake('open', 'mistake', 'mistake')).toBe(true);
    expect(acceptsMistake('open', 'mistake', 'blunder')).toBe(true);
  });

  test('the same holds when the bot is far ahead (measured in centipawns there)', () => {
    expect(acceptsMistake('winning', 'mistake', 'mistake')).toBe(true);
    expect(acceptsMistake('winning', 'blunder', 'mistake')).toBe(false);
    expect(acceptsMistake('winning', 'blunder', 'blunder')).toBe(true);
  });

  test('bot far behind: never injects a mistake', () => {
    expect(acceptsMistake('losing', 'blunder', 'blunder')).toBe(false);
    expect(acceptsMistake('losing', 'mistake', 'blunder')).toBe(false);
  });
});

test('moverWinPct is 50 for an equal score', () => {
  expect(moverWinPct(equal)).toBeCloseTo(50);
});
