import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';
import * as analysesRepo from '../db/repositories/analyses.js';
import * as gamesRepo from '../db/repositories/games.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';
import { deleteEarliestImportedGames, listImportedGamesForUser, listInProgressGamesForUser } from './games.js';

const ALL_TIME = { limit: 20, offset: 0, range: 'all' as const };

describe('imported-games listing and bulk delete', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  async function createUser() {
    return usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Ann' });
  }

  /** `daysAgo` sets createdAt so ordering is deterministic; `rating` (white
   * side) stores a minimal Game Report carrying only the field the listing
   * query reads. */
  async function createGame(
    userId: string,
    options: { daysAgo: number; source?: 'paste' | 'lichess' | 'coach_play'; rating?: number; userColor?: 'white' | 'black' }
  ) {
    const game = await gamesRepo.insert(db, {
      userId,
      pgn: `1. e4 ${crypto.randomUUID()}`,
      source: options.source ?? 'paste',
      userColor: options.userColor ?? 'white',
      whiteName: 'Ann',
      blackName: 'Bob',
      result: '1-0',
      timeControl: null,
      eco: null,
      playedAt: null
    });
    const createdAt = new Date(Date.now() - options.daysAgo * 86_400_000);
    await db.updateTable('games').set({ createdAt }).where('id', '=', game.id).execute();
    if (options.rating !== undefined) {
      const analysis = await analysesRepo.insertQueued(db, game.id);
      const report = {
        players: {
          white: { estimatedRating: { value: options.rating } },
          black: { estimatedRating: { value: 9999 } }
        }
      };
      await db.updateTable('analyses').set({ gameReport: JSON.stringify(report) }).where('id', '=', analysis.id).execute();
      await analysesRepo.markReady(db, analysis.id);
    }
    return game;
  }

  test('lists only imported games, newest import first, with hasMore for paging', async () => {
    const user = await createUser();
    const oldest = await createGame(user.id, { daysAgo: 3 });
    const middle = await createGame(user.id, { daysAgo: 2 });
    const newest = await createGame(user.id, { daysAgo: 1 });
    await createGame(user.id, { daysAgo: 0, source: 'coach_play' });

    const firstPage = await listImportedGamesForUser(db, user.id, { ...ALL_TIME, limit: 2 });
    expect(firstPage.items.map((item) => item.id)).toEqual([newest.id, middle.id]);
    expect(firstPage.hasMore).toBe(true);

    const secondPage = await listImportedGamesForUser(db, user.id, { ...ALL_TIME, limit: 2, offset: 2 });
    expect(secondPage.items.map((item) => item.id)).toEqual([oldest.id]);
    expect(secondPage.hasMore).toBe(false);
  });

  test("never lists another user's games", async () => {
    const owner = await createUser();
    const other = await createUser();
    await createGame(other.id, { daysAgo: 1 });

    const page = await listImportedGamesForUser(db, owner.id, ALL_TIME);
    expect(page.items).toEqual([]);
  });

  test('range filter drops games imported before the cutoff', async () => {
    const user = await createUser();
    const recent = await createGame(user.id, { daysAgo: 2 });
    await createGame(user.id, { daysAgo: 20 });

    const page = await listImportedGamesForUser(db, user.id, { ...ALL_TIME, range: 'last7' });
    expect(page.items.map((item) => item.id)).toEqual([recent.id]);
  });

  test("rating filter bounds the user's own side's estimate and excludes games without one", async () => {
    const user = await createUser();
    const low = await createGame(user.id, { daysAgo: 4, rating: 900 });
    const mid = await createGame(user.id, { daysAgo: 3, rating: 1400 });
    await createGame(user.id, { daysAgo: 2, rating: 1900 });
    await createGame(user.id, { daysAgo: 1 });
    // Playing black: the white side's 1000 must not count, black's 9999 does.
    const blackGame = await createGame(user.id, { daysAgo: 0, rating: 1000, userColor: 'black' });

    const band = await listImportedGamesForUser(db, user.id, { ...ALL_TIME, minRating: 800, maxRating: 1500 });
    expect(band.items.map((item) => item.id)).toEqual([mid.id, low.id]);
    expect(band.items.map((item) => item.estimatedRating)).toEqual([1400, 900]);

    const unfiltered = await listImportedGamesForUser(db, user.id, ALL_TIME);
    expect(unfiltered.items.find((item) => item.id === blackGame.id)?.estimatedRating).toBe(9999);
  });

  test('deleteEarliestImportedGames removes only the earliest imported games, cascading', async () => {
    const user = await createUser();
    const earliest = await createGame(user.id, { daysAgo: 5, rating: 1200 });
    const second = await createGame(user.id, { daysAgo: 4 });
    const kept = await createGame(user.id, { daysAgo: 3 });
    const playGame = await createGame(user.id, { daysAgo: 9, source: 'coach_play' });

    const result = await deleteEarliestImportedGames(db, user.id, 2);

    expect(result).toEqual({ deleted: 2 });
    expect(await gamesRepo.findById(db, earliest.id)).toBeUndefined();
    expect(await gamesRepo.findById(db, second.id)).toBeUndefined();
    expect(await gamesRepo.findById(db, kept.id)).toBeDefined();
    expect(await gamesRepo.findById(db, playGame.id)).toBeDefined();
    expect(await analysesRepo.findByGameId(db, earliest.id)).toBeUndefined();
  });

  test('deleteEarliestImportedGames deletes fewer when the user has fewer imports', async () => {
    const user = await createUser();
    await createGame(user.id, { daysAgo: 1 });

    expect(await deleteEarliestImportedGames(db, user.id, 50)).toEqual({ deleted: 1 });
  });

  test('listInProgressGamesForUser returns only play-mode games with a live session', async () => {
    const user = await createUser();
    await createGame(user.id, { daysAgo: 1 });
    await createGame(user.id, { daysAgo: 1, source: 'coach_play' });

    expect(await listInProgressGamesForUser(db, user.id)).toEqual([]);
  });
});
