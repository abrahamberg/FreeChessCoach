import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import * as analysesRepo from '../db/repositories/analyses.js';
import * as diagnosticObservationsRepo from '../db/repositories/diagnostic-observations.js';
import * as focusAreasRepo from '../db/repositories/focus-areas.js';
import * as gamesRepo from '../db/repositories/games.js';
import * as sessionsRepo from '../db/repositories/sessions.js';
import * as studentMemoryRepo from '../db/repositories/student-memory.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';
import { loadProgressDossier } from './progress-dossier.js';

describe('loadProgressDossier', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  async function seedGame(userId: string, playedAt: Date, result: string, observations: { code: 'BV-04' | 'BV-02'; failed: boolean }[]) {
    const game = await gamesRepo.insert(db, {
      userId,
      pgn: '1. e4 e5',
      source: 'paste',
      userColor: 'white',
      whiteName: 'Daniel',
      blackName: 'blitzfox7',
      result,
      timeControl: '600+0',
      eco: null,
      playedAt
    });
    const analysis = await analysesRepo.insertQueued(db, game.id);
    await analysesRepo.markReady(db, analysis.id);
    await diagnosticObservationsRepo.insertMany(
      db,
      observations.map((row, index) => ({ userId, gameId: game.id, ply: 10 + index, code: row.code, direction: 'D', failed: row.failed, hwdl: 1, severity: 'meaningful', reachability: 0.8 }))
    );
    return game;
  }

  test('reads habits with per-game results, the improved list with a come-back flag, the memory and the new games', async () => {
    const user = await usersRepo.insert(db, { email: 'dossier@example.com', displayName: 'Daniel' });
    await focusAreasRepo.insert(db, { userId: user.id, category: 'hanging_piece', diagnosisCode: 'BV-04', status: 'active', note: 'Does not scan for loose pieces unprompted.' });
    const graduated = await focusAreasRepo.insert(db, { userId: user.id, category: 'hanging_piece', diagnosisCode: 'BV-02', status: 'graduated', note: 'Counts defenders reliably.' });
    await studentMemoryRepo.upsert(db, user.id, 'Responds to being asked what the opponent threatens.');

    const before = new Date(graduated.graduatedAt!.getTime() - 3 * 86_400_000);
    const after = new Date(graduated.graduatedAt!.getTime() + 86_400_000);
    const oldGame = await seedGame(user.id, before, '1-0', [{ code: 'BV-04', failed: true }, { code: 'BV-02', failed: true }]);

    // The previous session ends after the old game was imported and before the new one is.
    const previous = await sessionsRepo.insert(db, { gameId: oldGame.id, userId: user.id });
    await sessionsRepo.markCompleted(db, previous.id);
    await new Promise((resolve) => setTimeout(resolve, 30));
    const newest = await seedGame(user.id, after, '0-1', [{ code: 'BV-04', failed: false }, { code: 'BV-02', failed: true }]);
    const current = await sessionsRepo.insert(db, { gameId: newest.id, userId: user.id });

    const dossier = await loadProgressDossier(db, user.id, current.id);

    expect(dossier.areas).toHaveLength(1);
    expect(dossier.areas[0]?.results).toEqual([
      expect.objectContaining({ opportunities: 1, failures: 1 }),
      expect.objectContaining({ opportunities: 1, failures: 0, isNew: true })
    ]);
    expect(dossier.graduated).toEqual([expect.objectContaining({ cameBack: true })]);
    expect(dossier.memory).toBe('Responds to being asked what the opponent threatens.');
    expect(dossier.newGames).toHaveLength(1);
    expect(dossier.newGames[0]?.label).toBe('vs blitzfox7, lost, 600+0');
  });

  test('a student with nothing yet gets an empty, well-formed dossier', async () => {
    const user = await usersRepo.insert(db, { email: 'dossier-empty@example.com', displayName: 'Ann' });
    const game = await gamesRepo.insert(db, { userId: user.id, pgn: '1. e4', source: 'paste', userColor: 'white', whiteName: null, blackName: null, result: null, timeControl: null, eco: null, playedAt: null });
    const session = await sessionsRepo.insert(db, { gameId: game.id, userId: user.id });

    const dossier = await loadProgressDossier(db, user.id, session.id);

    expect(dossier).toMatchObject({ areas: [], graduated: [], memory: null, lessons: [], newGames: [] });
  });
});
