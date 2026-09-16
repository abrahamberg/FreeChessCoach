import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../../../test/helpers/db.js';
import type { Database } from '../schema.js';
import * as diagnosticObservationsRepo from './diagnostic-observations.js';
import type { NewDiagnosticObservation } from './diagnostic-observations.js';
import * as gamesRepo from './games.js';
import * as usersRepo from './users.js';

describe('diagnostic-observations repository (Task 56.2)', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  async function makeUser() {
    return usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Ann' });
  }

  async function makeGame(userId: string) {
    return gamesRepo.insert(db, {
      userId,
      pgn: '1. e4 e5',
      source: 'lichess',
      userColor: 'white',
      whiteName: 'Ann',
      blackName: 'Bob',
      result: '1-0',
      timeControl: '600+0',
      eco: 'C50',
      playedAt: null
    });
  }

  function observation(userId: string, gameId: string, overrides: Partial<NewDiagnosticObservation> = {}): NewDiagnosticObservation {
    return {
      userId,
      gameId,
      ply: 12,
      code: 'TA-07',
      direction: 'D',
      failed: true,
      hwdl: 0.42,
      severity: 'meaningful',
      reachability: 0.7,
      ...overrides
    };
  }

  test('insertMany persists observations retrievable by user and by game', async () => {
    const user = await makeUser();
    const game = await makeGame(user.id);

    await diagnosticObservationsRepo.insertMany(db, [observation(user.id, game.id), observation(user.id, game.id, { ply: 20 })]);

    const forUser = await diagnosticObservationsRepo.listForUserSince(db, user.id, new Date(Date.now() - 60_000));
    expect(forUser).toHaveLength(2);
    expect(forUser.map((row) => row.ply).sort()).toEqual([12, 20]);

    const forGame = await diagnosticObservationsRepo.listForGame(db, game.id);
    expect(forGame).toHaveLength(2);
  });

  test('insertMany is a no-op for an empty array', async () => {
    await expect(diagnosticObservationsRepo.insertMany(db, [])).resolves.toBeUndefined();
  });

  test('listForUserSince excludes observations before the cutoff', async () => {
    const user = await makeUser();
    const game = await makeGame(user.id);
    await diagnosticObservationsRepo.insertMany(db, [observation(user.id, game.id)]);

    const future = new Date(Date.now() + 60_000);
    const rows = await diagnosticObservationsRepo.listForUserSince(db, user.id, future);

    expect(rows).toEqual([]);
  });

  test('deleteByGameId removes only that game\'s observations', async () => {
    const user = await makeUser();
    const gameA = await makeGame(user.id);
    const gameB = await makeGame(user.id);
    await diagnosticObservationsRepo.insertMany(db, [observation(user.id, gameA.id), observation(user.id, gameB.id)]);

    await diagnosticObservationsRepo.deleteByGameId(db, gameA.id);

    expect(await diagnosticObservationsRepo.listForGame(db, gameA.id)).toEqual([]);
    expect(await diagnosticObservationsRepo.listForGame(db, gameB.id)).toHaveLength(1);
  });
});
