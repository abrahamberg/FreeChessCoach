import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { BOT_ROSTER, DAILY_IMPORT_LIMIT, MAX_IN_FLIGHT_IMPORTS, WEEKLY_IMPORT_LIMIT } from '@freechesscoach/shared';
import * as analysesRepo from '../db/repositories/analyses.js';
import * as gameImportEventsRepo from '../db/repositories/game-import-events.js';
import * as gamesRepo from '../db/repositories/games.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';
import type { JobQueue } from '../jobs/queue.js';
import { ImportLimitError } from '../lib/errors.js';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';
import { deleteGameForUser } from './games.js';
import { importGame } from './game-import.js';

const PGN = `[Event "Test"]
[White "Ann"]
[Black "Bob"]
[Result "1-0"]

1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0`;

const HOUR_MS = 3_600_000;
const USERNAMES = { displayName: 'Ann' };

describe('importGame — quota enforcement', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;
  const jobQueue: JobQueue = {
    enqueueAnalyzeGame: vi.fn().mockResolvedValue(undefined),
    enqueueSummarizeSession: vi.fn().mockResolvedValue(undefined),
    enqueueBackfillGameMetadata: vi.fn().mockResolvedValue(undefined),
    enqueueRebuildDiagnosticProfile: vi.fn().mockResolvedValue(undefined)
  };

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  function newUser(): Promise<{ id: string }> {
    return usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Ann' });
  }

  let round = 0;
  /** A genuinely different game each call — the dedup guard would otherwise
   * resolve a repeated PGN to the same row instead of counting it. */
  function uniquePgn(): string {
    round += 1;
    return PGN.replace('[Event "Test"]', `[Event "Test"]\n[Round "${round}"]`);
  }

  /** Deferred, so no analysis row exists and the in-flight cap stays out of
   * the way of the daily/weekly tests. */
  function importDeferred(userId: string) {
    return importGame(db, jobQueue, userId, USERNAMES, { pgn: uniquePgn(), source: 'paste', userColor: 'white', deferAnalysis: true });
  }

  function importAnalyzed(userId: string) {
    return importGame(db, jobQueue, userId, USERNAMES, { pgn: uniquePgn(), source: 'paste', userColor: 'white' });
  }

  async function expectBlockedBy(userId: string, limit: 'daily' | 'weekly' | 'in_flight') {
    const attempt = importDeferred(userId);
    await expect(attempt).rejects.toBeInstanceOf(ImportLimitError);
    await expect(attempt).rejects.toMatchObject({ status: 429, limit });
  }

  test('the daily limit blocks the 31st import in 24h', async () => {
    const user = await newUser();
    for (let i = 0; i < DAILY_IMPORT_LIMIT; i++) await importDeferred(user.id);

    await expectBlockedBy(user.id, 'daily');
  });

  test('the weekly limit blocks when the daily window is clear but 150 imports fall in 7 days', async () => {
    const user = await newUser();
    const twoDaysAgo = new Date(Date.now() - 48 * HOUR_MS);
    for (let i = 0; i < WEEKLY_IMPORT_LIMIT; i++) await gameImportEventsRepo.record(db, user.id, twoDaysAgo);

    await expectBlockedBy(user.id, 'weekly');
  });

  test('deleting a game does not reopen quota', async () => {
    const user = await newUser();
    const first = await importDeferred(user.id);
    for (let i = 1; i < DAILY_IMPORT_LIMIT; i++) await importDeferred(user.id);

    await deleteGameForUser(db, first.gameId, user.id);

    await expectBlockedBy(user.id, 'daily');
  });

  test('the in-flight cap blocks the 11th while 10 analyses are queued, and clears once one is ready', async () => {
    const user = await newUser();
    const analyses: string[] = [];
    for (let i = 0; i < MAX_IN_FLIGHT_IMPORTS; i++) {
      const imported = await importAnalyzed(user.id);
      analyses.push(imported.analysisId as string);
    }

    await expectBlockedBy(user.id, 'in_flight');

    await analysesRepo.markReady(db, analyses[0] as string);
    await expect(importDeferred(user.id)).resolves.toBeDefined();
  });

  test('bot and coach games do not consume import quota', async () => {
    const user = await newUser();
    for (const source of ['coach_play', 'vs_bot'] as const) {
      for (let i = 0; i < DAILY_IMPORT_LIMIT; i++) {
        await gamesRepo.insert(db, {
          userId: user.id, pgn: '', source, userColor: 'white', whiteName: null, blackName: null,
          result: null, timeControl: null, eco: null, playedAt: null,
          ...(source === 'vs_bot' ? { botId: BOT_ROSTER[0]!.id, botConfigSnapshot: BOT_ROSTER[0]! } : {})
        });
      }
    }

    await expect(importDeferred(user.id)).resolves.toBeDefined();
  });

  test('a duplicate PGN returns the existing game, writes no ledger row and is never blocked', async () => {
    const user = await newUser();
    const pgn = uniquePgn();
    const first = await importGame(db, jobQueue, user.id, USERNAMES, { pgn, source: 'paste', userColor: 'white', deferAnalysis: true });
    for (let i = 1; i < DAILY_IMPORT_LIMIT; i++) await importDeferred(user.id);
    const before = await gameImportEventsRepo.countSince(db, user.id, new Date(Date.now() - 24 * HOUR_MS));

    const again = await importGame(db, jobQueue, user.id, USERNAMES, { pgn, source: 'paste', userColor: 'white', deferAnalysis: true });

    expect(again.gameId).toBe(first.gameId);
    expect(await gameImportEventsRepo.countSince(db, user.id, new Date(Date.now() - 24 * HOUR_MS))).toBe(before);
  });

  test('an import that fails after the quota check does not burn quota', async () => {
    const user = await newUser();
    await expect(
      importGame(db, jobQueue, user.id, USERNAMES, { pgn: '1. e4 e5 2. Zz9 garbage', source: 'paste', userColor: 'white' })
    ).rejects.toThrow();

    expect(await gameImportEventsRepo.countSince(db, user.id, new Date(Date.now() - HOUR_MS))).toBe(0);
  });
});
