import { describe, expect, it } from 'vitest';
import { gamesPerDay, planGames } from './game-plan.js';
import { mulberry32 } from './rng.js';

const NOW = new Date('2026-09-19T14:00:00Z');
const TOTAL = 3420;

describe('gamesPerDay', () => {
  const counts = gamesPerDay(mulberry32(1), TOTAL, 365);

  it('adds up to exactly the requested number of games over 365 days', () => {
    expect(counts).toHaveLength(365);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(TOTAL);
  });

  it('never exceeds the app\'s 30-imports-a-day limit', () => {
    expect(Math.max(...counts)).toBeLessThanOrEqual(30);
  });

  it('averages about ten games on the days the player plays, with some rest days', () => {
    expect(counts.filter((count) => count === 0).length).toBeGreaterThan(5);
    expect(TOTAL / 365).toBeGreaterThan(8);
  });
});

describe('planGames', () => {
  const games = planGames(mulberry32(2), TOTAL, NOW);

  it('plans every game in chronological order, none in the future', () => {
    expect(games).toHaveLength(TOTAL);
    for (let i = 1; i < games.length; i++) {
      expect(games[i]!.playedAt.getTime()).toBeGreaterThanOrEqual(games[i - 1]!.playedAt.getTime());
    }
    expect(games.at(-1)!.playedAt.getTime()).toBeLessThanOrEqual(NOW.getTime());
  });

  it('wins a bit more than it loses, like a player who is climbing', () => {
    const wins = games.filter((game) => game.result === 'win').length / TOTAL;
    expect(wins).toBeGreaterThan(0.5);
    expect(wins).toBeLessThan(0.68);
  });

  it('is all ten-minute rapid, the format the coaching method is built around', () => {
    expect(games.every((game) => game.timeControl.startsWith('600'))).toBe(true);
    expect(games.filter((game) => game.timeControl === '600+0').length / TOTAL).toBeGreaterThan(0.85);
  });

  it('starts out in unnamed openings and settles into a repertoire', () => {
    const unnamedShare = (from: number, to: number) => {
      const slice = games.filter((game) => game.day >= from && game.day < to);
      return slice.filter((game) => game.opening.name === null).length / slice.length;
    };
    expect(unnamedShare(0, 30)).toBeGreaterThan(0.3);
    expect(unnamedShare(300, 365)).toBeLessThan(0.1);
  });

  it('is repeatable: the same seed plans the same year', () => {
    const again = planGames(mulberry32(2), TOTAL, NOW);
    expect(again[100]).toEqual(games[100]);
  });
});

describe('planGames for a shorter journey', () => {
  const games = planGames(mulberry32(3), 250, NOW, 34);

  it('ends today on the given day of the journey, at about an 800-level rating', () => {
    expect(games).toHaveLength(250);
    expect(Math.max(...games.map((game) => game.day))).toBeLessThanOrEqual(34);
    const lastTen = games.slice(-10).map((game) => game.estimatedRating);
    const average = lastTen.reduce((a, b) => a + b, 0) / lastTen.length;
    expect(average).toBeGreaterThan(720);
    expect(average).toBeLessThan(940);
    expect(games.at(-1)!.playedAt.getTime()).toBeLessThanOrEqual(NOW.getTime());
  });

  it('starts about five weeks ago', () => {
    const daysAgo = (NOW.getTime() - games[0]!.playedAt.getTime()) / (24 * 60 * 60 * 1000);
    expect(daysAgo).toBeGreaterThan(30);
    expect(daysAgo).toBeLessThan(36);
  });
});

describe('a believable platform rating and colour balance', () => {
  const year = planGames(mulberry32(2), TOTAL, NOW);
  const shortJourney = planGames(mulberry32(3), 250, NOW, 34);

  it('gives the player a smooth platform rating, never the noisy per-game estimate', () => {
    // The diagnostics gates read the rating shown on each game: a jumpy one
    // reads as "rapidly changing account rating".
    // Allow the curve's steepest climb (about 13 points a day at its peak) for each day between games.
    for (let i = 1; i < year.length; i++) {
      const days = year[i]!.day - year[i - 1]!.day;
      expect(Math.abs(year[i]!.platformRating - year[i - 1]!.platformRating)).toBeLessThanOrEqual(14 * days);
    }
  });

  it('keeps any 100-game window well inside the 200-point rating-swing gate, even for a fast climber', () => {
    const window = shortJourney.slice(-100).map((game) => game.platformRating);
    expect(Math.max(...window) - Math.min(...window)).toBeLessThan(200);
  });

  it('plays both colours about equally, in every stretch (no one-sided sample)', () => {
    for (const games of [year, shortJourney]) {
      for (let from = 0; from + 100 <= games.length; from += 100) {
        const white = games.slice(from, from + 100).filter((game) => game.userColor === 'white').length;
        expect(white).toBeGreaterThanOrEqual(42);
        expect(white).toBeLessThanOrEqual(58);
      }
    }
  });
});
