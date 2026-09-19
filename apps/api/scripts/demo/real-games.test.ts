import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePgn } from '@freechesscoach/chess-analysis';
import { describe, expect, it } from 'vitest';
import { playedAtFor, REAL_GAMES, withPlayedAt } from './real-games.js';

const NOW = new Date('2026-09-19T14:00:00Z');
const GAMES_DIR = join(dirname(fileURLToPath(import.meta.url)), 'games');

describe('playedAtFor', () => {
  it('places a game N days before today at the given UTC hour', () => {
    expect(playedAtFor({ daysAgo: 4, hourUtc: 19 }, NOW).toISOString()).toBe('2026-09-15T19:00:00.000Z');
  });
});

describe('withPlayedAt', () => {
  const pgn = '[Event "Rated Rapid game"]\n[Site "x"]\n[Date "2026.09.18"]\n[White "a"]\n\n1. e4 e5 *\n';

  it('replaces the date and adds the time, keeping the moves', () => {
    const result = withPlayedAt(pgn, new Date('2026-09-15T19:00:00Z'));
    expect(result).toContain('[Date "2026.09.15"]');
    expect(result).toContain('[UTCTime "19:00:00"]');
    expect(result).not.toContain('2026.09.18');
    expect(result).toContain('1. e4 e5 *');
  });
});

describe('fixture games', () => {
  it.each(REAL_GAMES.map((game) => [game.file, game] as const))('%s is a legal, finished game by sam_climbs', (file) => {
    const pgn = readFileSync(join(GAMES_DIR, file), 'utf8');
    expect(pgn).toContain('sam_climbs');
    expect(parsePgn(pgn).positions.length).toBeGreaterThan(20);
    expect(pgn).toMatch(/\[Result "(1-0|0-1)"\]/);
  });

  it('spans a few weeks, each on a different day', () => {
    expect(new Set(REAL_GAMES.map((game) => game.daysAgo)).size).toBe(REAL_GAMES.length);
  });
});
