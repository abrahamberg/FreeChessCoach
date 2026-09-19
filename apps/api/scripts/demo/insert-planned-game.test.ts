import { describe, expect, it } from 'vitest';
import { planGames } from './game-plan.js';
import { clockTimesForOpening, pgnForPlannedGame } from './insert-planned-game.js';
import { mulberry32 } from './rng.js';

const game = planGames(mulberry32(5), 60, new Date('2026-09-19T14:00:00Z'), 20).at(-1)!;

describe('clockTimesForOpening', () => {
  const times = clockTimesForOpening(mulberry32(1), game.opening.plies.length, game.timeControl);

  it('has a clock reading for every ply, counting down from the time control', () => {
    expect(times).toHaveLength(game.opening.plies.length);
    expect(times.every((time) => time.clockMs !== null)).toBe(true);
    const whiteClocks = times.filter((time) => time.ply % 2 === 1).map((time) => time.clockMs as number);
    expect(whiteClocks[0]).toBeLessThanOrEqual(600_000 + 5_000);
    expect([...whiteClocks].sort((a, b) => b - a)).toEqual(whiteClocks);
  });

  it('records how long each move took, except each side\'s first', () => {
    expect(times[0]!.timeSpentMs).toBeNull();
    expect(times[2]!.timeSpentMs).toBeGreaterThan(0);
  });
});

describe('pgnForPlannedGame', () => {
  it('shows the smooth platform rating for the player in the headers', () => {
    const pgn = pgnForPlannedGame(game, 'sam_climbs');
    expect(pgn).toContain(`"${game.platformRating}"`);
  });
});
