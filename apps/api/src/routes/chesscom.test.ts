import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { buildApp } from '../app.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';
import type { ChesscomClient } from '../services/chesscom.js';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';

describe('GET /api/chesscom/recent-games', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  test('returns the linked user\'s recent games from the injected Chess.com client', async () => {
    await usersRepo.insert(db, { email: 'linked@example.com', displayName: 'Linked' });
    const user = await usersRepo.findByEmail(db, 'linked@example.com');
    await usersRepo.update(db, user!.id, { chesscomUsername: 'daniel_chesscom' });

    const fetchRecentGames = vi.fn().mockResolvedValue([
      {
        id: 'abcd1234',
        pgn: '1. e4 e5',
        whiteName: 'daniel_chesscom',
        blackName: 'Marta',
        result: '1-0',
        timeControl: '600',
        playedAt: '2026-07-20T10:00:00.000Z',
        rated: true,
        timeClass: 'rapid',
        whiteRating: 1500,
        blackRating: 1520
      }
    ]);
    const chesscomClient: ChesscomClient = { fetchRecentGames };
    const app = buildApp({ authMode: 'proxy', db, chesscomClient });

    const response = await app.inject({
      method: 'GET',
      url: '/api/chesscom/recent-games',
      headers: { 'x-auth-request-email': 'linked@example.com', 'x-auth-request-user': 'Linked' }
    });

    expect(response.statusCode).toBe(200);
    expect(fetchRecentGames).toHaveBeenCalledWith('daniel_chesscom');
    expect(response.json()).toEqual([
      {
        id: 'abcd1234',
        pgn: '1. e4 e5',
        whiteName: 'daniel_chesscom',
        blackName: 'Marta',
        result: '1-0',
        timeControl: '600',
        playedAt: '2026-07-20T10:00:00.000Z',
        rated: true,
        timeClass: 'rapid',
        whiteRating: 1500,
        blackRating: 1520
      }
    ]);
  });

  test('404s as problem+json when the user has no linked Chess.com username', async () => {
    const fetchRecentGames = vi.fn();
    const app = buildApp({ authMode: 'proxy', db, chesscomClient: { fetchRecentGames } });

    const response = await app.inject({
      method: 'GET',
      url: '/api/chesscom/recent-games',
      headers: { 'x-auth-request-email': 'unlinked@example.com', 'x-auth-request-user': 'Unlinked' }
    });

    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(fetchRecentGames).not.toHaveBeenCalled();
  });

  test('rejects requests with no auth headers as 401', async () => {
    const app = buildApp({ authMode: 'proxy', db, chesscomClient: { fetchRecentGames: vi.fn() } });
    const response = await app.inject({ method: 'GET', url: '/api/chesscom/recent-games' });
    expect(response.statusCode).toBe(401);
  });
});
