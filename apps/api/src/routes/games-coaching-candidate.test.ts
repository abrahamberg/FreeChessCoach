import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { MAX_IN_FLIGHT_IMPORTS } from '@freechesscoach/shared';
import { buildApp } from '../app.js';
import { buildResolveEngineBackendOptions, type CoachAgentBaseDependencies } from '../bootstrap.js';
import * as analysesRepo from '../db/repositories/analyses.js';
import * as gamesRepo from '../db/repositories/games.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';
import type { JobQueue } from '../jobs/queue.js';
import { createMemoryLlmUnlockStore } from '../llm/unlock-store.js';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';
import { gameReportFixture, makeReadyGame } from '../../test/helpers/stats-fixtures.js';

const URL = '/api/games/coaching-candidate';

describe('GET /api/games/coaching-candidate', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  function buildTestApp() {
    const jobQueue: JobQueue = {
      enqueueAnalyzeGame: vi.fn().mockResolvedValue(undefined),
      enqueueSummarizeSession: vi.fn().mockResolvedValue(undefined),
      enqueueBackfillGameMetadata: vi.fn().mockResolvedValue(undefined),
      enqueueRebuildDiagnosticProfile: vi.fn().mockResolvedValue(undefined)
    };
    const coachAgentBaseDeps: CoachAgentBaseDependencies = {
      db,
      jobQueue,
      gatewayConfig: { unlockStore: createMemoryLlmUnlockStore({ pepper: 'candidate-test', ttlSeconds: 60 }) }
    };
    const engineBackendOptions = buildResolveEngineBackendOptions(db, 'http://engine:4001', { request: vi.fn() }, null);
    return buildApp({ authMode: 'proxy', db, jobQueue, coachAgentBaseDeps, engineBackendOptions });
  }

  async function userWithHeaders() {
    const email = `${crypto.randomUUID()}@example.com`;
    const user = await usersRepo.insert(db, { email, displayName: 'Ann' });
    return { user, headers: { 'x-auth-request-email': email, 'x-auth-request-user': 'Ann' } };
  }

  function candidateFor(app: ReturnType<typeof buildTestApp>, headers: Record<string, string>, gameIds: string[]) {
    return app.inject({ method: 'GET', url: `${URL}?gameIds=${gameIds.join(',')}`, headers });
  }

  const tactics = (opportunities: number, found: number) => gameReportFixture({ fork: { opportunities, found } });

  test('returns the game with the most tactical points, and why', async () => {
    const app = buildTestApp();
    const { user, headers } = await userWithHeaders();
    const quiet = await makeReadyGame(db, user.id, { report: tactics(1, 1) });
    const busy = await makeReadyGame(db, user.id, { report: tactics(5, 1) });

    const response = await candidateFor(app, headers, [quiet.id, busy.id]);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      candidate: { gameId: busy.id, points: 4, topMotifs: [{ motif: 'fork', missed: 4, allowed: 0 }] }
    });
  });

  test("ignores ids that belong to another user — even when their game would win", async () => {
    const app = buildTestApp();
    const { user, headers } = await userWithHeaders();
    const other = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Bob' });
    const mine = await makeReadyGame(db, user.id, { report: tactics(1, 0) });
    const theirs = await makeReadyGame(db, other.id, { report: tactics(9, 0) });

    const response = await candidateFor(app, headers, [mine.id, theirs.id]);

    expect(response.json().candidate.gameId).toBe(mine.id);
  });

  test('ignores games whose analysis is not ready', async () => {
    const app = buildTestApp();
    const { user, headers } = await userWithHeaders();
    const ready = await makeReadyGame(db, user.id, { report: tactics(1, 0) });
    const pending = await makeReadyGame(db, user.id, { report: tactics(9, 0) });
    const pendingAnalysis = await analysesRepo.findByGameId(db, pending.id);
    await analysesRepo.updateStatus(db, pendingAnalysis?.id as string, 'engine_running');
    const failed = await makeReadyGame(db, user.id, { report: tactics(9, 0) });
    const failedAnalysis = await analysesRepo.findByGameId(db, failed.id);
    await analysesRepo.markFailed(db, failedAnalysis?.id as string, 'boom');

    const response = await candidateFor(app, headers, [ready.id, pending.id, failed.id]);

    expect(response.json().candidate.gameId).toBe(ready.id);
  });

  test('no eligible game gives a null candidate', async () => {
    const app = buildTestApp();
    const { user, headers } = await userWithHeaders();
    const notAnalyzed = await gamesRepo.insert(db, {
      userId: user.id, pgn: '1. e4', source: 'paste', userColor: 'white', whiteName: null, blackName: null,
      result: null, timeControl: null, eco: null, playedAt: null
    });

    const response = await candidateFor(app, headers, [notAnalyzed.id, crypto.randomUUID()]);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ candidate: null });
  });

  test('rejects a missing, malformed or oversized id list', async () => {
    const app = buildTestApp();
    const { headers } = await userWithHeaders();

    expect((await app.inject({ method: 'GET', url: URL, headers })).statusCode).toBe(400);
    expect((await candidateFor(app, headers, ['not-a-uuid'])).statusCode).toBe(400);
    const tooMany = Array.from({ length: MAX_IN_FLIGHT_IMPORTS + 1 }, () => crypto.randomUUID());
    expect((await candidateFor(app, headers, tooMany)).statusCode).toBe(400);
  });
});
