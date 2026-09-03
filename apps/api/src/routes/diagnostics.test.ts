import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { DiagnosticProfileEntry } from '@freechesscoach/chess-analysis';
import { buildApp } from '../app.js';
import * as diagnosticObservationsRepo from '../db/repositories/diagnostic-observations.js';
import * as diagnosticProfilesRepo from '../db/repositories/diagnostic-profiles.js';
import * as gamesRepo from '../db/repositories/games.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';

function profileEntryFixture(overrides: Partial<DiagnosticProfileEntry> = {}): DiagnosticProfileEntry {
  return {
    code: 'TA-07',
    direction: 'D',
    opportunities: 9,
    episodes: 6,
    failureRate: 6 / 9,
    posteriorMean: 0.6,
    credibleInterval: [0.4, 0.8],
    confidence: 'probable',
    spread: { games: 5, sessions: 3, openings: 3, sides: 2 },
    totalHwdl: 1.8,
    severityMix: { minor: 0, meaningful: 2, major: 4, decisive: 0 },
    meanReachability: 0.7,
    scopeTags: ['general'],
    controlSkill: { code: 'TA-07', direction: 'O', failureRate: 0.1 },
    historyStatus: 'persistent',
    ...overrides
  };
}

describe('diagnostics routes', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  async function seedUser(email: string) {
    return usersRepo.insert(db, { email, displayName: 'Ann' });
  }

  function authHeaders(email: string) {
    return { 'x-auth-request-email': email, 'x-auth-request-user': 'Ann' };
  }

  describe('GET /api/users/me/diagnostics', () => {
    test('a fresh user with no stored profile gets an empty response, not an error', async () => {
      const user = await seedUser('diag-fresh@example.com');
      const app = buildApp({ authMode: 'proxy', db });

      const response = await app.inject({
        method: 'GET',
        url: '/api/users/me/diagnostics',
        headers: authHeaders(user.email)
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        timeControl: null,
        windowStart: null,
        windowEnd: null,
        computedAt: null,
        entries: []
      });
    });

    test('with no timeControl given, returns the most recently computed profile across all time controls', async () => {
      const user = await seedUser('diag-latest@example.com');
      await diagnosticProfilesRepo.upsertProfile(db, user.id, '180+0', new Date(2026, 0, 1), new Date(2026, 0, 10), [
        profileEntryFixture({ code: 'BV-01' })
      ]);
      await diagnosticProfilesRepo.upsertProfile(db, user.id, '600+0', new Date(2026, 0, 1), new Date(2026, 0, 20), [
        profileEntryFixture({ code: 'TA-07' })
      ]);
      const app = buildApp({ authMode: 'proxy', db });

      const response = await app.inject({
        method: 'GET',
        url: '/api/users/me/diagnostics',
        headers: authHeaders(user.email)
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.timeControl).toBe('600+0');
      expect(body.entries).toHaveLength(1);
      expect(body.entries[0]).toMatchObject({ code: 'TA-07', label: expect.any(String) });
    });

    test('?timeControl= picks that pool specifically, resolves the code label, and reports data-quality gates fired against the live window', async () => {
      const user = await seedUser('diag-gates@example.com');
      await diagnosticProfilesRepo.upsertProfile(db, user.id, '600+0', new Date(2026, 0, 1), new Date(2026, 0, 30), [
        profileEntryFixture({ code: 'TA-07', confidence: 'probable' }),
        profileEntryFixture({ code: 'BV-01', confidence: 'insufficient' })
      ]);
      const app = buildApp({ authMode: 'proxy', db });

      const response = await app.inject({
        method: 'GET',
        url: '/api/users/me/diagnostics?timeControl=600%2B0',
        headers: authHeaders(user.email)
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.timeControl).toBe('600+0');
      // Sorted probable-then-insufficient (confidence rank), same order as
      // the coach tool's "top diagnoses" ranking.
      expect(body.entries.map((e: { code: string }) => e.code)).toEqual(['TA-07', 'BV-01']);
      expect(body.entries[0].label).not.toBe('TA-07');
      // No games seeded for this window at all -> DQ-01 always fires.
      expect(body.entries[0].firedGates.some((g: { code: string }) => g.code === 'DQ-01')).toBe(true);
      expect(body.entries[0].firedGates[0].label).toEqual(expect.any(String));
    });

    test('?timeControl= for a pool with no stored profile yet returns an empty response echoing that timeControl', async () => {
      const user = await seedUser('diag-empty-pool@example.com');
      const app = buildApp({ authMode: 'proxy', db });

      const response = await app.inject({
        method: 'GET',
        url: '/api/users/me/diagnostics?timeControl=900%2B10',
        headers: authHeaders(user.email)
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        timeControl: '900+10',
        windowStart: null,
        windowEnd: null,
        computedAt: null,
        entries: []
      });
    });
  });

  describe('GET /api/users/me/diagnostics/:code/evidence', () => {
    test('a malformed code returns 400', async () => {
      const user = await seedUser('diag-ev-bad@example.com');
      const app = buildApp({ authMode: 'proxy', db });

      const response = await app.inject({
        method: 'GET',
        url: '/api/users/me/diagnostics/not-a-code/evidence',
        headers: authHeaders(user.email)
      });

      expect(response.statusCode).toBe(400);
    });

    test('a well-formed code that is not in the catalog returns 404', async () => {
      const user = await seedUser('diag-ev-unknown@example.com');
      const app = buildApp({ authMode: 'proxy', db });

      const response = await app.inject({
        method: 'GET',
        url: '/api/users/me/diagnostics/ZZ-99/evidence',
        headers: authHeaders(user.email)
      });

      expect(response.statusCode).toBe(404);
    });

    test('returns this user\'s observations for the code, newest first, never another user\'s', async () => {
      const user = await seedUser('diag-ev-owner@example.com');
      const otherUser = await seedUser('diag-ev-other@example.com');
      const game = await gamesRepo.insert(db, {
        userId: user.id,
        pgn: '1. e4 e5',
        source: 'paste',
        userColor: 'white',
        whiteName: null,
        blackName: null,
        result: null,
        timeControl: '600+0',
        eco: null,
        playedAt: null
      });
      await diagnosticObservationsRepo.insertMany(db, [
        {
          userId: user.id,
          gameId: game.id,
          ply: 10,
          code: 'TA-07',
          direction: 'D',
          failed: true,
          hwdl: 0.8,
          severity: 'major',
          reachability: 0.7,
          detail: null
        },
        {
          userId: otherUser.id,
          gameId: game.id,
          ply: 12,
          code: 'TA-07',
          direction: 'D',
          failed: true,
          hwdl: 0.5,
          severity: 'minor',
          reachability: 0.7,
          detail: null
        }
      ]);
      const app = buildApp({ authMode: 'proxy', db });

      const response = await app.inject({
        method: 'GET',
        url: '/api/users/me/diagnostics/TA-07/evidence',
        headers: authHeaders(user.email)
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.code).toBe('TA-07');
      expect(body.label).toEqual(expect.any(String));
      expect(body.items).toHaveLength(1);
      expect(body.items[0]).toMatchObject({ gameId: game.id, ply: 10, severity: 'major' });
    });

    test('a code with no observations yet returns an empty items list, not an error', async () => {
      const user = await seedUser('diag-ev-empty@example.com');
      const app = buildApp({ authMode: 'proxy', db });

      const response = await app.inject({
        method: 'GET',
        url: '/api/users/me/diagnostics/TA-07/evidence',
        headers: authHeaders(user.email)
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().items).toEqual([]);
    });
  });
});
