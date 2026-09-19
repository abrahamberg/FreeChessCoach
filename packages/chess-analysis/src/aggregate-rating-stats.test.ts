import { TACTIC_MOTIF_TYPES, type EstimatedRatingReport, type GameReport, type PlayerReport } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { aggregateRatingStats } from './aggregate-rating-stats.js';
import type { StatsEntry } from './stats-entry.js';

function zeroTacticMotifs() {
  return Object.fromEntries(TACTIC_MOTIF_TYPES.map((type) => [type, { opportunities: 0, found: 0 }])) as PlayerReport['tacticMotifs'];
}

function buildPlayerReport(estimatedRating: EstimatedRatingReport): PlayerReport {
  const zeroCounts = Object.fromEntries(
    ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder', 'forced'].map(
      (quality) => [quality, 0]
    )
  ) as PlayerReport['counts'];

  return {
    accuracy: 80,
    phaseAccuracy: { opening: 90, middlegame: 75, endgame: null },
    phaseConfidence: { opening: 'ok', middlegame: 'ok', endgame: 'none' },
    scores: { opening: 85, tactics: 70, strategy: 78, endgame: null },
    strategySubScores: { pawnStructure: 80, spaceAdvantage: 78, activePiece: 85, attacking: 70, defending: 88 },
    endgame: { standing: null, theme: null },
    counts: zeroCounts,
    acpl: 20,
    estimatedRating,
    tacticMotifs: zeroTacticMotifs()
  };
}

function buildGameReport(estimatedRating: EstimatedRatingReport): GameReport {
  const playerBook = { lastBookPly: 6, leftBookPly: 7, leftBookMove: 'Bc4', bookAlternatives: [] };
  return {
    engine: { name: 'stockfish', depth: 18, multiPv: 3 },
    book: {
      source: 'lichess-chess-openings@2024.01',
      eco: 'C50',
      ecoVolume: 'C',
      name: 'Italian Game',
      family: 'Italian Game',
      variation: null,
      namedAtPly: 4,
      lastBookPly: 6,
      players: { white: playerBook, black: playerBook }
    },
    phases: { openingEndPly: 12, endgameStartPly: null, openingSource: 'book' },
    players: { white: buildPlayerReport(estimatedRating), black: buildPlayerReport(estimatedRating) },
    moves: []
  } as unknown as GameReport;
}

function entry(value: number | null, playedAt: Date | null): StatsEntry {
  const estimatedRating: EstimatedRatingReport =
    value === null
      ? { value: null, range: null, confidence: 'low', reason: 'too few moves' }
      : { value, range: [value - 250, value + 250], confidence: 'medium' };
  return { gameReport: buildGameReport(estimatedRating), result: 'win', userColor: 'white', playedAt, speed: 'rapid' };
}

describe('aggregateRatingStats', () => {
  test('returns one point per game, sorted chronologically regardless of input order', () => {
    const stats = aggregateRatingStats([
      entry(1650, new Date('2026-08-12T00:00:00Z')),
      entry(1500, new Date('2026-08-01T00:00:00Z')),
      entry(1580, new Date('2026-08-05T00:00:00Z'))
    ]);

    expect(stats.gamesWithEstimate).toBe(3);
    expect(stats.points).toEqual([
      { playedAt: '2026-08-01T00:00:00.000Z', estimatedRating: 1500 },
      { playedAt: '2026-08-05T00:00:00.000Z', estimatedRating: 1580 },
      { playedAt: '2026-08-12T00:00:00.000Z', estimatedRating: 1650 }
    ]);
  });

  test('never averages two games on the same day into one point', () => {
    const sameDay = new Date('2026-08-01T00:00:00Z');
    const stats = aggregateRatingStats([entry(1500, sameDay), entry(1600, sameDay)]);

    expect(stats.points).toHaveLength(2);
  });

  test('excludes a game with no estimate (docs/algorith.md §8.5) or no known playedAt', () => {
    const stats = aggregateRatingStats([
      entry(1500, new Date('2026-08-01T00:00:00Z')),
      entry(null, new Date('2026-08-02T00:00:00Z')),
      entry(1700, null)
    ]);

    expect(stats.gamesWithEstimate).toBe(1);
    expect(stats.points).toEqual([{ playedAt: '2026-08-01T00:00:00.000Z', estimatedRating: 1500 }]);
  });

  test('returns an empty trend (never a misleading point) for no entries', () => {
    expect(aggregateRatingStats([])).toEqual({ gamesWithEstimate: 0, points: [] });
  });
});
