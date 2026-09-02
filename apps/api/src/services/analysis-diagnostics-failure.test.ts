import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { CoachingPlanSchema, type EngineEval, type PositionAnalysis } from '@freechesscoach/shared';
import * as analysesRepo from '../db/repositories/analyses.js';
import * as gamesRepo from '../db/repositories/games.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';
import { runAnalyzeGameJob, type AnalysisJobDependencies } from './analysis.js';

// Task 56.3: "a detector throwing must not fail the analysis job" — the
// realistic failure surface is the persist step (`insertMany`), since
// `buildDiagnosticObservations` already isolates each individual detector
// itself (see build-diagnostics.test.ts). Mocked at the module level, in its
// own file, so this doesn't affect analysis-diagnostics.test.ts's assertion
// that observations really do land in the table on the happy path.
vi.mock('../db/repositories/diagnostic-observations.js', () => ({
  insertMany: vi.fn().mockRejectedValue(new Error('boom')),
  listForUserSince: vi.fn(),
  listForGame: vi.fn(),
  deleteByGameId: vi.fn()
}));

const PGN = `[Event "Test"]
[White "Ann"]
[Black "Bob"]
[Result "1-0"]

1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0`;

const VALID_PLAN = CoachingPlanSchema.parse({
  gameSummary: 'A sharp game.',
  openingNote: 'Fine through the opening.',
  themes: ['king_safety'],
  connectionToHistory: 'First session together.',
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

describe('runAnalyzeGameJob diagnostic observation failure isolation', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  test('a failure while persisting diagnostic observations does not fail the analysis job', async () => {
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
    const analysis = await analysesRepo.insertQueued(db, game.id);
    const deps: AnalysisJobDependencies = {
      analyzeGamePositions: vi.fn(async (fens: string[]) => Promise.all(fens.map((fen) => makeEval(fen)))),
      analyzePosition: fakeAnalyzePosition(),
      callPlanner: vi.fn().mockResolvedValue(VALID_PLAN)
    };

    await runAnalyzeGameJob(db, deps, game.id);

    const row = await db.selectFrom('analyses').select(['status', 'error']).where('id', '=', analysis.id).executeTakeFirstOrThrow();
    expect(row.status).toBe('ready');
    expect(row.error).toBeNull();

    const { insertMany } = await import('../db/repositories/diagnostic-observations.js');
    expect(insertMany).toHaveBeenCalled();
  });
});
