import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { Kysely } from 'kysely';
import { emptyStatsBucket } from '@freechesscoach/chess-analysis';
import type { StatsBucket } from '@freechesscoach/shared';
import { createTestDb, type TestDb } from '../../../test/helpers/db.js';
import * as usersRepo from './users.js';
import * as statsArchiveRepo from './stats-archive.js';
import type { Database } from '../schema.js';

function bucketWithGames(games: number): StatsBucket {
  return { ...emptyStatsBucket(), games };
}

describe('stats-archive repository', () => {
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

  test('findForUpdate returns nothing for an unknown key and the stored bucket after an upsert', async () => {
    const user = await newUser();
    expect(await statsArchiveRepo.findForUpdate(db, user.id, '2026-03-02', 'rapid')).toBeUndefined();

    await statsArchiveRepo.upsert(db, { userId: user.id, weekStart: '2026-03-02', speed: 'rapid', bucket: bucketWithGames(2) });

    expect(await statsArchiveRepo.findForUpdate(db, user.id, '2026-03-02', 'rapid')).toEqual(bucketWithGames(2));
    expect(await statsArchiveRepo.findForUpdate(db, user.id, '2026-03-02', 'blitz')).toBeUndefined();
  });

  test('upsert is idempotent per (user, week, speed): the second write replaces the first', async () => {
    const user = await newUser();
    const key = { userId: user.id, weekStart: '2026-03-02', speed: 'rapid' as const };

    await statsArchiveRepo.upsert(db, { ...key, bucket: bucketWithGames(1) });
    await statsArchiveRepo.upsert(db, { ...key, bucket: bucketWithGames(5) });

    const rows = await statsArchiveRepo.listForUser(db, user.id, { since: null, speed: 'all' });
    expect(rows).toEqual([{ weekStart: '2026-03-02', speed: 'rapid', bucket: bucketWithGames(5) }]);
  });

  test('listForUser keeps weeks that overlap `since`, oldest first, and filters by speed', async () => {
    const user = await newUser();
    for (const [weekStart, speed] of [
      ['2026-02-23', 'rapid'],
      ['2026-03-02', 'rapid'],
      ['2026-03-02', 'blitz'],
      ['2026-03-09', 'rapid']
    ] as const) {
      await statsArchiveRepo.upsert(db, { userId: user.id, weekStart, speed, bucket: bucketWithGames(1) });
    }

    // 2026-03-05 falls inside the week starting 2026-03-02 (Mon–Sun), so that
    // week overlaps; the one starting 2026-02-23 ended 2026-03-01 and does not.
    const since = new Date('2026-03-05T12:00:00Z');
    const all = await statsArchiveRepo.listForUser(db, user.id, { since, speed: 'all' });
    expect(all.map((row) => `${row.weekStart}/${row.speed}`)).toEqual(['2026-03-02/blitz', '2026-03-02/rapid', '2026-03-09/rapid']);

    const rapidOnly = await statsArchiveRepo.listForUser(db, user.id, { since, speed: 'rapid' });
    expect(rapidOnly.map((row) => `${row.weekStart}/${row.speed}`)).toEqual(['2026-03-02/rapid', '2026-03-09/rapid']);

    expect(await statsArchiveRepo.listForUser(db, user.id, { since: null, speed: 'all' })).toHaveLength(4);
  });

  test("listForUser never returns another user's weeks", async () => {
    const user = await newUser();
    const other = await newUser();
    await statsArchiveRepo.upsert(db, { userId: other.id, weekStart: '2026-03-02', speed: 'rapid', bucket: bucketWithGames(1) });

    expect(await statsArchiveRepo.listForUser(db, user.id, { since: null, speed: 'all' })).toEqual([]);
  });

  test('deleteByUserId removes only that user\'s rows', async () => {
    const user = await newUser();
    const other = await newUser();
    await statsArchiveRepo.upsert(db, { userId: user.id, weekStart: '2026-03-02', speed: 'rapid', bucket: bucketWithGames(1) });
    await statsArchiveRepo.upsert(db, { userId: other.id, weekStart: '2026-03-02', speed: 'rapid', bucket: bucketWithGames(1) });

    await statsArchiveRepo.deleteByUserId(db, user.id);

    expect(await statsArchiveRepo.listForUser(db, user.id, { since: null, speed: 'all' })).toEqual([]);
    expect(await statsArchiveRepo.listForUser(db, other.id, { since: null, speed: 'all' })).toHaveLength(1);
  });
});
