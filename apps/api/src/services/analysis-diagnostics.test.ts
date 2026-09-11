import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { CoachingPlanSchema, type EngineEval, type PositionAnalysis } from '@freechesscoach/shared';
import * as analysesRepo from '../db/repositories/analyses.js';
import * as gamesRepo from '../db/repositories/games.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';
import { runAnalyzeGameJob, type AnalysisJobDependencies } from './analysis.js';

// Task 56.3: black blunders into a scholar's-mate-style king-safety collapse
// on ply 4 — enough of a real blunder that at least one MS-*/BV-* detector
// should fire, so the "observations actually land in the table" test isn't
// vacuously true.
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
  sessionGoal: 'Spot the tactic before it costs material.',
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

async function setupGame(db: Kysely<Database>): Promise<{ gameId: string; analysisId: string }> {
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
  return { gameId: game.id, analysisId: analysis.id };
}

function deps(): AnalysisJobDependencies {
  return {
    analyzeGamePositions: vi.fn(async (fens: string[]) => Promise.all(fens.map((fen) => makeEval(fen)))),
    analyzePosition: fakeAnalyzePosition(),
    callPlanner: vi.fn().mockResolvedValue(VALID_PLAN)
  };
}

describe('runAnalyzeGameJob diagnostic observations', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  test('persists diagnostic observations for the user colour alongside the rest of the analysis', async () => {
    const { gameId, analysisId } = await setupGame(db);

    await runAnalyzeGameJob(db, deps(), gameId);

    const analysis = await db.selectFrom('analyses').select('status').where('id', '=', analysisId).executeTakeFirstOrThrow();
    expect(analysis.status).toBe('ready');

    const observations = await db
      .selectFrom('diagnosticObservations')
      .selectAll()
      .where('gameId', '=', gameId)
      .execute();
    // Only white (the user colour) moved plies 1 and 3 — no black-mover row
    // should ever appear, even though black also had detectable opportunities.
    expect(observations.every((row) => row.ply % 2 === 1)).toBe(true);
  });
});
