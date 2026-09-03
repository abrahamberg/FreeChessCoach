import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { BotConfig, BotClockConfig } from '@freechesscoach/shared';
import { createTestDb, type TestDb } from '../../../test/helpers/db.js';
import * as gamesRepo from '../../db/repositories/games.js';
import * as sessionsRepo from '../../db/repositories/sessions.js';
import * as usersRepo from '../../db/repositories/users.js';
import type { Database } from '../../db/schema.js';
import { createSessionForGame } from '../coach-agent-session.js';
import { claimBotGameTimeout } from './bot-claim-timeout.js';

function baseBot(): BotConfig {
  return {
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
    bookPlies: 0,
    bookMistakeChance: 0
  };
}

describe('claimBotGameTimeout', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  async function setupBotGame(clock: BotClockConfig | null) {
    const user = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Ann' });
    const game = await gamesRepo.insert(db, {
      userId: user.id,
      pgn: '',
      source: 'vs_bot',
      userColor: 'white',
      whiteName: 'You',
      blackName: 'Test Bot',
      result: null,
      timeControl: clock ? `${clock.initialMs / 60000}+${clock.incrementMs / 1000}` : null,
      eco: null,
      playedAt: new Date(),
      botId: 'test-bot',
      botConfigSnapshot: baseBot(),
      clockInitialMs: clock?.initialMs ?? null,
      clockIncrementMs: clock?.incrementMs ?? null,
      whiteRemainingMs: clock?.initialMs ?? null,
      blackRemainingMs: clock?.initialMs ?? null
    });
    const session = await createSessionForGame(db, { gameId: game.id, userId: user.id, mode: 'play_bot' });
    return { game, session };
  }

  test('is a no-op for an untimed game', async () => {
    const { game, session } = await setupBotGame(null);

    const result = await claimBotGameTimeout({ db, jobQueue: { enqueueAnalyzeGame: async () => undefined, enqueueSummarizeSession: async () => undefined, enqueueBackfillGameMetadata: async () => undefined, enqueueRebuildDiagnosticProfile: async () => undefined } }, session, game);

    expect(result.gameOver).toBeNull();
    const updatedSession = await sessionsRepo.findById(db, session.id);
    expect(updatedSession?.status).toBe('active');
  });

  test('is a no-op while time genuinely remains', async () => {
    const { game, session } = await setupBotGame({ initialMs: 300000, incrementMs: 0 });

    const result = await claimBotGameTimeout({ db, jobQueue: { enqueueAnalyzeGame: async () => undefined, enqueueSummarizeSession: async () => undefined, enqueueBackfillGameMetadata: async () => undefined, enqueueRebuildDiagnosticProfile: async () => undefined } }, session, game);

    expect(result.gameOver).toBeNull();
  });

  test('finalizes the game as a loss for whoever was on move once their clock has run out', async () => {
    const { game, session } = await setupBotGame({ initialMs: 1, incrementMs: 0 });
    const jobQueue = { enqueueAnalyzeGame: async () => undefined, enqueueSummarizeSession: async () => undefined, enqueueBackfillGameMetadata: async () => undefined, enqueueRebuildDiagnosticProfile: async () => undefined };

    // session.currentPly is 0 (White to move) — a fresh game, so it's the
    // student's (White's) clock that's expired here.
    const result = await claimBotGameTimeout({ db, jobQueue }, session, game);

    expect(result.gameOver).toEqual({ result: '0-1', reason: 'timeout' });
    const updatedSession = await sessionsRepo.findById(db, session.id);
    expect(updatedSession?.status).toBe('completed');
    const updatedGame = await gamesRepo.findById(db, game.id);
    expect(updatedGame?.result).toBe('0-1');
  });
});
