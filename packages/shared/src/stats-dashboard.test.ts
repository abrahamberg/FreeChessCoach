import { describe, expect, test } from 'vitest';
import { TACTIC_MOTIF_TYPES } from './game-report.js';
import { GameSpeedFilterSchema, RatingStatsSchema, StatsDashboardSchema, StatsRangeSchema } from './stats-dashboard.js';

function zeroTacticMotifCounts() {
  return Object.fromEntries(TACTIC_MOTIF_TYPES.map((type) => [type, { opportunities: 0, found: 0 }]));
}

function buildFixture() {
  return {
    gamesAnalyzed: 2,
    opening: {
      averageBookMoves: 6.5,
      openingAccuracy: 88.2,
      averageOpeningMistakes: 0.5,
      performanceByOpening: [{ opening: 'Italian Game', gamesPlayed: 2, winPct: 50, accuracy: 80 }]
    },
    tactics: zeroTacticMotifCounts(),
    strategy: { overall: 78, pawnStructure: 80, spaceAdvantage: 78, activePiece: 85, attacking: 70, defending: 88 },
    endgame: {
      overallAccuracy: 70,
      byStanding: [{ standing: 'winning', gamesPlayed: 2, winPct: 50 }],
      byTheme: [{ theme: 'kingAndPawn', gamesPlayed: 2, accuracy: 70 }]
    },
    rating: {
      gamesWithEstimate: 2,
      points: [
        { playedAt: '2026-08-01T00:00:00.000Z', estimatedRating: 1480 },
        { playedAt: '2026-08-12T00:00:00.000Z', estimatedRating: 1520 }
      ]
    }
  };
}

describe('StatsRangeSchema / GameSpeedFilterSchema', () => {
  test('accepts every documented range and speed value', () => {
    for (const range of ['last7', 'last30', 'last365', 'all']) {
      expect(StatsRangeSchema.safeParse(range).success).toBe(true);
    }
    expect(GameSpeedFilterSchema.safeParse('rapid').success).toBe(true);
    expect(GameSpeedFilterSchema.safeParse('all').success).toBe(true);
  });

  test('rejects an undocumented value', () => {
    expect(StatsRangeSchema.safeParse('last90').success).toBe(false);
    expect(GameSpeedFilterSchema.safeParse('blitz').success).toBe(false);
  });
});

describe('StatsDashboardSchema', () => {
  test('parses a fully-populated fixture', () => {
    expect(StatsDashboardSchema.safeParse(buildFixture()).success).toBe(true);
  });

  test('parses the all-null/empty shape for zero analyzed games', () => {
    const empty = {
      gamesAnalyzed: 0,
      opening: { averageBookMoves: null, openingAccuracy: null, averageOpeningMistakes: null, performanceByOpening: [] },
      tactics: zeroTacticMotifCounts(),
      strategy: { overall: null, pawnStructure: null, spaceAdvantage: null, activePiece: null, attacking: null, defending: null },
      endgame: { overallAccuracy: null, byStanding: [], byTheme: [] },
      rating: { gamesWithEstimate: 0, points: [] }
    };

    expect(StatsDashboardSchema.safeParse(empty).success).toBe(true);
  });

  test('rejects an out-of-range win percentage', () => {
    const fixture = buildFixture();
    fixture.opening.performanceByOpening[0]!.winPct = 150;
    expect(StatsDashboardSchema.safeParse(fixture).success).toBe(false);
  });
});

describe('RatingStatsSchema', () => {
  test('accepts an empty trend', () => {
    expect(RatingStatsSchema.safeParse({ gamesWithEstimate: 0, points: [] }).success).toBe(true);
  });

  test('rejects a point with a non-integer estimated rating', () => {
    const fixture = { gamesWithEstimate: 1, points: [{ playedAt: '2026-08-01T00:00:00.000Z', estimatedRating: 1450.5 }] };
    expect(RatingStatsSchema.safeParse(fixture).success).toBe(false);
  });
});
