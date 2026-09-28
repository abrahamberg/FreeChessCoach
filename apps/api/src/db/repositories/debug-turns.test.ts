import { DEBUG_TURNS_MAX } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../../../test/helpers/db.js';
import type { Database } from '../schema.js';
import * as debugTurnsRepo from './debug-turns.js';
import * as gamesRepo from './games.js';
import * as sessionsRepo from './sessions.js';
import * as usersRepo from './users.js';

describe('debug-turns repository', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  async function seedSession(): Promise<string> {
    const user = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Ann' });
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
    return (await sessionsRepo.insert(db, { gameId: game.id, userId: user.id })).id;
  }

  test('each saved turn is logged, oldest first, keeping the last DEBUG_TURNS_MAX per session', async () => {
    const [mine, other] = [await seedSession(), await seedSession()];
    for (let turn = 1; turn <= DEBUG_TURNS_MAX + 2; turn++) await sessionsRepo.updateDebugSnapshot(db, mine, { turn });
    await sessionsRepo.updateDebugSnapshot(db, other, { turn: 'other' });

    const turns = await debugTurnsRepo.list(db, { sessionId: mine });
    expect(turns.map((each) => each.snapshot)).toEqual(Array.from({ length: DEBUG_TURNS_MAX }, (_, index) => ({ turn: index + 3 })));
    expect(turns[0]?.at).toEqual(expect.any(String));
    expect(await sessionsRepo.getDebugSnapshot(db, mine)).toEqual({ turn: DEBUG_TURNS_MAX + 2 });
    expect((await debugTurnsRepo.list(db, { sessionId: other })).map((each) => each.snapshot)).toEqual([{ turn: 'other' }]);
    expect(await debugTurnsRepo.list(db, { puzzleSessionId: mine })).toEqual([]);
  });
});
