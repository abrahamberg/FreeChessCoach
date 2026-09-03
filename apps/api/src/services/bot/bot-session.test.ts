import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type { Kysely } from 'kysely';
import type { BotConfig, PositionAnalysis } from '@freechesscoach/shared';
import { createTestDb, type TestDb } from '../../../test/helpers/db.js';
import * as gamesRepo from '../../db/repositories/games.js';
import * as sessionMessagesRepo from '../../db/repositories/session-messages.js';
import * as sessionsRepo from '../../db/repositories/sessions.js';
import type { Database } from '../../db/schema.js';
import * as usersRepo from '../../db/repositories/users.js';
import { createBotSession, type CreateBotSessionDependencies } from './bot-session.js';

const TEST_BOT: BotConfig = {
  id: 'test-bot',
  name: 'Test Bot',
  avatarIndex: 0,
  description: 'A bot for tests.',
  elo: 800,
  phases: {
    opening: { depth: 6, bestMoveChance: 0.5 },
    middlegame: { depth: 6, bestMoveChance: 0.5 },
    endgame: { depth: 6, bestMoveChance: 0.5 }
  },
  personality: { aggression: 50, trapSeeking: 50, defensiveness: 50 },
  mateConversionChance: 0.9,
  diagnosisCodes: [],
  bookPlies: 0,
  bookMistakeChance: 0
};

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

function botLines(...lines: PositionAnalysis['lines']): PositionAnalysis {
  return { ...GENERIC_ANALYSIS, lines, bestMove: lines[0]?.moveSan ?? null };
}

describe('createBotSession', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  function deps(overrides: Partial<CreateBotSessionDependencies> = {}): CreateBotSessionDependencies {
    return {
      db,
      analyzePosition: vi.fn().mockResolvedValue(GENERIC_ANALYSIS),
      analyzeBotPosition: vi
        .fn()
        .mockResolvedValue(botLines({ moveUci: 'e2e4', moveSan: 'e4', pvSan: ['e4'], cp: 20, mateIn: null })),
      random: () => 0,
      ...overrides
    };
  }

  test('creates a vs_bot game (with a frozen config snapshot) + a play_bot session seeded with [session_start]', async () => {
    const user = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Ann' });

    const session = await createBotSession(deps(), user.id, 'white', TEST_BOT);

    expect(session.mode).toBe('play_bot');
    expect(session.status).toBe('active');
    expect(session.currentPly).toBe(0);

    const game = await gamesRepo.findById(db, session.gameId);
    expect(game?.source).toBe('vs_bot');
    expect(game?.botId).toBe('test-bot');
    expect(game?.botConfigSnapshot).toEqual(TEST_BOT);
    expect(game?.whiteName).toBe('You');
    expect(game?.blackName).toBe('Test Bot');
    // White (the student) is on move — nothing to play yet.
    expect(game?.pgn.trim()).toMatch(/^(\*)?$/);

    const messages = await sessionMessagesRepo.listBySession(db, session.id);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.content).toBe('[session_start]');
  });

  test('a black-choosing student sees the bot named as White, and the bot has already played its opening move', async () => {
    const user = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Bo' });

    const session = await createBotSession(deps(), user.id, 'black', TEST_BOT);

    const game = await gamesRepo.findById(db, session.gameId);
    expect(game?.userColor).toBe('black');
    expect(game?.whiteName).toBe('Test Bot');
    expect(game?.blackName).toBe('You');
    // Without this, the game deadlocks forever: White (the bot) is on move
    // first and nothing else in the app ever drives a bot move except the
    // student's own POST /play-move.
    expect(game?.pgn).toContain('e4');

    expect(session.currentPly).toBe(1);
    expect(session.subjectPly).toBe(1);
    const persistedSession = await sessionsRepo.findById(db, session.id);
    expect(persistedSession?.currentPly).toBe(1);
  });
});
