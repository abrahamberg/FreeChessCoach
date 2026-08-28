import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type { BotConfig, PositionAnalysis } from '@freechesscoach/shared';
import { createTestDb, type TestDb } from '../../../test/helpers/db.js';
import * as gamesRepo from '../../db/repositories/games.js';
import * as sessionsRepo from '../../db/repositories/sessions.js';
import * as usersRepo from '../../db/repositories/users.js';
import type { Database } from '../../db/schema.js';
import { createSessionForGame } from '../coach-agent-session.js';
import { commitBotTurn, type BotMoveCommitDependencies } from './bot-move-commit.js';

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
    depth: 6,
    multiPv: 2,
    personality: { aggression: 50, trapSeeking: 50, defensiveness: 50 },
    aiEnabled: false,
    temperature: 0.3,
    bookPlies: 0,
    bookMistakeChance: 0,
    ...overrides
  };
}

function botLines(...lines: PositionAnalysis['lines']): PositionAnalysis {
  return { ...GENERIC_ANALYSIS, lines, bestMove: lines[0]?.moveSan ?? null };
}

describe('commitBotTurn', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  async function setupBotGame(userColor: 'white' | 'black' = 'white', pgn = '') {
    const user = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Ann' });
    const game = await gamesRepo.insert(db, {
      userId: user.id,
      pgn,
      source: 'vs_bot',
      userColor,
      whiteName: userColor === 'white' ? 'You' : 'Test Bot',
      blackName: userColor === 'black' ? 'You' : 'Test Bot',
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

  function deps(overrides: Partial<BotMoveCommitDependencies> = {}): BotMoveCommitDependencies {
    return {
      db,
      analyzePosition: vi.fn().mockResolvedValue(GENERIC_ANALYSIS),
      analyzeBotPosition: vi.fn().mockResolvedValue(botLines()),
      callTiebreak: vi.fn().mockResolvedValue(null),
      random: () => 0,
      jobQueue: { enqueueAnalyzeGame: vi.fn(), enqueueSummarizeSession: vi.fn() },
      minThinkMs: 0,
      ...overrides
    };
  }

  test('a normal turn commits both the player and bot moves, and advances session ply', async () => {
    const { session } = await setupBotGame();
    const d = deps({ analyzeBotPosition: vi.fn().mockResolvedValue(botLines({ moveUci: 'e7e5', moveSan: 'e5', pvSan: ['e5'], cp: -10, mateIn: null })) });

    const result = await commitBotTurn(d, session, baseBot(), 'e4');

    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.player.san).toBe('e4');
    expect(result.bot?.san).toBe('e5');
    expect(result.gameOver).toBeNull();

    const updatedSession = await sessionsRepo.findById(db, session.id);
    expect(updatedSession?.currentPly).toBe(2);
    expect(updatedSession?.status).toBe('active');
    expect(d.jobQueue.enqueueAnalyzeGame).not.toHaveBeenCalled();
  });

  test('when the player\'s own move ends the game, the bot never moves and the game is finalized', async () => {
    // Fool's mate setup: after 1.f3 e5 2.g4, it's Black (the student) to move.
    const { session, game } = await setupBotGame('black', buildPgnThroughFoolsMateSetup());
    const d = deps();

    const result = await commitBotTurn(d, session, baseBot(), 'Qh4#');

    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.bot).toBeNull();
    expect(result.gameOver).toEqual({ result: '0-1', reason: 'checkmate' });
    expect(d.analyzeBotPosition).not.toHaveBeenCalled();

    const updatedGame = await gamesRepo.findById(db, game.id);
    expect(updatedGame?.result).toBe('0-1');
    const updatedSession = await sessionsRepo.findById(db, session.id);
    expect(updatedSession?.status).toBe('completed');
    expect(d.jobQueue.enqueueAnalyzeGame).toHaveBeenCalledTimes(1);
  });

  test('when the bot\'s reply ends the game, both moves are recorded and the game is finalized', async () => {
    // 1.Nb8-c6 by the (irrelevant) student, then the bot delivers a back-rank
    // mate with Ra8# — bot.multiPv/depth are irrelevant since analyzeBotPosition
    // is mocked to return exactly this one line.
    const { session, game } = await setupBotGame('black', backRankMatePgnBeforeStudentMove());
    const d = deps({
      analyzeBotPosition: vi.fn().mockResolvedValue(botLines({ moveUci: 'a1a8', moveSan: 'Ra8#', pvSan: ['Ra8#'], cp: null, mateIn: 1 }))
    });

    const result = await commitBotTurn(d, session, baseBot(), 'Nc6');

    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.player.san).toBe('Nc6');
    expect(result.bot?.san).toBe('Ra8#');
    expect(result.gameOver).toEqual({ result: '1-0', reason: 'checkmate' });

    const updatedGame = await gamesRepo.findById(db, game.id);
    expect(updatedGame?.result).toBe('1-0');
    const updatedSession = await sessionsRepo.findById(db, session.id);
    expect(updatedSession?.status).toBe('completed');
    expect(updatedSession?.currentPly).toBe(result.bot?.ply);
    expect(d.jobQueue.enqueueAnalyzeGame).toHaveBeenCalledTimes(1);
  });

  test('AI-off never calls the tiebreak dependency during a bot turn', async () => {
    const { session } = await setupBotGame();
    const d = deps({ analyzeBotPosition: vi.fn().mockResolvedValue(botLines({ moveUci: 'e7e5', moveSan: 'e5', pvSan: ['e5'], cp: -10, mateIn: null })) });

    await commitBotTurn(d, session, baseBot({ aiEnabled: false }), 'e4');

    expect(d.callTiebreak).not.toHaveBeenCalled();
  });
});

/** 1.f3 e5 2.g4 — Black (the student) to move, one move (Qh4#) from Fool's Mate. */
function buildPgnThroughFoolsMateSetup(): string {
  return '1. f3 e5 2. g4 *';
}

/** A back-rank-mate setup one ply before the student's irrelevant move: White
 * king e1, rook a1; Black king g8 boxed in by f7/g7/h7 pawns, extra knight on
 * b8 for the student to shuffle without disturbing the mating pattern. */
function backRankMatePgnBeforeStudentMove(): string {
  return '[FEN "1n4k1/5ppp/8/8/8/8/8/R3K3 b - - 0 1"]\n[SetUp "1"]\n\n*';
}
