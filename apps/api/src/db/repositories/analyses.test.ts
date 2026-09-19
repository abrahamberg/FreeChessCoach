import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { CandidateMoment } from '@freechesscoach/chess-analysis';
import { CoachingPlanSchema, type AnalysisStatus, type GameReport } from '@freechesscoach/shared';
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

describe('analyses repository — candidate moments and coaching plan storage', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  const FIXTURE_MOMENTS: CandidateMoment[] = [{ ply: 4, kind: 'user_mistake', cpLoss: 300 }];
  const FIXTURE_PLAN = CoachingPlanSchema.parse({
    gameSummary: 'A sharp game.',
    openingNote: 'Fine through the opening.',
    themes: ['king_safety'],
    connectionToHistory: 'First session together.',
    sessionGoal: 'Spot the pin before it costs a queen.',
    moments: [
      {
        ply: 4,
        kind: 'user_mistake',
        category: 'king_safety',
        whatHappened: 'Missed the mating idea.',
        socraticQuestion: 'What was your opponent threatening?',
        keyLine: 'Qxf7#',
        revealDepthPlies: 2
      }
    ]
  });

  async function makeGame() {
    const user = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Ann' });
    const game = await gamesRepo.insert(db, {
      userId: user.id,
      pgn: '1. e4 e5',
      source: 'paste',
      userColor: 'white',
      whiteName: null,
      blackName: null,
      result: null,
      timeControl: null,
      eco: null,
      playedAt: null
    });
    const analysis = await analysesRepo.insertQueued(db, game.id);
    return { gameId: game.id, analysisId: analysis.id };
  }

  test('storeCandidateMoments / findCandidateMomentsByGameId round-trip', async () => {
    const { gameId, analysisId } = await makeGame();
    expect(await analysesRepo.findCandidateMomentsByGameId(db, gameId)).toBeFalsy();

    await analysesRepo.storeCandidateMoments(db, analysisId, FIXTURE_MOMENTS);

    expect(await analysesRepo.findCandidateMomentsByGameId(db, gameId)).toEqual(FIXTURE_MOMENTS);
  });

  test('markReady sets status ready without touching coachingPlan', async () => {
    const { gameId, analysisId } = await makeGame();

    await analysesRepo.markReady(db, analysisId);

    const row = await db
      .selectFrom('analyses')
      .select(['status', 'coachingPlan', 'completedAt'])
      .where('id', '=', analysisId)
      .executeTakeFirstOrThrow();
    expect(row.status).toBe('ready');
    expect(row.coachingPlan).toBeFalsy();
    expect(row.completedAt).not.toBeNull();
    expect(await analysesRepo.findCoachingPlanByGameId(db, gameId)).toBeFalsy();
  });

  test('storeCoachingPlan sets the plan independent of status', async () => {
    const { gameId, analysisId } = await makeGame();

    await analysesRepo.storeCoachingPlan(db, analysisId, FIXTURE_PLAN);

    expect(await analysesRepo.findCoachingPlanByGameId(db, gameId)).toEqual(FIXTURE_PLAN);
    const row = await db.selectFrom('analyses').select('status').where('id', '=', analysisId).executeTakeFirstOrThrow();
    expect(row.status).toBe('queued');
  });
});

describe('analyses repository — markPaused / findPausedGameIdsForUser', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  async function makeGameForUser(userId: string) {
    const game = await gamesRepo.insert(db, {
      userId,
      pgn: '1. e4 e5',
      source: 'paste',
      userColor: 'white',
      whiteName: null,
      blackName: null,
      result: null,
      timeControl: null,
      eco: null,
      playedAt: null
    });
    const analysis = await analysesRepo.insertQueued(db, game.id);
    return { gameId: game.id, analysisId: analysis.id };
  }

  test('markPaused sets status paused and the error, leaving completedAt unset', async () => {
    const user = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Ann' });
    const { analysisId } = await makeGameForUser(user.id);
    await analysesRepo.updateStatus(db, analysisId, 'engine_running');
    await analysesRepo.incrementEvalsComputed(db, analysisId, 4);

    await analysesRepo.markPaused(db, analysisId, 'chess-api.com timed out after 20000ms');

    const row = await db
      .selectFrom('analyses')
      .select(['status', 'error', 'completedAt', 'evalsComputed'])
      .where('id', '=', analysisId)
      .executeTakeFirstOrThrow();
    expect(row.status).toBe('paused');
    expect(row.error).toBe('chess-api.com timed out after 20000ms');
    expect(row.completedAt).toBeNull();
    expect(row.evalsComputed).toBe(4);
  });

  test('findPausedGameIdsForUser returns only this user\'s paused games, not ready/failed/queued ones or another user\'s', async () => {
    const user = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Ben' });
    const otherUser = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Cara' });

    const paused = await makeGameForUser(user.id);
    await analysesRepo.markPaused(db, paused.analysisId, 'No tunnel connection');
    const ready = await makeGameForUser(user.id);
    await analysesRepo.markReady(db, ready.analysisId);
    await makeGameForUser(user.id); // left queued
    const otherUsersPaused = await makeGameForUser(otherUser.id);
    await analysesRepo.markPaused(db, otherUsersPaused.analysisId, 'No tunnel connection');

    const gameIds = await analysesRepo.findPausedGameIdsForUser(db, user.id);

    expect(gameIds).toEqual([paused.gameId]);
  });
});

describe('analyses repository — countInFlightForUser', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  async function makeAnalysis(userId: string, status: AnalysisStatus) {
    const game = await gamesRepo.insert(db, {
      userId,
      pgn: `1. e4 e5 ${crypto.randomUUID()}`,
      source: 'paste',
      userColor: 'white',
      whiteName: null,
      blackName: null,
      result: null,
      timeControl: null,
      eco: null,
      playedAt: null
    });
    const analysis = await analysesRepo.insertQueued(db, game.id);
    await analysesRepo.updateStatus(db, analysis.id, status);
  }

  test('counts queued, engine_running, planning and paused for that user only', async () => {
    const user = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Ann' });
    const other = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Bob' });
    for (const status of ['queued', 'engine_running', 'planning', 'paused'] as const) {
      await makeAnalysis(user.id, status);
    }
    await makeAnalysis(user.id, 'ready');
    await makeAnalysis(user.id, 'failed');
    await makeAnalysis(other.id, 'queued');

    expect(await analysesRepo.countInFlightForUser(db, user.id)).toBe(4);
    expect(await analysesRepo.countInFlightForUser(db, other.id)).toBe(1);
  });
});
