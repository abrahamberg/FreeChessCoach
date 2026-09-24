import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';
import * as puzzleAssignmentsRepo from '../db/repositories/puzzle-assignments.js';
import * as puzzleSessionsRepo from '../db/repositories/puzzle-sessions.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';
import { ConflictError } from '../lib/errors.js';
import { playNextPuzzleMove } from './puzzle-move-commit.js';
import { resetPuzzleSession } from './puzzle-session.js';

describe('playNextPuzzleMove', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  // Known line: e1e2 (opponent setup), g8f6 (student), e2e1 (forced reply),
  // f6e4 (student captures).
  async function seed(moves: string[]) {
    const user = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Ann' });
    const assignment = await puzzleAssignmentsRepo.insert(db, {
      userId: user.id,
      diagnosisCode: 'TA-07',
      reason: 'Practice for knight forks.',
      items: [
        {
          puzzleId: 'abcd1',
          fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
          moves,
          rating: 1500,
          themes: ['fork'],
          result: 'pending'
        }
      ]
    });
    const session = await puzzleSessionsRepo.insertSession(db, { assignmentId: assignment.id, userId: user.id });
    return { assignment, session };
  }

  test('plays the student move and the forced reply, then advances the stored ply', async () => {
    const { assignment, session } = await seed(['e1e2', 'g8f6', 'e2e1', 'f6e4']);
    const played = await playNextPuzzleMove(db, session, assignment);

    expect(played).toMatchObject({ san: 'Nf6', replySan: 'Ke1', currentPly: 3, lineComplete: false });
    const after = await puzzleSessionsRepo.findSessionById(db, session.id);
    expect(after?.currentPly).toBe(3);
  });

  test('the last student move has no reply and completes the line', async () => {
    const { assignment, session } = await seed(['e1e2', 'g8f6']);
    const played = await playNextPuzzleMove(db, session, assignment);

    expect(played).toMatchObject({ san: 'Nf6', replySan: null, currentPly: 2, lineComplete: true, next: expect.stringContaining('advance_puzzle') });
  });

  test('refuses once the line is fully played out', async () => {
    const { assignment, session } = await seed(['e1e2', 'g8f6']);
    await playNextPuzzleMove(db, session, assignment);
    const advanced = await puzzleSessionsRepo.findSessionById(db, session.id);

    await expect(playNextPuzzleMove(db, advanced!, assignment)).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('resetPuzzleSession', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  test('abandons the session and opens a fresh one on the same item at its setup position', async () => {
    const user = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Ann' });
    const item = {
      puzzleId: 'p1',
      fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
      moves: ['e1e2', 'g8f6', 'e2e1', 'f6e4'],
      rating: 1500,
      themes: ['fork'],
      result: 'pending' as const
    };
    const assignment = await puzzleAssignmentsRepo.insert(db, {
      userId: user.id,
      diagnosisCode: 'TA-07',
      reason: 'r',
      items: [item, { ...item, puzzleId: 'p2' }]
    });
    const session = await puzzleSessionsRepo.insertSession(db, { assignmentId: assignment.id, userId: user.id, currentItemIndex: 1 });
    await puzzleSessionsRepo.advancePly(db, session.id, 3);

    const fresh = await resetPuzzleSession(db, user.id, session.id);

    expect(fresh.id).not.toBe(session.id);
    expect(fresh).toMatchObject({ status: 'active', currentItemIndex: 1, currentPly: 1 });
    expect((await puzzleSessionsRepo.findSessionById(db, session.id))?.status).toBe('abandoned');
    await expect(resetPuzzleSession(db, user.id, session.id)).rejects.toBeInstanceOf(ConflictError);
  });
});
