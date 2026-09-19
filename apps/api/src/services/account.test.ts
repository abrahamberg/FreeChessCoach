import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import * as diagnosticProfilesRepo from '../db/repositories/diagnostic-profiles.js';
import * as findingsRepo from '../db/repositories/findings.js';
import * as focusAreasRepo from '../db/repositories/focus-areas.js';
import * as gameImportEventsRepo from '../db/repositories/game-import-events.js';
import * as gamesRepo from '../db/repositories/games.js';
import * as llmSetupsRepo from '../db/repositories/llm-setups.js';
import * as puzzleAssignmentsRepo from '../db/repositories/puzzle-assignments.js';
import * as puzzleSessionsRepo from '../db/repositories/puzzle-sessions.js';
import * as sessionsRepo from '../db/repositories/sessions.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';
import { deleteAccount } from './account.js';

describe('account service', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  /** Seeds one row in every table that hangs off a user, directly, so the
   * cascade's correctness (not the routes that would normally create these
   * rows) is what's under test. */
  async function seedFullAccount(email: string) {
    const user = await usersRepo.insert(db, { email, displayName: email });

    const game = await gamesRepo.insert(db, {
      userId: user.id,
      pgn: '1. e4 e5',
      source: 'paste',
      userColor: 'white',
      whiteName: null,
      blackName: null,
      result: null,
      timeControl: null,
      eco: null,
      playedAt: null
    });
    const session = await sessionsRepo.insert(db, { gameId: game.id, userId: user.id });
    await db
      .insertInto('sessionMessages')
      .values({ sessionId: session.id, role: 'user', content: JSON.stringify({ text: 'hi' }), ply: 0 })
      .execute();
    await db
      .insertInto('sessionMoveNotes')
      .values({ sessionId: session.id, ply: 0, note: 'A note.' })
      .execute();

    await findingsRepo.insert(db, {
      userId: user.id,
      sessionId: null,
      gameId: game.id,
      category: 'king_safety',
      severity: 'significant',
      ply: 14,
      description: 'Delayed castling.',
      isPositive: false
    });
    // A finding with no gameId at all — the account-level catch-all
    // (findingsRepo.deleteByUserId) is what has to remove this one, since
    // no per-game cascade will ever reach it.
    await findingsRepo.insert(db, {
      userId: user.id,
      sessionId: null,
      gameId: null,
      category: 'passive_play',
      severity: 'minor',
      ply: null,
      description: 'Standalone finding.',
      isPositive: false
    });

    await focusAreasRepo.insert(db, {
      userId: user.id,
      category: 'king_safety',
      diagnosisCode: 'MS-01',
      status: 'active',
      note: 'Delays castling under pressure.'
    });

    await diagnosticProfilesRepo.upsertProfile(db, user.id, '600+0', new Date('2026-01-01'), new Date('2026-02-01'), []);

    const assignment = await puzzleAssignmentsRepo.insert(db, {
      userId: user.id,
      diagnosisCode: 'MS-01',
      reason: 'King safety practice.',
      items: []
    });
    const puzzleSession = await puzzleSessionsRepo.insertSession(db, { assignmentId: assignment.id, userId: user.id });
    await puzzleSessionsRepo.insertMessage(db, puzzleSession.id, 'user', { text: 'hi' });

    await gameImportEventsRepo.record(db, user.id, new Date());

    await llmSetupsRepo.upsert(db, user.id, Buffer.from('cipher'), Buffer.from('iv'), Buffer.from('salt'));

    return { userId: user.id, gameId: game.id, sessionId: session.id, puzzleSessionId: puzzleSession.id, assignmentId: assignment.id };
  }

  test('removes the user row and every dependent row across the whole schema', async () => {
    const seeded = await seedFullAccount('delete-me@example.com');

    await deleteAccount(db, seeded.userId);

    expect(await usersRepo.findById(db, seeded.userId)).toBeUndefined();
    expect(await gamesRepo.findById(db, seeded.gameId)).toBeUndefined();
    expect(await sessionsRepo.findById(db, seeded.sessionId)).toBeUndefined();
    await expect(
      db.selectFrom('sessionMessages').selectAll().where('sessionId', '=', seeded.sessionId).execute()
    ).resolves.toHaveLength(0);
    await expect(
      db.selectFrom('sessionMoveNotes').selectAll().where('sessionId', '=', seeded.sessionId).execute()
    ).resolves.toHaveLength(0);
    await expect(
      db.selectFrom('findings').selectAll().where('userId', '=', seeded.userId).execute()
    ).resolves.toHaveLength(0);
    await expect(
      db.selectFrom('focusAreas').selectAll().where('userId', '=', seeded.userId).execute()
    ).resolves.toHaveLength(0);
    await expect(
      db.selectFrom('diagnosticProfiles').selectAll().where('userId', '=', seeded.userId).execute()
    ).resolves.toHaveLength(0);
    expect(await puzzleAssignmentsRepo.findById(db, seeded.assignmentId)).toBeUndefined();
    expect(await puzzleSessionsRepo.findSessionById(db, seeded.puzzleSessionId)).toBeUndefined();
    await expect(
      puzzleSessionsRepo.listMessagesBySession(db, seeded.puzzleSessionId)
    ).resolves.toHaveLength(0);
    expect(await llmSetupsRepo.findByUser(db, seeded.userId)).toBeUndefined();
    await expect(
      db.selectFrom('gameImportEvents').selectAll().where('userId', '=', seeded.userId).execute()
    ).resolves.toHaveLength(0);
  });

  test('leaves other users\' data intact', async () => {
    const survivor = await seedFullAccount('survivor@example.com');
    const victim = await seedFullAccount('victim@example.com');

    await deleteAccount(db, victim.userId);

    expect(await usersRepo.findById(db, survivor.userId)).toBeDefined();
    expect(await gamesRepo.findById(db, survivor.gameId)).toBeDefined();
    expect(await puzzleAssignmentsRepo.findById(db, survivor.assignmentId)).toBeDefined();
  });
});
