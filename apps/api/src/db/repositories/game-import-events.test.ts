import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { Kysely } from 'kysely';
import { createTestDb, type TestDb } from '../../../test/helpers/db.js';
import * as usersRepo from './users.js';
import * as gamesRepo from './games.js';
import * as importEventsRepo from './game-import-events.js';
import type { Database } from '../schema.js';

const HOUR_MS = 3_600_000;

describe('game-import-events repository', () => {
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

  test('countSince counts only that user\'s rows at or after `since`', async () => {
    const user = await newUser();
    const other = await newUser();
    const now = Date.now();
    await importEventsRepo.record(db, user.id, new Date(now - 30 * HOUR_MS));
    await importEventsRepo.record(db, user.id, new Date(now - 2 * HOUR_MS));
    await importEventsRepo.record(db, user.id, new Date(now));
    await importEventsRepo.record(db, other.id, new Date(now));

    expect(await importEventsRepo.countSince(db, user.id, new Date(now - 24 * HOUR_MS))).toBe(2);
    expect(await importEventsRepo.countSince(db, user.id, new Date(now - 48 * HOUR_MS))).toBe(3);
    expect(await importEventsRepo.countSince(db, other.id, new Date(now - 24 * HOUR_MS))).toBe(1);
  });

  test('a row survives after the user\'s game is deleted', async () => {
    const user = await newUser();
    const game = await gamesRepo.insert(db, {
      userId: user.id,
      pgn: '1. e4 e5',
      source: 'paste',
      userColor: 'white',
      whiteName: null,
      blackName: null,
      result: null,
      timeControl: null,
      eco: null,
      playedAt: null
    });
    await importEventsRepo.record(db, user.id, new Date());

    await gamesRepo.remove(db, game.id);

    expect(await importEventsRepo.countSince(db, user.id, new Date(Date.now() - HOUR_MS))).toBe(1);
  });
});
