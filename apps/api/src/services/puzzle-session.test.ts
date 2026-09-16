import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';
import * as puzzleAssignmentsRepo from '../db/repositories/puzzle-assignments.js';
import * as puzzleSessionsRepo from '../db/repositories/puzzle-sessions.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import { createPuzzleSession, getPuzzleSessionDetail, resumeOrCreatePuzzleSession } from './puzzle-session.js';

describe('puzzle-session service (Task 59.4)', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  async function makeUser() {
    return usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Ann' });
  }

  async function makeAssignment(userId: string) {
    return puzzleAssignmentsRepo.insert(db, {
      userId,
      diagnosisCode: 'TA-07',
      reason: 'Practice for knight forks.',
      items: [
        {
          puzzleId: 'abcd1',
          fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
          moves: ['e1e2', 'f6g4'],
          rating: 1500,
          themes: ['fork'],
          result: 'pending'
        }
      ]
    });
  }

  test('createPuzzleSession starts a session and marks the assignment in_progress', async () => {
    const user = await makeUser();
    const assignment = await makeAssignment(user.id);

    const session = await createPuzzleSession(db, user.id, assignment.id);

    expect(session.status).toBe('active');
    expect(session.currentItemIndex).toBe(0);
    const updated = await puzzleAssignmentsRepo.findById(db, assignment.id);
    expect(updated?.status).toBe('in_progress');
    expect(updated?.startedAt).not.toBeNull();
  });

  test('createPuzzleSession throws NotFoundError for another user\'s assignment', async () => {
    const owner = await makeUser();
    const stranger = await makeUser();
    const assignment = await makeAssignment(owner.id);

    await expect(createPuzzleSession(db, stranger.id, assignment.id)).rejects.toThrow(NotFoundError);
  });

  test('createPuzzleSession throws ConflictError for an already-completed assignment', async () => {
    const user = await makeUser();
    const assignment = await makeAssignment(user.id);
    await puzzleAssignmentsRepo.markCompleted(db, assignment.id);

    await expect(createPuzzleSession(db, user.id, assignment.id)).rejects.toThrow(ConflictError);
  });

  test('resumeOrCreatePuzzleSession links back into an existing active session rather than starting a second one', async () => {
    const user = await makeUser();
    const assignment = await makeAssignment(user.id);
    const first = await resumeOrCreatePuzzleSession(db, user.id, assignment.id);
    const second = await resumeOrCreatePuzzleSession(db, user.id, assignment.id);

    expect(second.id).toBe(first.id);
  });

  test('resumeOrCreatePuzzleSession starts a fresh session once the prior one is abandoned', async () => {
    const user = await makeUser();
    const assignment = await makeAssignment(user.id);
    const first = await resumeOrCreatePuzzleSession(db, user.id, assignment.id);
    await puzzleSessionsRepo.markAbandoned(db, first.id);

    const second = await resumeOrCreatePuzzleSession(db, user.id, assignment.id);

    expect(second.id).not.toBe(first.id);
  });

  test('getPuzzleSessionDetail returns messages and the assignment, scoped to the owning user', async () => {
    const user = await makeUser();
    const assignment = await makeAssignment(user.id);
    const session = await createPuzzleSession(db, user.id, assignment.id);
    await puzzleSessionsRepo.insertMessage(db, session.id, 'assistant', [{ type: 'text', text: 'hi' }], 0);

    const detail = await getPuzzleSessionDetail(db, session.id, user.id);

    expect(detail?.messages).toHaveLength(1);
    expect(detail?.assignment.id).toBe(assignment.id);
    expect(await getPuzzleSessionDetail(db, session.id, crypto.randomUUID())).toBeUndefined();
  });
});
