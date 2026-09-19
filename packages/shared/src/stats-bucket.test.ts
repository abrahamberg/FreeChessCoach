import { describe, expect, test } from 'vitest';
import { StatsBucketSchema } from './stats-bucket.js';

const sumCount = (sum: number, count: number) => ({ sum, count });

const FULL_BUCKET = {
  games: 3,
  opening: {
    bookMoves: sumCount(24, 3),
    accuracy: sumCount(250, 3),
    mistakes: sumCount(2, 3),
    byOpening: { 'Italian Game': { games: 2, points: 1.5, accuracySum: 170 } }
  },
  tactics: { fork: { opportunities: 4, found: 2, preventable: 3, prevented: 1 } },
  strategy: {
    overall: sumCount(200, 3),
    pawnStructure: sumCount(150, 2),
    spaceAdvantage: sumCount(0, 0),
    activePiece: sumCount(160, 2),
    attacking: sumCount(140, 2),
    defending: sumCount(170, 2)
  },
  endgame: {
    accuracy: sumCount(160, 2),
    byStanding: { equal: { games: 2, wins: 1, losses: 0, draws: 1 } },
    byTheme: { queen: { games: 2, accuracy: sumCount(160, 2) } }
  },
  rating: sumCount(4500, 3)
};

describe('StatsBucketSchema', () => {
  test('round-trips a populated bucket, filling every other motif with a zero count', () => {
    const parsed = StatsBucketSchema.parse(FULL_BUCKET);

    expect(parsed.games).toBe(3);
    expect(parsed.tactics.fork).toEqual({ opportunities: 4, found: 2, preventable: 3, prevented: 1 });
    expect(parsed.tactics.pin).toEqual({ opportunities: 0, found: 0 });
    expect(StatsBucketSchema.parse(parsed)).toEqual(parsed);
  });

  test('an empty bucket is valid', () => {
    const empty = {
      games: 0,
      opening: { bookMoves: sumCount(0, 0), accuracy: sumCount(0, 0), mistakes: sumCount(0, 0), byOpening: {} },
      tactics: {},
      strategy: Object.fromEntries(
        ['overall', 'pawnStructure', 'spaceAdvantage', 'activePiece', 'attacking', 'defending'].map((key) => [key, sumCount(0, 0)])
      ),
      endgame: { accuracy: sumCount(0, 0), byStanding: {}, byTheme: {} },
      rating: sumCount(0, 0)
    };

    expect(StatsBucketSchema.safeParse(empty).success).toBe(true);
  });

  test('rejects negative counts', () => {
    expect(StatsBucketSchema.safeParse({ ...FULL_BUCKET, games: -1 }).success).toBe(false);
    expect(StatsBucketSchema.safeParse({ ...FULL_BUCKET, rating: sumCount(10, -1) }).success).toBe(false);
    expect(
      StatsBucketSchema.safeParse({
        ...FULL_BUCKET,
        opening: { ...FULL_BUCKET.opening, byOpening: { X: { games: -1, points: 0, accuracySum: 0 } } }
      }).success
    ).toBe(false);
  });

  test('rejects an unknown endgame standing key', () => {
    expect(
      StatsBucketSchema.safeParse({
        ...FULL_BUCKET,
        endgame: { ...FULL_BUCKET.endgame, byStanding: { sideways: { games: 1, wins: 1, losses: 0, draws: 0 } } }
      }).success
    ).toBe(false);
  });
});
