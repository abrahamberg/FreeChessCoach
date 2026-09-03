import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type { BotConfig, PlayerColor } from '@freechesscoach/shared';
import { createTestDb, type TestDb } from '../../../test/helpers/db.js';
import * as gamesRepo from '../../db/repositories/games.js';
import * as sessionsRepo from '../../db/repositories/sessions.js';
import * as usersRepo from '../../db/repositories/users.js';
import type { Database } from '../../db/schema.js';
import { createSessionForGame } from '../coach-agent-session.js';
import type { FinalizeBotGameDependencies } from './bot-finalize.js';
import { resignBotGame } from './bot-resign.js';

function baseBot(): BotConfig {
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
    bookMistakeChance: 0
  };
}

describe('resignBotGame', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  async function setupBotGame(userColor: PlayerColor) {
    const user = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Ann' });
    const game = await gamesRepo.insert(db, {
      userId: user.id,
      pgn: '1. e4 *',
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
    return { game, session };
  }

  function deps(): FinalizeBotGameDependencies {
    return { db, jobQueue: { enqueueAnalyzeGame: vi.fn(), enqueueSummarizeSession: vi.fn(), enqueueBackfillGameMetadata: vi.fn(), enqueueRebuildDiagnosticProfile: vi.fn() } };
  }

  test('resigning as White records a Black win and completes the session', async () => {
    const { game, session } = await setupBotGame('white');
    const d = deps();

    const result = await resignBotGame(d, session, game);

    expect(result.result).toBe('0-1');
    const updatedGame = await gamesRepo.findById(db, game.id);
    expect(updatedGame?.result).toBe('0-1');
    const updatedSession = await sessionsRepo.findById(db, session.id);
    expect(updatedSession?.status).toBe('completed');
    expect(d.jobQueue.enqueueAnalyzeGame).toHaveBeenCalledTimes(1);
  });

  test('resigning as Black records a White win', async () => {
    const { game, session } = await setupBotGame('black');
    const d = deps();

    const result = await resignBotGame(d, session, game);

    expect(result.result).toBe('1-0');
    const updatedGame = await gamesRepo.findById(db, game.id);
    expect(updatedGame?.result).toBe('1-0');
  });
});
