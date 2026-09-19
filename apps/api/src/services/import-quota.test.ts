import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { BOT_ROSTER, DAILY_IMPORT_LIMIT, MAX_IN_FLIGHT_IMPORTS, MAX_LIBRARY_GAMES, WEEKLY_IMPORT_LIMIT } from '@freechesscoach/shared';
import * as analysesRepo from '../db/repositories/analyses.js';
import * as gameImportEventsRepo from '../db/repositories/game-import-events.js';
import * as gamesRepo from '../db/repositories/games.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';
import { getImportQuota } from './import-quota.js';

const DAY_MS = 86_400_000;

describe('getImportQuota', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  function insertGame(userId: string, source: 'paste' | 'vs_bot') {
    return gamesRepo.insert(db, {
      userId, pgn: `1. e4 ${crypto.randomUUID()}`, source, userColor: 'white', whiteName: null, blackName: null,
      result: null, timeControl: null, eco: null, playedAt: null,
      ...(source === 'vs_bot' ? { botId: BOT_ROSTER[0]!.id, botConfigSnapshot: BOT_ROSTER[0]! } : {})
    });
  }

  test('a fresh user has everything unused and the limits from shared', async () => {
    const user = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Ann' });

    expect(await getImportQuota(db, user.id)).toEqual({
      daily: { used: 0, limit: DAILY_IMPORT_LIMIT },
      weekly: { used: 0, limit: WEEKLY_IMPORT_LIMIT },
      inFlight: { used: 0, limit: MAX_IN_FLIGHT_IMPORTS },
      library: { used: 0, limit: MAX_LIBRARY_GAMES, autoDeleteCount: 0 }
    });
  });

  test('daily counts the last 24h, weekly the last 7 days, in-flight unfinished analyses, library imported games only', async () => {
    const user = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Ann' });
    await gameImportEventsRepo.record(db, user.id, new Date());
    await gameImportEventsRepo.record(db, user.id, new Date(Date.now() - 3 * DAY_MS));
    await gameImportEventsRepo.record(db, user.id, new Date(Date.now() - 9 * DAY_MS));
    const game = await insertGame(user.id, 'paste');
    await analysesRepo.insertQueued(db, game.id);
    await insertGame(user.id, 'vs_bot');

    const quota = await getImportQuota(db, user.id);

    expect(quota.daily.used).toBe(1);
    expect(quota.weekly.used).toBe(2);
    expect(quota.inFlight.used).toBe(1);
    expect(quota.library.used).toBe(1);
  });
});
