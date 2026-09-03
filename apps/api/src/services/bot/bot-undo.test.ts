import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type { BotConfig, PositionAnalysis } from '@freechesscoach/shared';
import { createTestDb, type TestDb } from '../../../test/helpers/db.js';
import * as gamesRepo from '../../db/repositories/games.js';
import * as sessionsRepo from '../../db/repositories/sessions.js';
import * as usersRepo from '../../db/repositories/users.js';
import type { Database } from '../../db/schema.js';
import { createSessionForGame } from '../coach-agent-session.js';
import type { PlayMovesDependencies } from '../play-moves.js';
import { commitBotTurn, type BotMoveCommitDependencies } from './bot-move-commit.js';
import { undoLastBotTurn } from './bot-undo.js';

const GENERIC_ANALYSIS: PositionAnalysis = {
  fen: 'irrelevant-for-classification-mock',
  depth: 10,
  multiPv: 1,
  bestMove: null,
  eval: { cp: 0, mateIn: null },
  lines: [],
  features: {
    turn: 'white',
    boardState: 'none',
    availableMoves: [],
    mobility: { white: 0, black: 0 },
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

function baseBot(overrides: Partial<BotConfig> = {}): BotConfig {
  return {
    id: 'test-bot',
    name: 'Test Bot',
    avatarIndex: 0,
    description: 'A bot for tests.',
    elo: 800,
    phases: {
      opening: { depth: 6 },
      middlegame: { depth: 6 },
      endgame: { depth: 6 }
    },
    personality: { aggression: 50, trapSeeking: 50, defensiveness: 50 },
    mateConversionChance: 0.9,
    diagnosisCodes: [],
    bookPlies: 0,
    bookMistakeChance: 0,
    ...overrides
  };
}

function botLines(...lines: PositionAnalysis['lines']): PositionAnalysis {
  return { ...GENERIC_ANALYSIS, lines, bestMove: lines[0]?.moveSan ?? null };
}

describe('undoLastBotTurn', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  async function setupBotGame() {
    const user = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Ann' });
    const game = await gamesRepo.insert(db, {
      userId: user.id,
      pgn: '',
      source: 'vs_bot',
      userColor: 'white',
      whiteName: 'You',
      blackName: 'Test Bot',
      result: null,
      timeControl: null,
      eco: null,
      playedAt: new Date(),
      botId: 'test-bot',
      botConfigSnapshot: baseBot()
    });
    const session = await createSessionForGame(db, { gameId: game.id, userId: user.id, mode: 'play_bot' });
    return { user, game, session };
  }

  function commitDeps(overrides: Partial<BotMoveCommitDependencies> = {}): BotMoveCommitDependencies {
    return {
      db,
      analyzePosition: vi.fn().mockResolvedValue(GENERIC_ANALYSIS),
      analyzeBotPosition: vi.fn().mockResolvedValue(botLines({ moveUci: 'e7e5', moveSan: 'e5', pvSan: ['e5'], cp: -10, mateIn: null })),
      random: () => 0,
      jobQueue: { enqueueAnalyzeGame: vi.fn(), enqueueSummarizeSession: vi.fn(), enqueueBackfillGameMetadata: vi.fn(), enqueueRebuildDiagnosticProfile: vi.fn() },
      minThinkMs: 0,
      ...overrides
    };
  }

  test('removes both the bot reply and the student move ahead of it', async () => {
    const { session, game } = await setupBotGame();
    await commitBotTurn(commitDeps(), session, baseBot(), 'e4');

    const deps: PlayMovesDependencies = { db, analyzePosition: vi.fn().mockResolvedValue(GENERIC_ANALYSIS) };
    const result = await undoLastBotTurn(deps, session);

    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.ply).toBe(0);

    const updatedGame = await gamesRepo.findById(db, game.id);
    expect(updatedGame?.pgn.includes('e4')).toBe(false);
    const updatedSession = await sessionsRepo.findById(db, session.id);
    expect(updatedSession?.currentPly).toBe(0);
  });

  test('errors when there is no move to undo yet', async () => {
    const { session } = await setupBotGame();
    const deps: PlayMovesDependencies = { db, analyzePosition: vi.fn().mockResolvedValue(GENERIC_ANALYSIS) };

    const result = await undoLastBotTurn(deps, session);

    expect('error' in result).toBe(true);
  });
});
