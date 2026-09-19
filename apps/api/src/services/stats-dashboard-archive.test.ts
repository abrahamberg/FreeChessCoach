import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';
import { gameReportFixture, makeReadyGame } from '../../test/helpers/stats-fixtures.js';
import { deleteGameForUser } from './games.js';
import { getStatsDashboard } from './stats-dashboard.js';

const DAY_MS = 86_400_000;

describe('getStatsDashboard — archived weeks', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  function newUser(): Promise<{ id: string }> {
    return usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Ann' });
  }

  function daysAgo(days: number): Date {
    return new Date(Date.now() - days * DAY_MS);
  }

  test('deleting a game does not change the stats (the core guarantee)', async () => {
    const user = await newUser();
    const keep = await makeReadyGame(db, user.id, { playedAt: daysAgo(3), report: gameReportFixture({ accuracy: 90, fork: { opportunities: 2, found: 2 } }) });
    const drop = await makeReadyGame(db, user.id, { playedAt: daysAgo(40), result: '0-1', report: gameReportFixture({ accuracy: 50, fork: { opportunities: 3, found: 0 } }) });
    const alsoDrop = await makeReadyGame(db, user.id, { playedAt: daysAgo(41), result: '1/2-1/2', report: gameReportFixture({ accuracy: 70 }) });
    const before = await getStatsDashboard(db, user.id, 'all', 'all');
    expect(before.gamesAnalyzed).toBe(3);

    await deleteGameForUser(db, drop.id, user.id);
    await deleteGameForUser(db, alsoDrop.id, user.id);
    const after = await getStatsDashboard(db, user.id, 'all', 'all');

    // Everything but the rating *trend*: a deleted game's per-game point
    // becomes one per-week point, but the count of rated games is unchanged.
    expect({ ...after, rating: { gamesWithEstimate: after.rating.gamesWithEstimate } }).toEqual({
      ...before,
      rating: { gamesWithEstimate: before.rating.gamesWithEstimate }
    });
    expect(after.rating.points.length).toBeGreaterThan(0);
    expect(keep.id).toBeDefined();
  });

  test('the rating trend keeps a point for a deleted game\'s week', async () => {
    const user = await newUser();
    const drop = await makeReadyGame(db, user.id, { playedAt: new Date('2026-03-04T10:00:00Z') });
    await deleteGameForUser(db, drop.id, user.id);

    const { rating } = await getStatsDashboard(db, user.id, 'all', 'all');

    expect(rating).toEqual({ gamesWithEstimate: 1, points: [{ playedAt: '2026-03-02T00:00:00.000Z', estimatedRating: 1500 }] });
  });

  test('archived weeks respect the range filter', async () => {
    const user = await newUser();
    const recent = await makeReadyGame(db, user.id, { playedAt: daysAgo(1) });
    const old = await makeReadyGame(db, user.id, { playedAt: daysAgo(90) });
    await deleteGameForUser(db, recent.id, user.id);
    await deleteGameForUser(db, old.id, user.id);

    expect((await getStatsDashboard(db, user.id, 'last30', 'all')).gamesAnalyzed).toBe(1);
    expect((await getStatsDashboard(db, user.id, 'last365', 'all')).gamesAnalyzed).toBe(2);
    expect((await getStatsDashboard(db, user.id, 'all', 'all')).gamesAnalyzed).toBe(2);
  });

  test('archived weeks respect the speed filter', async () => {
    const user = await newUser();
    const rapid = await makeReadyGame(db, user.id, { timeControl: '600+0' });
    const blitz = await makeReadyGame(db, user.id, { timeControl: '180+0' });
    await deleteGameForUser(db, rapid.id, user.id);
    await deleteGameForUser(db, blitz.id, user.id);

    expect((await getStatsDashboard(db, user.id, 'all', 'rapid')).gamesAnalyzed).toBe(1);
    expect((await getStatsDashboard(db, user.id, 'all', 'all')).gamesAnalyzed).toBe(2);
  });

  test("another user's archive never leaks in", async () => {
    const owner = await newUser();
    const other = await newUser();
    const game = await makeReadyGame(db, owner.id);
    await deleteGameForUser(db, game.id, owner.id);

    expect((await getStatsDashboard(db, other.id, 'all', 'all')).gamesAnalyzed).toBe(0);
  });
});
