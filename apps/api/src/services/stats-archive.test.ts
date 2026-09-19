import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import * as analysesRepo from '../db/repositories/analyses.js';
import * as gamesRepo from '../db/repositories/games.js';
import * as statsArchiveRepo from '../db/repositories/stats-archive.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';
import { gameReportFixture, makeReadyGame } from '../../test/helpers/stats-fixtures.js';
import { deleteAccount } from './account.js';
import { deleteEarliestImportedGames, deleteGameForUser, deleteGameKeepingStats } from './games.js';

describe('deleting a game banks its stats into the weekly archive', () => {
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

  function archive(userId: string) {
    return statsArchiveRepo.listForUser(db, userId, { since: null, speed: 'all' });
  }

  test('a deleted ready game leaves one row for its week and speed', async () => {
    const user = await newUser();
    const game = await makeReadyGame(db, user.id, { timeControl: '600+0', playedAt: new Date('2026-03-04T10:00:00Z') });

    await deleteGameForUser(db, game.id, user.id);

    const rows = await archive(user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ weekStart: '2026-03-02', speed: 'rapid' });
    expect(rows[0]?.bucket.games).toBe(1);
    expect(await gamesRepo.findById(db, game.id)).toBeUndefined();
  });

  test('two games in the same week and speed merge into one row', async () => {
    const user = await newUser();
    const first = await makeReadyGame(db, user.id, { playedAt: new Date('2026-03-03T10:00:00Z'), report: gameReportFixture({ accuracy: 60 }) });
    const second = await makeReadyGame(db, user.id, { playedAt: new Date('2026-03-06T10:00:00Z'), report: gameReportFixture({ accuracy: 80 }) });

    await deleteGameForUser(db, first.id, user.id);
    await deleteGameForUser(db, second.id, user.id);

    const rows = await archive(user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.bucket.games).toBe(2);
    expect(rows[0]?.bucket.opening.byOpening['Italian Game']?.accuracySum).toBe(140);
  });

  test('games in different weeks or speeds land in separate rows', async () => {
    const user = await newUser();
    const rapidWeekOne = await makeReadyGame(db, user.id, { timeControl: '600+0', playedAt: new Date('2026-03-03T10:00:00Z') });
    const rapidWeekTwo = await makeReadyGame(db, user.id, { timeControl: '600+0', playedAt: new Date('2026-03-10T10:00:00Z') });
    const blitzWeekOne = await makeReadyGame(db, user.id, { timeControl: '180+0', playedAt: new Date('2026-03-03T10:00:00Z') });

    for (const game of [rapidWeekOne, rapidWeekTwo, blitzWeekOne]) await deleteGameForUser(db, game.id, user.id);

    expect((await archive(user.id)).map((row) => `${row.weekStart}/${row.speed}`)).toEqual([
      '2026-03-02/blitz',
      '2026-03-02/rapid',
      '2026-03-09/rapid'
    ]);
  });

  test('a game with no playedAt is filed under the week it was created', async () => {
    const user = await newUser();
    const game = await makeReadyGame(db, user.id, { playedAt: null });

    await deleteGameForUser(db, game.id, user.id);

    const [row] = await archive(user.id);
    expect(row?.weekStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(row?.bucket.games).toBe(1);
  });

  test('games that never appear on the dashboard leave nothing behind', async () => {
    const user = await newUser();
    const noReport = await gamesRepo.insert(db, {
      userId: user.id, pgn: '1. e4 a', source: 'paste', userColor: 'white', whiteName: null, blackName: null,
      result: '1-0', timeControl: '600+0', eco: null, playedAt: null
    });
    await analysesRepo.insertQueued(db, noReport.id);

    const failed = await makeReadyGame(db, user.id);
    const failedAnalysis = await analysesRepo.findByGameId(db, failed.id);
    await analysesRepo.markFailed(db, failedAnalysis?.id as string, 'engine exploded');

    const stale = await makeReadyGame(db, user.id);
    const staleAnalysis = await analysesRepo.findByGameId(db, stale.id);
    await analysesRepo.storeGameReport(db, staleAnalysis?.id as string, { marker: 'old shape' } as never);

    const coach = await gamesRepo.insert(db, {
      userId: user.id, pgn: '', source: 'coach_play', userColor: 'white', whiteName: null, blackName: null,
      result: null, timeControl: null, eco: null, playedAt: null
    });

    for (const game of [noReport, failed, stale, coach]) await deleteGameForUser(db, game.id, user.id);

    expect(await archive(user.id)).toEqual([]);
    expect(await gamesRepo.listIdsByUserId(db, user.id)).toEqual([]);
  });

  test('deleteEarliestImportedGames banks every game it removes', async () => {
    const user = await newUser();
    for (let day = 3; day <= 5; day++) await makeReadyGame(db, user.id, { playedAt: new Date(`2026-03-0${day}T10:00:00Z`) });

    await deleteEarliestImportedGames(db, user.id, 2);

    const rows = await archive(user.id);
    expect(rows.reduce((total, row) => total + row.bucket.games, 0)).toBe(2);
  });

  test('deleteGameKeepingStats writes on the caller\'s transaction: a rollback undoes the archive write and the delete', async () => {
    const user = await newUser();
    const game = await makeReadyGame(db, user.id);

    await expect(
      db.transaction().execute(async (trx) => {
        await deleteGameKeepingStats(trx, user.id, game.id);
        throw new Error('boom after the delete');
      })
    ).rejects.toThrow('boom after the delete');

    expect(await archive(user.id)).toEqual([]);
    expect(await gamesRepo.findById(db, game.id)).toBeDefined();
  });

  test('deleting the account wipes the archive too — it does not bank', async () => {
    const user = await newUser();
    const deleted = await makeReadyGame(db, user.id);
    await deleteGameForUser(db, deleted.id, user.id);
    await makeReadyGame(db, user.id);
    expect(await archive(user.id)).toHaveLength(1);

    await deleteAccount(db, user.id);

    expect(await archive(user.id)).toEqual([]);
    expect(await usersRepo.findById(db, user.id)).toBeUndefined();
  });
});
