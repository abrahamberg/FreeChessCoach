import { describe, expect, test, beforeAll, afterAll, vi } from 'vitest';
import type { Kysely } from 'kysely';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';
import type { BotMoveSelectorDependencies } from './bot/bot-move-selector.js';
import { planCoachMove } from './coach-move-plan.js';
import { createPlaySession } from './play-session.js';

describe('planCoachMove', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  function selector(random: () => number): BotMoveSelectorDependencies {
    return { analyzeBotPosition: vi.fn().mockRejectedValue(new Error('no engine in this test')), random };
  }

  async function newUser(): Promise<string> {
    return (await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Ann' })).id;
  }

  test('no plan while it is the student to move', async () => {
    const userId = await newUser();
    const session = await createPlaySession(db, userId, 'white');
    expect(await planCoachMove({ db, selector: selector(Math.random) }, session.gameId, userId)).toBeNull();
  });

  test('the coach opens from the book at the default level, and the plan is kept for the position', async () => {
    const userId = await newUser();
    const session = await createPlaySession(db, userId, 'black');

    const first = await planCoachMove({ db, selector: selector(() => 0) }, session.gameId, userId);
    expect(first).toMatchObject({ kind: 'book', levelElo: 1200, targetElo: 1200, performanceElo: null, costWinPct: null });

    const again = await planCoachMove({ db, selector: selector(() => 0.99) }, session.gameId, userId);
    expect(again?.san).toBe(first?.san);
  });
});
