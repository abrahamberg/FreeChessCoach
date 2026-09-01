import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import * as gamesRepo from '../db/repositories/games.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';
import { createBackfillGameMetadataTask } from './backfill-game-metadata.js';

const LICHESS_PGN = `[Event "Rated Blitz game"]
[White "Ann"]
[Black "Bob"]
[Result "1-0"]
[WhiteElo "1500"]
[BlackElo "1520"]
[TimeControl "300+0"]
[Termination "Normal"]

1. e4 { [%clk 0:05:00] } e5 { [%clk 0:05:00] } 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0`;

const NO_CLOCK_PGN = `[Event "Casual Blitz game"]
[White "Ann"]
[Black "Bob"]
[Result "1-0"]
[TimeControl "300+0"]

1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0`;

const UNPARSEABLE_PGN = 'this is not a pgn at all';

describe('createBackfillGameMetadataTask', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  async function insertLegacyGame(pgn: string): Promise<gamesRepo.GameRow> {
    const user = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Ann' });
    // moveTimes deliberately omitted — this is the "pre-0023 migration,
    // never backfilled" row shape the task's cursor targets.
    return gamesRepo.insert(db, {
      userId: user.id,
      pgn,
      source: 'paste',
      userColor: 'white',
      whiteName: 'Ann',
      blackName: 'Bob',
      result: '1-0',
      timeControl: '300+0',
      eco: null,
      playedAt: null
    });
  }

  test('backfills rating, termination and move times for a legacy row with clocks', async () => {
    const game = await insertLegacyGame(LICHESS_PGN);

    await createBackfillGameMetadataTask({ db })({}, {} as never);

    const row = await db.selectFrom('games').selectAll().where('id', '=', game.id).executeTakeFirstOrThrow();
    expect(row.whiteElo).toBe(1500);
    expect(row.blackElo).toBe(1520);
    expect(row.rated).toBe(true);
    expect(row.termination).toBe('Normal');
    expect(Array.isArray(row.moveTimes)).toBe(true);
    expect((row.moveTimes as unknown[]).length).toBeGreaterThan(0);
  });

  test('a legacy row with no PGN clock data gets an empty array, not left null (so it is never revisited)', async () => {
    const game = await insertLegacyGame(NO_CLOCK_PGN);

    await createBackfillGameMetadataTask({ db })({}, {} as never);

    const row = await db.selectFrom('games').selectAll().where('id', '=', game.id).executeTakeFirstOrThrow();
    expect(row.rated).toBe(false);
    expect(row.moveTimes).toEqual([]);
  });

  test('processes more rows than fit in one batch, via the id cursor', async () => {
    const games = await Promise.all([insertLegacyGame(NO_CLOCK_PGN), insertLegacyGame(NO_CLOCK_PGN), insertLegacyGame(NO_CLOCK_PGN)]);

    await createBackfillGameMetadataTask({ db, batchSize: 1 })({}, {} as never);

    for (const game of games) {
      const row = await db.selectFrom('games').selectAll().where('id', '=', game.id).executeTakeFirstOrThrow();
      expect(row.moveTimes).toEqual([]);
    }
  });

  test('one unparseable row is skipped (left null) without blocking the rest of the batch', async () => {
    const broken = await insertLegacyGame(UNPARSEABLE_PGN);
    const healthy = await insertLegacyGame(NO_CLOCK_PGN);

    await createBackfillGameMetadataTask({ db })({}, {} as never);

    const brokenRow = await db.selectFrom('games').selectAll().where('id', '=', broken.id).executeTakeFirstOrThrow();
    const healthyRow = await db.selectFrom('games').selectAll().where('id', '=', healthy.id).executeTakeFirstOrThrow();
    expect(brokenRow.moveTimes).toBeNull();
    expect(healthyRow.moveTimes).toEqual([]);
  });

  test('a row that already has move_times is skipped — re-running does not throw or reprocess it', async () => {
    const game = await insertLegacyGame(LICHESS_PGN);
    await createBackfillGameMetadataTask({ db })({}, {} as never);
    const firstPass = await db.selectFrom('games').selectAll().where('id', '=', game.id).executeTakeFirstOrThrow();

    await createBackfillGameMetadataTask({ db })({}, {} as never);
    const secondPass = await db.selectFrom('games').selectAll().where('id', '=', game.id).executeTakeFirstOrThrow();

    expect(secondPass.moveTimes).toEqual(firstPass.moveTimes);
  });
});
