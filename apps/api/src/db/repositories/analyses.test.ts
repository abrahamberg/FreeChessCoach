import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { GameReport } from '@freechesscoach/shared';
import { createTestDb, type TestDb } from '../../../test/helpers/db.js';
import type { Database } from '../schema.js';
import * as analysesRepo from './analyses.js';
import * as gamesRepo from './games.js';
import * as usersRepo from './users.js';

const FIXTURE_GAME_REPORT = { marker: 'stats-dashboard-fixture' } as unknown as GameReport;

describe('analyses repository — listReadyReportsForUser (Task 29.1)', () => {
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

  async function makeReadyGame(userId: string, overrides: Partial<Parameters<typeof gamesRepo.insert>[1]> = {}) {
    const game = await gamesRepo.insert(db, {
      userId,
      pgn: '1. e4 e5',
      source: 'lichess',
      userColor: 'white',
      whiteName: 'Ann',
      blackName: 'Bob',
      result: '1-0',
      timeControl: '600+0',
      eco: 'C50',
      playedAt: null,
      ...overrides
    });
    const analysis = await analysesRepo.insertQueued(db, game.id);
    await analysesRepo.storeGameReport(db, analysis.id, FIXTURE_GAME_REPORT);
    await analysesRepo.updateStatus(db, analysis.id, 'ready');
    return game;
  }

  test('returns a ready analysis for an imported game with no date filter', async () => {
    const user = await makeUser();
    await makeReadyGame(user.id);

    const rows = await analysesRepo.listReadyReportsForUser(db, user.id, null);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.gameReport).toEqual(FIXTURE_GAME_REPORT);
    expect(rows[0]?.pgnResult).toBe('1-0');
    expect(rows[0]?.userColor).toBe('white');
  });

  test('excludes analyses that are not yet ready', async () => {
    const user = await makeUser();
    const game = await gamesRepo.insert(db, {
      userId: user.id,
      pgn: '1. e4 e5',
      source: 'lichess',
      userColor: 'white',
      whiteName: null,
      blackName: null,
      result: null,
      timeControl: null,
      eco: null,
      playedAt: null
    });
    await analysesRepo.insertQueued(db, game.id);

    const rows = await analysesRepo.listReadyReportsForUser(db, user.id, null);

    expect(rows).toHaveLength(0);
  });

  test('excludes coach_play and vs_bot games — the dashboard is about imported opponent games', async () => {
    const user = await makeUser();
    await makeReadyGame(user.id, { source: 'coach_play' });

    const rows = await analysesRepo.listReadyReportsForUser(db, user.id, null);

    expect(rows).toHaveLength(0);
  });

  test('scopes to the given user — another user\'s ready game never leaks in', async () => {
    const user = await makeUser();
    const otherUser = await makeUser();
    await makeReadyGame(otherUser.id);

    const rows = await analysesRepo.listReadyReportsForUser(db, user.id, null);

    expect(rows).toHaveLength(0);
  });

  test('filters by playedAt, falling back to createdAt when playedAt is null', async () => {
    const user = await makeUser();
    const since = new Date('2026-01-01T00:00:00Z');
    await makeReadyGame(user.id, { playedAt: new Date('2025-01-01T00:00:00Z') });
    await makeReadyGame(user.id, { playedAt: new Date('2026-06-01T00:00:00Z') });
    await makeReadyGame(user.id, { playedAt: null });

    const rows = await analysesRepo.listReadyReportsForUser(db, user.id, since);

    expect(rows).toHaveLength(2);
  });
});
