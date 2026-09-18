import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type { EngineEval, PositionAnalysis } from '@freechesscoach/shared';
import * as analysesRepo from '../db/repositories/analyses.js';
import * as gamesRepo from '../db/repositories/games.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';
import { ValidationError } from '../lib/errors.js';
import { createMemoryLlmUnlockStore } from '../llm/unlock-store.js';
import type { GatewayConfig } from '../llm/gateway.js';
import { runAnalyzeGameJob, type AnalysisJobDependencies } from './analysis.js';
import { ensureCoachingPlan } from './coaching-plan.js';

const PGN = `[Event "Test"]
[White "Ann"]
[Black "Bob"]
[Result "1-0"]

1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0`;

async function makeEval(fen: string): Promise<EngineEval> {
  return { ply: 0, fen, depth: 10, lines: [{ moveUci: 'e2e4', moveSan: 'e4', cp: 20, mateIn: null }] };
}

function fakeAnalyzePosition(): AnalysisJobDependencies['analyzePosition'] {
  return vi.fn().mockResolvedValue({
    fen: '',
    depth: 10,
    multiPv: 0,
    bestMove: '',
    eval: { cp: 0, mateIn: null },
    lines: [],
    features: {} as PositionAnalysis['features']
  });
}

describe('ensureCoachingPlan', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  // A fully engine-analyzed game (mirrors what runAnalyzeGameJob's own tests
  // set up) — the same fixture every test below starts from, so
  // ensureCoachingPlan always has real gameReport/candidateMoments to read,
  // never hand-crafted ones that could drift from the real shape.
  async function setupAnalyzedGame(): Promise<{ gameId: string; userId: string }> {
    const user = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Ann' });
    const game = await gamesRepo.insert(db, {
      userId: user.id,
      pgn: PGN,
      source: 'paste',
      userColor: 'white',
      whiteName: 'Ann',
      blackName: 'Bob',
      result: '1-0',
      timeControl: null,
      eco: null,
      playedAt: null
    });
    await analysesRepo.insertQueued(db, game.id);
    const deps: AnalysisJobDependencies = {
      analyzeGamePositions: vi.fn(async (fens: string[]) => Promise.all(fens.map((fen) => makeEval(fen)))),
      analyzePosition: fakeAnalyzePosition()
    };
    await runAnalyzeGameJob(db, deps, game.id);
    return { gameId: game.id, userId: user.id };
  }

  test('generates and persists a plan when none exists yet, reading candidateMoments from analysis time', async () => {
    const { gameId, userId } = await setupAnalyzedGame();
    // The flat-eval fixture (a constant cp everywhere) never crosses a
    // turning-point zone or triggers a mistake, so candidateMoments is
    // legitimately empty here — this only proves ensureCoachingPlan reads
    // the persisted column rather than raw evals it no longer has access to
    // (it would throw reconstructing evals[0] otherwise, since analyzeInChunks
    // never persists them).
    expect(await analysesRepo.findCandidateMomentsByGameId(db, gameId)).toEqual([]);
    const fakeConfig: GatewayConfig = { fake: true };

    const plan = await ensureCoachingPlan(db, fakeConfig, gameId, userId);

    expect(plan.gameSummary).toBeTruthy();
    const persisted = await analysesRepo.findCoachingPlanByGameId(db, gameId);
    expect(persisted).toEqual(plan);
  });

  test('returns the existing plan without calling the model again once one is stored', async () => {
    const { gameId, userId } = await setupAnalyzedGame();
    const fakeConfig: GatewayConfig = { fake: true };
    const first = await ensureCoachingPlan(db, fakeConfig, gameId, userId);

    // A config with no unlock store configured throws if it's ever actually
    // used to resolve a model — proves the second call short-circuits on the
    // already-stored plan instead of calling the gateway again.
    const brokenConfig: GatewayConfig = {};
    const second = await ensureCoachingPlan(db, brokenConfig, gameId, userId);

    expect(second).toEqual(first);
  });

  test('propagates the gateway\'s setup-required error untouched', async () => {
    const { gameId, userId } = await setupAnalyzedGame();
    const unlockStore = createMemoryLlmUnlockStore({ pepper: 'coaching-plan-test', ttlSeconds: 60 });
    const config: GatewayConfig = { unlockStore };

    await expect(ensureCoachingPlan(db, config, gameId, userId)).rejects.toThrow(ValidationError);
    await expect(ensureCoachingPlan(db, config, gameId, userId)).rejects.toThrow(/set up your ai/i);
    expect(await analysesRepo.findCoachingPlanByGameId(db, gameId)).toBeFalsy();
  });
});
