import { CONFIG } from '@freechesscoach/chess-analysis';
import { describe, expect, test } from 'vitest';
import type { GameRow } from '../db/repositories/games.js';
import { MAX_WINDOW_GAMES, windowByTimeControl } from '../services/diagnostic-window.js';

const MIN_GAMES = CONFIG.dataQualityGates.minRatedGames;

function game(overrides: Partial<GameRow> = {}): GameRow {
  return {
    id: crypto.randomUUID(),
    userId: 'user-1',
    pgn: '1. e4 e5',
    source: 'lichess',
    userColor: 'white',
    whiteName: 'Ann',
    blackName: 'Bob',
    result: '1-0',
    timeControl: '600+0',
    eco: 'C50',
    playedAt: new Date('2026-08-01T00:00:00Z'),
    createdAt: new Date('2026-08-01T00:00:00Z'),
    botId: null,
    botConfigSnapshot: null,
    clockInitialMs: null,
    clockIncrementMs: null,
    whiteRemainingMs: null,
    blackRemainingMs: null,
    whiteElo: 1500,
    blackElo: 1480,
    ratingsProvisional: false,
    rated: true,
    termination: null,
    variant: null,
    speed: null,
    playedAtTime: null,
    moveTimes: null,
    reviewTier: 'imported',
    ...overrides
  };
}

function games(count: number, overrides: (index: number) => Partial<GameRow> = () => ({})): GameRow[] {
  return Array.from({ length: count }, (_, i) => game({ playedAt: new Date(2026, 7, 1 + i), ...overrides(i) }));
}

describe('windowByTimeControl (Task 56.4)', () => {
  test('drops a time control below the §4.2 window minimum', () => {
    const windows = windowByTimeControl(games(MIN_GAMES - 1));
    expect(windows.size).toBe(0);
  });

  test('keeps a time control that clears the window minimum', () => {
    const windows = windowByTimeControl(games(MIN_GAMES));
    expect(windows.get('600+0')).toHaveLength(MIN_GAMES);
  });

  test('excludes unrated games from the window and from the "enough games" count', () => {
    const rated = games(MIN_GAMES);
    const unrated = games(5, () => ({ rated: false }));
    const windows = windowByTimeControl([...rated, ...unrated]);
    expect(windows.get('600+0')).toHaveLength(MIN_GAMES);
  });

  test('excludes games with no time control on record', () => {
    const rated = games(MIN_GAMES);
    const untimed = games(5, () => ({ timeControl: null }));
    const windows = windowByTimeControl([...rated, ...untimed]);
    expect(windows.get('600+0')).toHaveLength(MIN_GAMES);
    expect(windows.size).toBe(1);
  });

  test('pools by exact time control string, never merging or bucketing to a coarser speed class', () => {
    const bullet = games(MIN_GAMES, () => ({ timeControl: '60+0' }));
    const blitz = games(MIN_GAMES, () => ({ timeControl: '300+0' }));
    const windows = windowByTimeControl([...bullet, ...blitz]);
    expect(windows.size).toBe(2);
    expect(windows.get('60+0')).toHaveLength(MIN_GAMES);
    expect(windows.get('300+0')).toHaveLength(MIN_GAMES);
  });

  test('caps a time control at MAX_WINDOW_GAMES, keeping only the most recent ones', () => {
    const windows = windowByTimeControl(games(MAX_WINDOW_GAMES + 20));
    const bucket = windows.get('600+0')!;
    expect(bucket).toHaveLength(MAX_WINDOW_GAMES);
    const newest = new Date(2026, 7, 1 + MAX_WINDOW_GAMES + 19);
    expect(bucket.some((w) => w.playedAt.getTime() === newest.getTime())).toBe(true);
    const oldestDropped = new Date(2026, 7, 1);
    expect(bucket.some((w) => w.playedAt.getTime() === oldestDropped.getTime())).toBe(false);
  });

  test('falls back to createdAt when playedAt is null, for both sorting and inclusion', () => {
    const withPlayedAt = games(MIN_GAMES - 1);
    const noPlayedAt = game({ playedAt: null, createdAt: new Date('2026-09-01T00:00:00Z') });
    const windows = windowByTimeControl([...withPlayedAt, noPlayedAt]);
    const bucket = windows.get('600+0')!;
    expect(bucket).toHaveLength(MIN_GAMES);
    const found = bucket.find((w) => w.game.id === noPlayedAt.id);
    expect(found?.playedAt).toEqual(noPlayedAt.createdAt);
  });
});
