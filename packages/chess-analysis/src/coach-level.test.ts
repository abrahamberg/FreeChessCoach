import { describe, expect, test } from 'vitest';
import { coachBotConfig } from './coach-bot-config.js';
import { COACH_MISTAKE_COOLDOWN_MOVES, coachLevel, DEFAULT_LEVEL_ELO, mayMakeMistake, shouldPunish } from './coach-level.js';

const clean = [0, 1, 0, 2, 1, 0, 1, 0];
const sloppy = [5, 25, 12, 30, 8, 22, 15, 40];

describe('coachLevel', () => {
  test('plays at the usual level until enough moves are in', () => {
    expect(coachLevel({ priorElo: 1400, studentDrops: [0, 0] })).toEqual({ levelElo: 1400, performanceElo: null, targetElo: 1400 });
    expect(coachLevel({ priorElo: null, studentDrops: [] }).targetElo).toBe(DEFAULT_LEVEL_ELO);
  });

  test('plays below the usual level when the student is playing above it, and above when below', () => {
    const playingWell = coachLevel({ priorElo: 1200, studentDrops: clean });
    const playingBadly = coachLevel({ priorElo: 1200, studentDrops: sloppy });
    expect(playingWell.targetElo).toBeLessThan(1200);
    expect(playingBadly.targetElo).toBeGreaterThan(1200);
  });

  test('the swing is capped', () => {
    const { levelElo, targetElo } = coachLevel({ priorElo: 1500, studentDrops: [60, 70, 80, 90, 60] });
    expect(Math.abs(targetElo - levelElo)).toBeLessThanOrEqual(300);
  });
});

describe('shouldPunish', () => {
  const never = () => 0.99;
  test('a big mistake is punished at any level, a small one only by a strong player', () => {
    expect(shouldPunish(35, 400, never)).toBe(true);
    expect(shouldPunish(8, 400, never)).toBe(false);
    expect(shouldPunish(8, 2200, never)).toBe(true);
    expect(shouldPunish(null, 2200, never)).toBe(false);
  });
});

describe('mayMakeMistake', () => {
  test('no second mistake inside the cooldown', () => {
    expect(mayMakeMistake([0, 15, 0])).toBe(false);
    expect(mayMakeMistake([15, ...Array<number>(COACH_MISTAKE_COOLDOWN_MOVES).fill(0)])).toBe(true);
  });
});

describe('coachBotConfig', () => {
  test('odds rise with elo and the overrides pin the branch', () => {
    const weak = coachBotConfig(500, { forceBest: false, noMistake: false });
    const strong = coachBotConfig(1800, { forceBest: false, noMistake: false });
    expect(strong.topFiveChance).toBeGreaterThan(weak.topFiveChance);
    expect(coachBotConfig(500, { forceBest: true, noMistake: false })).toMatchObject({ topFiveChance: 1, bestMoveGivenTopFiveChance: 1 });
    expect(coachBotConfig(500, { forceBest: false, noMistake: true }).topFiveChance).toBe(1);
  });
});
