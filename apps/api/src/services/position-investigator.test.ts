import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type { PositionAnalysis } from '@freechesscoach/shared';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';
import { mockResolution, multiStepGenerateModel } from '../../test/helpers/mock-model.js';
import { investigatePosition, type PositionInvestigatorDependencies } from './position-investigator.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function positionAnalysisFixture(): PositionAnalysis {
  return {
    fen: START_FEN,
    depth: 18,
    multiPv: 1,
    bestMove: 'e4',
    eval: { cp: 20, mateIn: null },
    lines: [{ moveUci: 'e2e4', moveSan: 'e4', pvSan: ['e4'], cp: 20, mateIn: null }],
    features: {
      turn: 'white',
      boardState: 'none',
      availableMoves: ['e4'],
      mobility: { white: 20, black: 20 },
      controlledSquares: [],
      piecesUnderAttack: [],
      hangingPieces: [],
      underDefendedPieces: [],
      overloadedDefenders: [],
      centerControlScore: { white: 0, black: 0 },
      openFiles: [],
      semiOpenFiles: [],
      doubledPawns: [],
      isolatedPawns: [],
      passedPawns: [],
      targetsAttacked: [],
      forks: [],
      captureOpportunities: []
    }
  };
}

describe('investigatePosition', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  async function setupUser() {
    const user = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Ann' });
    return { userId: user.id, sessionId: crypto.randomUUID() };
  }

  function makeDeps(overrides: Partial<PositionInvestigatorDependencies> = {}): PositionInvestigatorDependencies {
    return {
      db,
      gatewayConfig: { keyVault: {} as never, platformKeys: {}, modelIds: { standard: {} as never, light: {} as never } },
      resolveModel: vi.fn(),
      analyzePosition: vi.fn().mockResolvedValue(positionAnalysisFixture()),
      ...overrides
    };
  }

  test('returns the sub-agent\'s final text and records usage under the investigate_position purpose, light tier', async () => {
    const { userId, sessionId } = await setupUser();
    const model = multiStepGenerateModel([{ text: 'Yes, Nf3 is sound — the engine keeps it at roughly +0.20.', finishReason: 'stop' }]);
    const resolveModel = vi.fn().mockResolvedValue(mockResolution(model, { provider: 'anthropic', modelId: 'claude-light', metered: true }));
    const deps = makeDeps({ resolveModel });

    const result = await investigatePosition(deps, { userId, sessionId }, { fen: START_FEN, question: 'is Nf3 sound?' });

    expect(result).toBe('Yes, Nf3 is sound — the engine keeps it at roughly +0.20.');
    expect(resolveModel).toHaveBeenCalledWith(deps.db, deps.gatewayConfig, userId, 'light');

    const logs = await db.selectFrom('llmCallLog').selectAll().where('userId', '=', userId).execute();
    expect(logs).toHaveLength(1);
    expect(logs[0]?.purpose).toBe('investigate_position');
    expect(logs[0]?.model).toBe('claude-light');
  });

  test('an illegal moves sequence short-circuits before ever resolving a model', async () => {
    const { userId, sessionId } = await setupUser();
    const resolveModel = vi.fn();
    const deps = makeDeps({ resolveModel });

    const result = await investigatePosition(deps, { userId, sessionId }, { fen: START_FEN, moves: ['Nowhere'], question: 'q' });

    expect(result).toContain('Illegal move: Nowhere');
    expect(resolveModel).not.toHaveBeenCalled();
  });

  test('resolveModel throwing is caught and returns a safe fallback string, never rejects', async () => {
    const { userId, sessionId } = await setupUser();
    const resolveModel = vi.fn().mockRejectedValue(new Error('no platform key configured'));
    const deps = makeDeps({ resolveModel });

    const result = await investigatePosition(deps, { userId, sessionId }, { fen: START_FEN, question: 'q' });

    expect(result).toBe('Could not complete that investigation right now.');
  });

  test('an empty final text still returns a non-empty fallback sentence', async () => {
    const { userId, sessionId } = await setupUser();
    const model = multiStepGenerateModel([{ text: '', finishReason: 'stop' }]);
    const resolveModel = vi.fn().mockResolvedValue(mockResolution(model));
    const deps = makeDeps({ resolveModel });

    const result = await investigatePosition(deps, { userId, sessionId }, { fen: START_FEN, question: 'q' });

    expect(result).toBe('Investigation did not reach a conclusion in time.');
  });
});
