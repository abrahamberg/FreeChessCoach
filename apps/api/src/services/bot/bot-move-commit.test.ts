import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type { BotConfig, PositionAnalysis } from '@freechesscoach/shared';
import { createTestDb, type TestDb } from '../../../test/helpers/db.js';
import * as gamesRepo from '../../db/repositories/games.js';
import * as sessionsRepo from '../../db/repositories/sessions.js';
import * as usersRepo from '../../db/repositories/users.js';
import type { Database } from '../../db/schema.js';
import { createSessionForGame } from '../coach-agent-session.js';
import { commitBotTurn, requestBotMove, type BotMoveCommitDependencies } from './bot-move-commit.js';

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
    // c2-c4 by the (irrelevant) student (white), then the bot (black) delivers
    // a back-rank mate with Ra1# — bot.multiPv/depth are irrelevant since
    // analyzeBotPosition is mocked to return exactly this one line. Student is
    // white here (not the more natural-reading black) so the position's first
    // move is white's, matching commitMove's ply-parity mover assumption
    // (odd ply = white) — every real game satisfies this since it always
    // starts from the standard position, but a custom black-to-move [FEN]
    // with a black student would violate it and misclassify both movers.
    const { session, game } = await setupBotGame('white', backRankMatePgnBeforeStudentMove());
    const d = deps({
      analyzeBotPosition: vi.fn().mockResolvedValue(botLines({ moveUci: 'a8a1', moveSan: 'Ra1#', pvSan: ['Ra1#'], cp: null, mateIn: 1 }))
    });

    const result = await commitBotTurn(d, session, baseBot(), 'c4');

    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.player.san).toBe('c4');
    expect(result.bot?.san).toBe('Ra1#');
    expect(result.gameOver).toEqual({ result: '0-1', reason: 'checkmate' });

    const updatedGame = await gamesRepo.findById(db, game.id);
    expect(updatedGame?.result).toBe('0-1');
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

  // The engine-outage / failover path: see bot-move-commit.ts's doc comments
  // on commitBotTurn and requestBotMove for why the ply pointer has to move
  // before the bot's reply is even attempted.
  test('when the engine fails on every retry, the player\'s move still commits and the session is left correctly waiting on the bot', async () => {
    const { session, game } = await setupBotGame();
    const d = deps({ analyzeBotPosition: vi.fn().mockRejectedValue(new Error('engine down')) });

    const result = await commitBotTurn(d, session, baseBot(), 'e4');

    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.player.san).toBe('e4');
    expect(result.bot).toBeNull();
    expect(result.botPending).toBe(true);

    const updatedGame = await gamesRepo.findById(db, game.id);
    expect(updatedGame?.pgn).toContain('e4');
    const updatedSession = await sessionsRepo.findById(db, session.id);
    expect(updatedSession?.currentPly).toBe(1);
    expect(updatedSession?.status).toBe('active');
  }, 10000);

  test('requestBotMove recovers a bot reply once the engine works again, without a new student move', async () => {
    const { session } = await setupBotGame();
    const failingDeps = deps({ analyzeBotPosition: vi.fn().mockRejectedValue(new Error('engine down')) });
    const pending = await commitBotTurn(failingDeps, session, baseBot(), 'e4');
    if ('error' in pending) throw new Error('unexpected error result');
    expect(pending.botPending).toBe(true);

    const recoveredDeps = deps({
      analyzeBotPosition: vi.fn().mockResolvedValue(botLines({ moveUci: 'e7e5', moveSan: 'e5', pvSan: ['e5'], cp: -10, mateIn: null }))
    });
    const result = await requestBotMove(recoveredDeps, session, baseBot());

    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.player).toBeNull();
    expect(result.bot?.san).toBe('e5');

    const updatedSession = await sessionsRepo.findById(db, session.id);
    expect(updatedSession?.currentPly).toBe(2);
  }, 10000);

  test('requestBotMove is a no-op error when it is actually the student\'s turn', async () => {
    const { session } = await setupBotGame();
    const d = deps();

    const result = await requestBotMove(d, session, baseBot());

    expect('error' in result).toBe(true);
    expect(d.analyzeBotPosition).not.toHaveBeenCalled();
  });
});

/** 1.f3 e5 2.g4 — Black (the student) to move, one move (Qh4#) from Fool's Mate. */
function buildPgnThroughFoolsMateSetup(): string {
  return '1. f3 e5 2. g4 *';
}

/** A back-rank-mate setup one ply before the student's irrelevant move: White
 * king g1 boxed in by f2/g2/h2 pawns, plus a spare c2 pawn for the (white)
 * student to push; Black rook a8, king e8, ready to deliver Ra1#. A spare
 * knight can't be used for the "irrelevant" move (any square it could
 * shuffle to and still clear the back rank in one move is also a square it
 * could jump back from to interpose on the check) — a pawn push can never
 * block a same-rank check, so it's the only irrelevant move that actually
 * leaves Ra1# as mate. White moves first here (not black) so ply 1 is white's
 * move, matching commitMove's ply-parity mover assumption — see the test. */
function backRankMatePgnBeforeStudentMove(): string {
  return '[FEN "r3k3/8/8/8/8/8/2P2PPP/6K1 w - - 0 1"]\n[SetUp "1"]\n\n*';
}
