import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { AUTO_DELETE_BATCH, MAX_LIBRARY_GAMES } from '@freechesscoach/shared';
import * as gamesRepo from '../db/repositories/games.js';
import * as statsArchiveRepo from '../db/repositories/stats-archive.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';
import type { JobQueue } from '../jobs/queue.js';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';
import { makeReadyGame } from '../../test/helpers/stats-fixtures.js';
import { importGame } from './game-import.js';
import { getImportQuota } from './import-quota.js';

const PGN = `[Event "Test"]
[White "Ann"]
[Black "Bob"]
[Result "1-0"]

1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0`;

const USERNAMES = { displayName: 'Ann' };

describe('importGame — library cap and auto-delete', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;
  const jobQueue: JobQueue = {
    enqueueAnalyzeGame: vi.fn().mockResolvedValue(undefined),
    enqueueSummarizeSession: vi.fn().mockResolvedValue(undefined),
    enqueueBackfillGameMetadata: vi.fn().mockResolvedValue(undefined),
    enqueueRebuildDiagnosticProfile: vi.fn().mockResolvedValue(undefined)
  };

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

  /** Bulk-seeds `count` games of `source`, the i-th created i minutes ago —
   * so the highest i is the earliest. Bypasses the ledger on purpose: this is
   * a library that already exists, not a run of imports. */
  async function seedGames(userId: string, count: number, source: 'paste' | 'coach_play' = 'paste'): Promise<void> {
    await sql`
      INSERT INTO games (user_id, pgn, source, user_color, created_at)
      SELECT ${userId}::uuid, ${source} || ' seeded ' || g, ${source}, 'white', now() - (g || ' minutes')::interval - interval '1 day'
      FROM generate_series(1, ${count}::int) g
    `.execute(db);
  }

  let round = 0;
  function importOne(userId: string, overrides: { pgn?: string } = {}) {
    round += 1;
    const pgn = overrides.pgn ?? PGN.replace('[Event "Test"]', `[Event "Test"]\n[Round "lib-${round}"]`);
    return importGame(db, jobQueue, userId, USERNAMES, { pgn, source: 'paste', userColor: 'white', deferAnalysis: true });
  }

  function importableCount(userId: string): Promise<number> {
    return gamesRepo.countImportableForUser(db, userId);
  }

  test('countImportableForUser counts the four importable sources, never bot or coach games', async () => {
    const user = await newUser();
    await seedGames(user.id, 3, 'paste');
    await seedGames(user.id, 4, 'coach_play');

    expect(await importableCount(user.id)).toBe(3);
  });

  test('at the cap, the next import deletes the 50 earliest games first and then lands', async () => {
    const user = await newUser();
    await seedGames(user.id, MAX_LIBRARY_GAMES);
    const earliest = await gamesRepo.listEarliestImportedIds(db, user.id, AUTO_DELETE_BATCH);

    const imported = await importOne(user.id);

    expect(await importableCount(user.id)).toBe(MAX_LIBRARY_GAMES - AUTO_DELETE_BATCH + 1);
    for (const gameId of earliest) expect(await gamesRepo.findById(db, gameId)).toBeUndefined();
    expect(await gamesRepo.findById(db, imported.gameId)).toBeDefined();
  }, 60000);

  test('one game under the cap, nothing is deleted', async () => {
    const user = await newUser();
    await seedGames(user.id, MAX_LIBRARY_GAMES - 1);

    await importOne(user.id);

    expect(await importableCount(user.id)).toBe(MAX_LIBRARY_GAMES);
  }, 60000);

  test('bot and coach games are neither counted toward the cap nor deleted by it', async () => {
    const user = await newUser();
    await seedGames(user.id, MAX_LIBRARY_GAMES - 1);
    await seedGames(user.id, 60, 'coach_play');

    await importOne(user.id);

    const coachGames = await db.selectFrom('games').select('id').where('userId', '=', user.id).where('source', '=', 'coach_play').execute();
    expect(coachGames).toHaveLength(60);
    expect(await importableCount(user.id)).toBe(MAX_LIBRARY_GAMES);
  }, 60000);

  test('a duplicate PGN never triggers a deletion', async () => {
    const user = await newUser();
    await seedGames(user.id, MAX_LIBRARY_GAMES - 1);
    const pgn = PGN.replace('[Event "Test"]', '[Event "Test"]\n[Round "dup"]');
    const first = await importOne(user.id, { pgn });
    expect(await importableCount(user.id)).toBe(MAX_LIBRARY_GAMES);

    const again = await importOne(user.id, { pgn });

    expect(again.gameId).toBe(first.gameId);
    expect(await importableCount(user.id)).toBe(MAX_LIBRARY_GAMES);
  }, 60000);

  test('an invalid PGN never deletes anything', async () => {
    const user = await newUser();
    await seedGames(user.id, MAX_LIBRARY_GAMES);

    await expect(importOne(user.id, { pgn: '1. e4 e5 2. Zz9 garbage' })).rejects.toThrow();

    expect(await importableCount(user.id)).toBe(MAX_LIBRARY_GAMES);
  }, 60000);

  test('the deletion and the insert are one transaction: a failing insert rolls the deletion back', async () => {
    const user = await newUser();
    await seedGames(user.id, MAX_LIBRARY_GAMES);

    // The source CHECK constraint rejects this at insert time, after the
    // auto-delete has already run inside the same transaction.
    await expect(
      importGame(db, jobQueue, user.id, USERNAMES, { pgn: PGN, source: 'bogus' as never, userColor: 'white', deferAnalysis: true })
    ).rejects.toThrow();

    expect(await importableCount(user.id)).toBe(MAX_LIBRARY_GAMES);
  }, 60000);

  test('the stats of auto-deleted games are banked, not lost', async () => {
    const user = await newUser();
    await seedGames(user.id, MAX_LIBRARY_GAMES - 1);
    // Older than every seeded game, so it is the first one the auto-delete takes.
    const analyzed = await makeReadyGame(db, user.id);
    await db.updateTable('games').set({ createdAt: new Date('2020-01-01T00:00:00Z') }).where('id', '=', analyzed.id).execute();

    await importOne(user.id);

    expect(await gamesRepo.findById(db, analyzed.id)).toBeUndefined();
    const archived = await statsArchiveRepo.listForUser(db, user.id, { since: null, speed: 'all' });
    expect(archived.reduce((total, week) => total + week.bucket.games, 0)).toBe(1);
  }, 60000);

  test('a batch of 10 starting at 995 fills to 1000, the 6th import auto-deletes, 7–10 land normally', async () => {
    const user = await newUser();
    await seedGames(user.id, MAX_LIBRARY_GAMES - 5);

    for (let i = 1; i <= 5; i++) await importOne(user.id);
    expect(await importableCount(user.id)).toBe(MAX_LIBRARY_GAMES);

    await importOne(user.id); // the 6th
    expect(await importableCount(user.id)).toBe(MAX_LIBRARY_GAMES - AUTO_DELETE_BATCH + 1);

    for (let i = 7; i <= 10; i++) await importOne(user.id);
    expect(await importableCount(user.id)).toBe(MAX_LIBRARY_GAMES - AUTO_DELETE_BATCH + 5);
  }, 60000);

  test('the quota reports how many games the next import would delete', async () => {
    const user = await newUser();
    await seedGames(user.id, MAX_LIBRARY_GAMES - 1);
    expect((await getImportQuota(db, user.id)).library).toEqual({ used: MAX_LIBRARY_GAMES - 1, limit: MAX_LIBRARY_GAMES, autoDeleteCount: 0 });

    await importOne(user.id);

    expect((await getImportQuota(db, user.id)).library).toEqual({ used: MAX_LIBRARY_GAMES, limit: MAX_LIBRARY_GAMES, autoDeleteCount: AUTO_DELETE_BATCH });
  }, 60000);
});
