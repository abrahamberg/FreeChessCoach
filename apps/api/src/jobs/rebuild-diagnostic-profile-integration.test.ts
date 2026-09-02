import { CONFIG } from '@freechesscoach/chess-analysis';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';
import * as analysesRepo from '../db/repositories/analyses.js';
import * as diagnosticObservationsRepo from '../db/repositories/diagnostic-observations.js';
import type { NewDiagnosticObservation } from '../db/repositories/diagnostic-observations.js';
import * as diagnosticProfilesRepo from '../db/repositories/diagnostic-profiles.js';
import * as gamesRepo from '../db/repositories/games.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';
import { runRebuildDiagnosticProfileJob } from './rebuild-diagnostic-profile.js';

const MIN_GAMES = CONFIG.dataQualityGates.minRatedGames;

describe('runRebuildDiagnosticProfileJob (Task 56.4, real DB — Testcontainers)', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  async function makeUser(rating: number | null = 1500) {
    const user = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Ann' });
    if (rating !== null) await usersRepo.update(db, user.id, { rating });
    return user;
  }

  async function makeRatedGame(userId: string, playedAt: Date, overrides: Partial<Parameters<typeof gamesRepo.insert>[1]> = {}) {
    return gamesRepo.insert(db, {
      userId,
      pgn: '1. e4 e5 2. Nf3 Nc6',
      source: 'lichess',
      userColor: 'white',
      whiteName: 'Ann',
      blackName: 'Bob',
      result: '1-0',
      timeControl: '600+0',
      eco: 'C50',
      playedAt,
      rated: true,
      whiteElo: 1500,
      blackElo: 1480,
      ...overrides
    });
  }

  function observation(userId: string, gameId: string, overrides: Partial<NewDiagnosticObservation> = {}): NewDiagnosticObservation {
    return {
      userId,
      gameId,
      ply: 4,
      code: 'TA-07',
      direction: 'D',
      failed: true,
      hwdl: 0.4,
      severity: 'meaningful',
      reachability: 0.7,
      detail: { text: 'missed a fork' },
      ...overrides
    };
  }

  test('writes no profile for a time control that never clears the §4.2 window minimum', async () => {
    const user = await makeUser();
    for (let i = 0; i < MIN_GAMES - 1; i++) {
      await makeRatedGame(user.id, new Date(2026, 0, i + 1));
    }

    await runRebuildDiagnosticProfileJob(db, user.id);

    expect(await diagnosticProfilesRepo.latestProfile(db, user.id, '600+0')).toBeUndefined();
  });

  test('builds and persists a profile once a time control clears the window minimum, joining game context onto each observation', async () => {
    const user = await makeUser();
    let observedGameId = '';
    const observedPly = 4;
    for (let i = 0; i < MIN_GAMES; i++) {
      const game = await makeRatedGame(user.id, new Date(2026, 1, i + 1));
      if (i === MIN_GAMES - 1) {
        const analysis = await analysesRepo.insertQueued(db, game.id);
        await analysesRepo.storeClassifiedMoves(db, analysis.id, [
          {
            ply: observedPly,
            moveSan: 'Nxe5',
            mover: 'white',
            isUserMove: true,
            cpLoss: 0,
            quality: 'good',
            bestLineSan: [],
            evalAfterCp: 0,
            hangsPiece: false,
            phase: 'middlegame'
          }
        ]);
        await diagnosticObservationsRepo.insertMany(db, [observation(user.id, game.id, { ply: observedPly })]);
        observedGameId = game.id;
      }
    }

    await runRebuildDiagnosticProfileJob(db, user.id);

    const row = await diagnosticProfilesRepo.latestProfile(db, user.id, '600+0');
    expect(row).toBeDefined();
    expect(row?.profile).toEqual([
      expect.objectContaining({ code: 'TA-07', direction: 'D', opportunities: 1, episodes: 1, failureRate: 1 })
    ]);
    expect(row?.windowStart.getTime()).toBe(new Date(2026, 1, 1).getTime());
    expect(row?.windowEnd.getTime()).toBe(new Date(2026, 1, MIN_GAMES).getTime());
    void observedGameId;
  });

  test('pools by exact time control — a second, smaller time control is skipped while the first is written', async () => {
    const user = await makeUser();
    for (let i = 0; i < MIN_GAMES; i++) {
      await makeRatedGame(user.id, new Date(2026, 2, i + 1), { timeControl: '600+0' });
    }
    for (let i = 0; i < 3; i++) {
      await makeRatedGame(user.id, new Date(2026, 2, i + 1), { timeControl: '60+0' });
    }

    await runRebuildDiagnosticProfileJob(db, user.id);

    expect(await diagnosticProfilesRepo.latestProfile(db, user.id, '600+0')).toBeDefined();
    expect(await diagnosticProfilesRepo.latestProfile(db, user.id, '60+0')).toBeUndefined();
  });

  test('re-running for an unchanged window upserts the same row instead of duplicating it', async () => {
    const user = await makeUser();
    for (let i = 0; i < MIN_GAMES; i++) {
      await makeRatedGame(user.id, new Date(2026, 3, i + 1), { timeControl: '900+0' });
    }

    await runRebuildDiagnosticProfileJob(db, user.id);
    await runRebuildDiagnosticProfileJob(db, user.id);

    const row = await diagnosticProfilesRepo.latestProfile(db, user.id, '900+0');
    expect(row).toBeDefined();
  });

  test('unrated games never count toward the window and are excluded from any built profile', async () => {
    const user = await makeUser();
    for (let i = 0; i < MIN_GAMES; i++) {
      await makeRatedGame(user.id, new Date(2026, 4, i + 1), { timeControl: '1200+0' });
    }
    const unratedGame = await makeRatedGame(user.id, new Date(2026, 4, 40), { timeControl: '1200+0', rated: false });
    await diagnosticObservationsRepo.insertMany(db, [observation(user.id, unratedGame.id)]);

    await runRebuildDiagnosticProfileJob(db, user.id);

    const row = await diagnosticProfilesRepo.latestProfile(db, user.id, '1200+0');
    expect(row?.profile).toEqual([]);
  });
});
