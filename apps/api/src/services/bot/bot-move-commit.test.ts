import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type { BotConfig, PositionAnalysis } from '@freechesscoach/shared';
import { createTestDb, type TestDb } from '../../../test/helpers/db.js';
import * as gamesRepo from '../../db/repositories/games.js';
import * as sessionsRepo from '../../db/repositories/sessions.js';
import * as usersRepo from '../../db/repositories/users.js';
import type { Database } from '../../db/schema.js';
import { createSessionForGame } from '../coach-agent-session.js';
import { parseAnnotatedPgn } from '@freechesscoach/chess-analysis';
import { commitBotTurn, requestBotMove, type BotMoveCommitDependencies } from './bot-move-commit.js';
import { extractPgnMoveComments, selectBookMove } from '@freechesscoach/chess-analysis';
import { createMemoryRatingEvalStore } from './bot-rating-evals.js';
import { createBotThinkingRegistry } from './bot-thinking-registry.js';

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
    topFiveChance: 0.6,
    bestMoveGivenTopFiveChance: 0.5,
    blunderGivenMissChance: 0.2,
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

  async function setupBotGame(userColor: 'white' | 'black' = 'white', pgn = '', options: { thinkingLog?: boolean } = {}) {
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
    const session = await createSessionForGame(db, {
      gameId: game.id,
      userId: user.id,
      mode: 'play_bot',
      botThinkingLog: options.thinkingLog ?? false
    });
    return { user, game, session };
  }

  function deps(overrides: Partial<BotMoveCommitDependencies> = {}): BotMoveCommitDependencies {
    return {
      db,
      analyzePosition: vi.fn().mockResolvedValue(GENERIC_ANALYSIS),
      analyzeBotPosition: vi.fn().mockResolvedValue(botLines()),
      random: () => 0,
      jobQueue: { enqueueAnalyzeGame: vi.fn(), enqueueSummarizeSession: vi.fn(), enqueueBackfillGameMetadata: vi.fn(), enqueueRebuildDiagnosticProfile: vi.fn() },
      callLightModel: vi.fn().mockResolvedValue('note'),
      minThinkMs: 0,
      // The opening book takes over a bot's first moves; these tests are about the
      // engine path, so it is switched off unless a test passes its own.
      selectBook: () => null,
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
    // a back-rank mate with Ra1# — the bot's phase depth is irrelevant since
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

  describe('rating without blocking the bot', () => {
    const E5_LINE = { moveUci: 'e7e5', moveSan: 'e5', pvSan: ['e5'], cp: 20, mateIn: null };
    const REPLY = botLines(E5_LINE, { moveUci: 'a7a6', moveSan: 'a6', pvSan: ['a6'], cp: 60, mateIn: null });
    const START_ANALYSIS = botLines({ moveUci: 'e2e4', moveSan: 'e4', pvSan: ['e4'], cp: 30, mateIn: null });

    async function annotatedMoves(gameId: string) {
      const game = await gamesRepo.findById(db, gameId);
      return parseAnnotatedPgn(game!.annotatedPgn!, 'white').map((move) => [move.moveSan, move.quality]);
    }

    test('the player\'s move is on the board, unrated, before the engine is asked anything about the reply', async () => {
      const { session, game } = await setupBotGame();
      let seenDuringSearch: unknown;
      const analyzeBotPosition = vi.fn().mockImplementation(async () => {
        seenDuringSearch = { pgn: (await gamesRepo.findById(db, game.id))?.pgn, rated: await annotatedMoves(game.id) };
        return REPLY;
      });

      await commitBotTurn(deps({ analyzeBotPosition, analyzePosition: vi.fn().mockResolvedValue(START_ANALYSIS) }), session, baseBot(), 'e4');

      expect(seenDuringSearch).toEqual({ pgn: expect.stringContaining('e4'), rated: [] });
    });

    // 1.e4 e5 — the student (White) is to move; 2.h3 is not a book move, so it is rated from evals.
    const AFTER_E4_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
    const H3_STORED_EVAL = { ply: 0, fen: AFTER_E4_E5, depth: 8, lines: [{ moveUci: 'h2h3', moveSan: 'h3', cp: 30, mateIn: null }] };
    const NC6_REPLY = botLines({ moveUci: 'b8c6', moveSan: 'Nc6', pvSan: ['Nc6'], cp: 25, mateIn: null });

    test('rates the player\'s move from the stored light eval of where it was played plus the bot\'s own search — no engine call for rating', async () => {
      const { session, game } = await setupBotGame('white', '1. e4 e5');
      const ratingEvals = createMemoryRatingEvalStore();
      await ratingEvals.set(AFTER_E4_E5, H3_STORED_EVAL);
      const analyzePosition = vi.fn();

      const result = await commitBotTurn(
        deps({ analyzePosition, ratingEvals, analyzeBotPosition: vi.fn().mockResolvedValue(NC6_REPLY) }),
        session,
        baseBot(),
        'h3'
      );

      if ('error' in result) throw new Error(result.error);
      expect(result.player.quality).toBe('best');
      expect((await annotatedMoves(game.id)).slice(-2)).toEqual([
        ['h3', 'best'],
        ['Nc6', expect.any(String)]
      ]);
      expect(analyzePosition).not.toHaveBeenCalled();
    });

    test('with no stored eval and none saved with the previous move, the player\'s move stays unrated and the reply still lands', async () => {
      const { session, game } = await setupBotGame('white', '1. e4 e5');

      const result = await commitBotTurn(
        deps({ ratingEvals: createMemoryRatingEvalStore(), analyzeBotPosition: vi.fn().mockResolvedValue(NC6_REPLY) }),
        session,
        baseBot(),
        'h3'
      );

      if ('error' in result) throw new Error(result.error);
      expect(result.bot?.san).toBe('Nc6');
      expect(result.player.quality).toBeNull();
      expect(result.bot?.quality).not.toBeNull();
      // Unrated means no annotation, and unannotated plies are skipped on read — only the bot's move shows.
      expect((await annotatedMoves(game.id)).map(([san]) => san)).toEqual(['Nc6']);
    });

    test('after the bot replies, the light engine is asked — in the background — for the position the student moves from next', async () => {
      const { session } = await setupBotGame();
      const ratingEvals = createMemoryRatingEvalStore();
      const analyzeLight = vi.fn().mockResolvedValue(START_ANALYSIS);
      const analyzePosition = vi.fn();

      const result = await commitBotTurn(
        deps({ analyzePosition, analyzeLight, ratingEvals, analyzeBotPosition: vi.fn().mockResolvedValue(REPLY) }),
        session,
        baseBot(),
        'e4'
      );

      if ('error' in result) throw new Error(result.error);
      await vi.waitFor(async () => expect(await ratingEvals.get(result.bot!.fen)).toBeDefined());
      expect(analyzeLight).toHaveBeenCalledWith(result.bot!.fen);
      expect(analyzePosition).not.toHaveBeenCalled();
    });

    test('a light engine that never answers does not delay the reply', async () => {
      const { session } = await setupBotGame();
      const analyzeLight = vi.fn().mockReturnValue(new Promise(() => undefined));

      const result = await commitBotTurn(
        deps({ analyzeLight, ratingEvals: createMemoryRatingEvalStore(), analyzeBotPosition: vi.fn().mockResolvedValue(REPLY) }),
        session,
        baseBot(),
        'e4'
      );

      if ('error' in result) throw new Error(result.error);
      expect(result.bot?.san).toBe('e5');
    });

    describe('opening book moves', () => {
      test('a book move by the student answered by a book move: both are labelled book, and no engine is called', async () => {
        const { session, game } = await setupBotGame();
        const analyzeBotPosition = vi.fn();
        const analyzePosition = vi.fn();

        const result = await commitBotTurn(
          // The book is on (the real one), and a bot with nothing set for it still plays its first two moves from it.
          deps({ analyzePosition, analyzeBotPosition, selectBook: selectBookMove }),
          session,
          baseBot({ bookPlies: 0, bookMistakeChance: 1 }),
          'e4'
        );

        if ('error' in result) throw new Error(result.error);
        expect(result.bot).not.toBeNull();
        expect(analyzeBotPosition).not.toHaveBeenCalled();
        expect(analyzePosition).not.toHaveBeenCalled();
        expect(result.player.quality).toBe('book');
        expect(result.bot?.quality).toBe('book');
        expect((await annotatedMoves(game.id)).map(([, quality]) => quality)).toEqual(['book', 'book']);
      });

      test('a student move the book does not know is not a book move, even when the bot answers from the book', async () => {
        // 2.h3 is not a book move, so the student's move is not labelled book even though the bot answers from its book.
        const { session } = await setupBotGame('white', '1. e4 e5');

        const result = await commitBotTurn(
          deps({ selectBook: () => ({ san: 'Nc6' }), analyzeBotPosition: vi.fn() }),
          session,
          baseBot(),
          'h3'
        );

        if ('error' in result) throw new Error(result.error);
        expect(result.player.quality).not.toBe('book');
      });
    });

    describe('every position keeps its eval', () => {
      async function savedEvals(gameId: string) {
        const game = await gamesRepo.findById(db, gameId);
        return extractPgnMoveComments(game!.pgn).map((comment) => [comment.ply, comment.evalCp]);
      }

      test('both moves are saved with the engine\'s eval of the position they leave', async () => {
        const { session, game } = await setupBotGame();

        await commitBotTurn(deps({ analyzeBotPosition: vi.fn().mockResolvedValue(REPLY) }), session, baseBot(), 'e4');

        // e4: the bot's search of the position after it (top line, +0.20 for Black
        // in the mock's White-perspective scale); e5: the picked line's own score.
        expect(await savedEvals(game.id)).toEqual([
          [1, 20],
          [2, 20]
        ]);
      });

      test('a move is rated from the eval saved with the previous move when no light eval is stored', async () => {
        const { session } = await setupBotGame('black', '1. e4 {[%eval 0.30]}');
        // The bot (White) answers e5 with d4 here; its search scores the position.
        const D4_REPLY = botLines({ moveUci: 'd2d4', moveSan: 'd4', pvSan: ['d4'], cp: 40, mateIn: null });

        const result = await commitBotTurn(
          deps({ ratingEvals: createMemoryRatingEvalStore(), analyzeBotPosition: vi.fn().mockResolvedValue(D4_REPLY) }),
          session,
          baseBot(),
          'e5'
        );

        if ('error' in result) throw new Error(result.error);
        expect(result.player.quality).not.toBeNull();
      });
    });

    test('requestBotMove has no player move to rate but still rates the bot\'s reply from its own search', async () => {
      const { session } = await setupBotGame();
      await commitBotTurn(deps({ analyzeBotPosition: vi.fn().mockRejectedValue(new Error('engine down')) }), session, baseBot(), 'e4');
      const analyzePosition = vi.fn().mockResolvedValue(START_ANALYSIS);

      const result = await requestBotMove(deps({ analyzePosition, analyzeBotPosition: vi.fn().mockResolvedValue(REPLY) }), session, baseBot());

      if ('error' in result) throw new Error(result.error);
      expect(result.bot?.quality).not.toBeNull();
      expect(analyzePosition).not.toHaveBeenCalled();
    }, 10000);
  });

  describe('thinking log', () => {
    const E5_REPLY = botLines({ moveUci: 'e7e5', moveSan: 'e5', pvSan: ['e5'], cp: -10, mateIn: null });

    // The Thinking log is opt-in per session (0043_bot_thinking_log.ts) —
    // these tests enable it; the default-off behaviour has its own test below.
    test('records the whole turn: saving, book lookup, engine search, annotation, choice, rating, saving', async () => {
      const { session } = await setupBotGame('white', '', { thinkingLog: true });
      const thinkingLog = createBotThinkingRegistry();

      await commitBotTurn(deps({ thinkingLog, analyzeBotPosition: vi.fn().mockResolvedValue(E5_REPLY) }), session, baseBot(), 'e4');

      const { moves } = thinkingLog.getLog(session.id);
      expect(moves).toHaveLength(1);
      expect(moves[0]).toMatchObject({ source: 'turn', status: 'done', ply: 2, picked: 'e5' });
      expect(moves[0]?.endedAt).not.toBeNull();
      expect(moves[0]?.steps.map((step) => step.label)).toEqual([
        'Saving your move',
        'Opening book lookup',
        'Engine search (attempt 1 of 3)',
        'Choosing move',
        'Rating your move',
        "Saving the bot's move",
        "Rating the bot's move",
        'Finishing up (clock, game state, session position)'
      ]);
      expect(moves[0]?.steps.every((step) => step.status === 'done')).toBe(true);
    });

    test('pads a too-fast reply up to the minimum think time and shows it as its own step', async () => {
      const { session } = await setupBotGame('white', '', { thinkingLog: true });
      const thinkingLog = createBotThinkingRegistry();

      // A frozen clock means the reply always looks instant, so the padding step
      // exists no matter how slow the machine running the test is.
      const frozenNow = () => 1_000_000;
      await commitBotTurn(
        deps({ thinkingLog, now: frozenNow, minThinkMs: 5, analyzeBotPosition: vi.fn().mockResolvedValue(E5_REPLY) }),
        session,
        baseBot(),
        'e4'
      );

      const labels = thinkingLog.getLog(session.id).moves[0]?.steps.map((step) => step.label);
      expect(labels).toContain('Padding to the minimum think time');
    });

    test('a bot that fails on every retry leaves a failed move whose last step says why', async () => {
      const { session } = await setupBotGame('white', '', { thinkingLog: true });
      const thinkingLog = createBotThinkingRegistry();

      const result = await commitBotTurn(
        deps({ thinkingLog, analyzeBotPosition: vi.fn().mockRejectedValue(new Error('engine down')) }),
        session,
        baseBot(),
        'e4'
      );

      expect('error' in result ? undefined : result.botPending).toBe(true);
      const move = thinkingLog.getLog(session.id).moves[0];
      expect(move?.status).toBe('failed');
      expect(move?.steps.filter((step) => step.label.startsWith('Engine search')).map((step) => step.status)).toEqual(['failed', 'failed', 'failed']);
      expect(move?.steps.at(-1)).toMatchObject({ label: 'Move failed', detail: 'engine down' });
    }, 10000);

    test('an illegal student move leaves nothing behind in the log', async () => {
      const { session } = await setupBotGame('white', '', { thinkingLog: true });
      const thinkingLog = createBotThinkingRegistry();

      const result = await commitBotTurn(deps({ thinkingLog }), session, baseBot(), 'e5');

      expect('error' in result).toBe(true);
      expect(thinkingLog.getLog(session.id).moves).toEqual([]);
    });

    test('a student move that ends the game leaves nothing behind in the log', async () => {
      const { session } = await setupBotGame('black', buildPgnThroughFoolsMateSetup(), { thinkingLog: true });
      const thinkingLog = createBotThinkingRegistry();

      await commitBotTurn(deps({ thinkingLog }), session, baseBot(), 'Qh4#');

      expect(thinkingLog.getLog(session.id).moves).toEqual([]);
    });

    test('a session with the log off records nothing at all', async () => {
      const { session } = await setupBotGame();
      const thinkingLog = createBotThinkingRegistry();

      await commitBotTurn(deps({ thinkingLog, analyzeBotPosition: vi.fn().mockResolvedValue(E5_REPLY) }), session, baseBot(), 'e4');

      expect(thinkingLog.getLog(session.id).moves).toEqual([]);
    });

    test('requestBotMove records its own move, marked as the failover', async () => {
      const { session } = await setupBotGame();
      await commitBotTurn(deps({ analyzeBotPosition: vi.fn().mockRejectedValue(new Error('engine down')) }), session, baseBot(), 'e4');
      // Mid-game opt-in, as the ⋯ menu does it — requestBotMove re-reads the
      // session row, so the flip takes effect from the next failover move on.
      await sessionsRepo.setBotThinkingLog(db, session.id, true);
      const thinkingLog = createBotThinkingRegistry();

      await requestBotMove(deps({ thinkingLog, analyzeBotPosition: vi.fn().mockResolvedValue(E5_REPLY) }), session, baseBot());

      const { moves } = thinkingLog.getLog(session.id);
      expect(moves).toHaveLength(1);
      expect(moves[0]).toMatchObject({ source: 'failover', status: 'done', ply: 2, picked: 'e5' });
    }, 10000);
  });

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
