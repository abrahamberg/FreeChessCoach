import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { buildApp } from '../app.js';
import * as analysesRepo from '../db/repositories/analyses.js';
import * as gamesRepo from '../db/repositories/games.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';

describe('GET /api/users/me/stats', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  test('an empty-state user gets the all-null empty dashboard shape', async () => {
    await usersRepo.insert(db, { email: 'fresh-stats@example.com', displayName: 'Fresh' });
    const app = buildApp({ authMode: 'proxy', db });

    const response = await app.inject({
      method: 'GET',
      url: '/api/users/me/stats',
      headers: { 'x-auth-request-email': 'fresh-stats@example.com', 'x-auth-request-user': 'Fresh' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      gamesAnalyzed: 0,
      opening: { averageBookMoves: null, performanceByOpening: [] },
      endgame: { overallAccuracy: null, byStanding: [], byTheme: [] }
    });
  });

  test('rejects an unrecognised range value as 400', async () => {
    await usersRepo.insert(db, { email: 'bad-range-stats@example.com', displayName: 'Bad' });
    const app = buildApp({ authMode: 'proxy', db });

    const response = await app.inject({
      method: 'GET',
      url: '/api/users/me/stats?range=last90',
      headers: { 'x-auth-request-email': 'bad-range-stats@example.com', 'x-auth-request-user': 'Bad' }
    });

    expect(response.statusCode).toBe(400);
  });

  test('rejects requests with no auth headers as 401', async () => {
    const app = buildApp({ authMode: 'proxy', db });
    const response = await app.inject({ method: 'GET', url: '/api/users/me/stats' });
    expect(response.statusCode).toBe(401);
  });

  test('defaults to speed=rapid, excluding a bullet game from the count', async () => {
    const user = await usersRepo.insert(db, { email: 'rapid-default-stats@example.com', displayName: 'Rapid' });
    const game = await gamesRepo.insert(db, {
      userId: user.id,
      pgn: '1. e4 e5',
      source: 'lichess',
      userColor: 'white',
      whiteName: 'Rapid',
      blackName: 'Bob',
      result: '1-0',
      timeControl: '60+0',
      eco: null,
      playedAt: null
    });
    const analysis = await analysesRepo.insertQueued(db, game.id);
    await analysesRepo.storeGameReport(db, analysis.id, { marker: 'x' } as never);
    await analysesRepo.updateStatus(db, analysis.id, 'ready');

    const app = buildApp({ authMode: 'proxy', db });
    const response = await app.inject({
      method: 'GET',
      url: '/api/users/me/stats',
      headers: { 'x-auth-request-email': 'rapid-default-stats@example.com', 'x-auth-request-user': 'Rapid' }
    });

    expect(response.json().gamesAnalyzed).toBe(0);
  });
});
