import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { buildApp } from '../app.js';
import * as sessionsRepo from '../db/repositories/sessions.js';
import type { Database } from '../db/schema.js';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';

describe('GET/PATCH /api/users/me', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  const authHeaders = { 'x-auth-request-email': 'ann@example.com', 'x-auth-request-user': 'Ann' };

  test('GET creates the user on first call, with the default profile', async () => {
    const app = buildApp({ authMode: 'proxy', db });

    const response = await app.inject({ method: 'GET', url: '/api/users/me', headers: authHeaders });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({
      email: 'ann@example.com',
      displayName: 'Ann',
      ratingBand: 'improving',
      coachPersona: 'general',
      lichessUsername: null,
      chesscomUsername: null,
      selfAssessment: null,
      ttsEnabled: false,
      ttsBackend: 'openai'
    });
    expect(typeof body.id).toBe('string');
  });

  test('GET a second time finds the same user', async () => {
    const app = buildApp({ authMode: 'proxy', db });
    const headers = { 'x-auth-request-email': 'bo@example.com', 'x-auth-request-user': 'Bo' };

    const first = await app.inject({ method: 'GET', url: '/api/users/me', headers });
    const second = await app.inject({ method: 'GET', url: '/api/users/me', headers });

    expect(first.json().id).toBe(second.json().id);
  });

  test('PATCH updates the rating band', async () => {
    const app = buildApp({ authMode: 'proxy', db });
    const headers = { 'x-auth-request-email': 'cleo@example.com', 'x-auth-request-user': 'Cleo' };
    await app.inject({ method: 'GET', url: '/api/users/me', headers });

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/users/me',
      headers,
      payload: { ratingBand: 'advanced' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().ratingBand).toBe('advanced');
  });

  test('PATCH updates the nickname (displayName)', async () => {
    const app = buildApp({ authMode: 'proxy', db });
    const headers = { 'x-auth-request-email': 'nick@example.com', 'x-auth-request-user': 'Nick' };
    await app.inject({ method: 'GET', url: '/api/users/me', headers });

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/users/me',
      headers,
      payload: { displayName: 'Nicky' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().displayName).toBe('Nicky');
  });

  test('PATCH rejects an empty/blank nickname as 400 problem+json', async () => {
    const app = buildApp({ authMode: 'proxy', db });
    const headers = { 'x-auth-request-email': 'blank@example.com', 'x-auth-request-user': 'Blank' };
    await app.inject({ method: 'GET', url: '/api/users/me', headers });

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/users/me',
      headers,
      payload: { displayName: '   ' }
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers['content-type']).toContain('application/problem+json');
  });

  test('PATCH updates and clears lichess/chesscom usernames', async () => {
    const app = buildApp({ authMode: 'proxy', db });
    const headers = { 'x-auth-request-email': 'linker@example.com', 'x-auth-request-user': 'Linker' };
    await app.inject({ method: 'GET', url: '/api/users/me', headers });

    const set = await app.inject({
      method: 'PATCH',
      url: '/api/users/me',
      headers,
      payload: { lichessUsername: 'linker_lichess', chesscomUsername: 'linker_cc' }
    });
    expect(set.statusCode).toBe(200);
    expect(set.json()).toMatchObject({ lichessUsername: 'linker_lichess', chesscomUsername: 'linker_cc' });

    const cleared = await app.inject({
      method: 'PATCH',
      url: '/api/users/me',
      headers,
      payload: { lichessUsername: null }
    });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json()).toMatchObject({ lichessUsername: null, chesscomUsername: 'linker_cc' });
  });

  test('PATCH rejects a rating band outside RATING_BANDS as 400 problem+json', async () => {
    const app = buildApp({ authMode: 'proxy', db });
    const headers = { 'x-auth-request-email': 'dee@example.com', 'x-auth-request-user': 'Dee' };
    await app.inject({ method: 'GET', url: '/api/users/me', headers });

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/users/me',
      headers,
      payload: { ratingBand: 'grandmaster' }
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers['content-type']).toContain('application/problem+json');
  });

  test('PATCH updates the coach persona', async () => {
    const app = buildApp({ authMode: 'proxy', db });
    const headers = { 'x-auth-request-email': 'gambit@example.com', 'x-auth-request-user': 'Gambit' };
    await app.inject({ method: 'GET', url: '/api/users/me', headers });

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/users/me',
      headers,
      payload: { coachPersona: 'gambler' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().coachPersona).toBe('gambler');
  });

  test('PATCH rejects a coach persona outside COACH_PERSONAS as 400 problem+json', async () => {
    const app = buildApp({ authMode: 'proxy', db });
    const headers = { 'x-auth-request-email': 'fae@example.com', 'x-auth-request-user': 'Fae' };
    await app.inject({ method: 'GET', url: '/api/users/me', headers });

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/users/me',
      headers,
      payload: { coachPersona: 'wizard' }
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers['content-type']).toContain('application/problem+json');
  });

  test('PATCH enables coach voice and switches its backend', async () => {
    const app = buildApp({ authMode: 'proxy', db });
    const headers = { 'x-auth-request-email': 'voice@example.com', 'x-auth-request-user': 'Voice' };
    await app.inject({ method: 'GET', url: '/api/users/me', headers });

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/users/me',
      headers,
      payload: { ttsEnabled: true, ttsBackend: 'browser' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ttsEnabled: true, ttsBackend: 'browser' });
  });

  test('PATCH rejects a ttsBackend outside TTS_BACKENDS as 400 problem+json', async () => {
    const app = buildApp({ authMode: 'proxy', db });
    const headers = { 'x-auth-request-email': 'voice-bad@example.com', 'x-auth-request-user': 'VoiceBad' };
    await app.inject({ method: 'GET', url: '/api/users/me', headers });

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/users/me',
      headers,
      payload: { ttsBackend: 'cassette' }
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers['content-type']).toContain('application/problem+json');
  });

  test('rejects requests with no auth headers as 401, without touching the db route logic', async () => {
    const app = buildApp({ authMode: 'proxy', db });

    const response = await app.inject({ method: 'GET', url: '/api/users/me' });

    expect(response.statusCode).toBe(401);
  });

  test('DELETE removes the account, 204, and a later request from the same identity starts fresh', async () => {
    const app = buildApp({ authMode: 'proxy', db });
    const headers = { 'x-auth-request-email': 'leaving@example.com', 'x-auth-request-user': 'Leaving' };
    const created = await app.inject({ method: 'GET', url: '/api/users/me', headers });
    const originalId = created.json().id;

    const response = await app.inject({ method: 'DELETE', url: '/api/users/me', headers });
    expect(response.statusCode).toBe(204);

    const refetched = await app.inject({ method: 'GET', url: '/api/users/me', headers });
    expect(refetched.statusCode).toBe(200);
    expect(refetched.json().id).not.toBe(originalId);
  });

  test('DELETE also clears the account\'s games, sessions, and findings', async () => {
    const app = buildApp({ authMode: 'proxy', db });
    const headers = { 'x-auth-request-email': 'full-delete@example.com', 'x-auth-request-user': 'FullDelete' };
    const created = await app.inject({ method: 'GET', url: '/api/users/me', headers });
    const userId = created.json().id;

    const imported = await app.inject({
      method: 'POST',
      url: '/api/games',
      headers,
      payload: { pgn: '1. e4 e5', source: 'paste', userColor: 'white' }
    });
    expect(imported.statusCode).toBe(200);
    const { gameId } = imported.json();
    // Session-cascade correctness itself is covered by services/account.test.ts;
    // this only needs a session on the books to prove the route wiring reaches
    // it — inserted directly rather than via POST /api/sessions, which needs
    // coachAgent dependencies this route-only buildApp() doesn't set up.
    const session = await sessionsRepo.insert(db, { gameId, userId });

    const response = await app.inject({ method: 'DELETE', url: '/api/users/me', headers });
    expect(response.statusCode).toBe(204);

    const games = await db.selectFrom('games').selectAll().where('id', '=', gameId).execute();
    expect(games).toHaveLength(0);
    const sessions = await db.selectFrom('sessions').selectAll().where('id', '=', session.id).execute();
    expect(sessions).toHaveLength(0);
  });
});
