import { describe, expect, test, beforeAll, afterAll } from 'vitest';
import type { Kysely } from 'kysely';
import { createTestDb, type TestDb } from '../../../test/helpers/db.js';
import * as usersRepo from './users.js';
import * as gamesRepo from './games.js';
import type { Database } from '../schema.js';

describe('games repository — play-mode additions', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  test('insert() accepts source "coach_play"', async () => {
    const user = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Ann' });
    const game = await gamesRepo.insert(db, {
      userId: user.id,
      pgn: '',
      source: 'coach_play',
      userColor: 'white',
      whiteName: null,
      blackName: null,
      result: null,
      timeControl: null,
      eco: null,
      playedAt: null
    });

    expect(game.source).toBe('coach_play');
  });

  test('findByUserAndPgn() finds a previously-imported game by its exact pgn text', async () => {
    const user = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Ann' });
    const game = await gamesRepo.insert(db, {
      userId: user.id,
      pgn: '1. e4 e5 2. Nf3',
      source: 'paste',
      userColor: 'white',
      whiteName: null,
      blackName: null,
      result: null,
      timeControl: null,
      eco: null,
      playedAt: null
    });

    const found = await gamesRepo.findByUserAndPgn(db, user.id, '1. e4 e5 2. Nf3');
    expect(found?.id).toBe(game.id);
  });

  test("findByUserAndPgn() never matches another user's game with the same pgn text", async () => {
    const owner = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Ann' });
    const other = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Bob' });
    await gamesRepo.insert(db, {
      userId: owner.id,
      pgn: '1. d4 d5',
      source: 'paste',
      userColor: 'white',
      whiteName: null,
      blackName: null,
      result: null,
      timeControl: null,
      eco: null,
      playedAt: null
    });

    const found = await gamesRepo.findByUserAndPgn(db, other.id, '1. d4 d5');
    expect(found).toBeUndefined();
  });

  test('updatePgn() overwrites the stored pgn and is readable via findById', async () => {
    const user = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Ann' });
    const game = await gamesRepo.insert(db, {
      userId: user.id,
      pgn: '',
      source: 'coach_play',
      userColor: 'white',
      whiteName: null,
      blackName: null,
      result: null,
      timeControl: null,
      eco: null,
      playedAt: null
    });

    await gamesRepo.updatePgn(db, game.id, '1. e4 e5 2. Nf3');

    const updated = await gamesRepo.findById(db, game.id);
    expect(updated?.pgn).toBe('1. e4 e5 2. Nf3');
  });
});
