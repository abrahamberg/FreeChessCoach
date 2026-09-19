import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';
import * as puzzleAssignmentsRepo from '../db/repositories/puzzle-assignments.js';
import * as puzzleSessionsRepo from '../db/repositories/puzzle-sessions.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';
import { advancePuzzleItem } from './puzzle-item-advance.js';

describe('advancePuzzleItem', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  async function makeAssignmentAndSession(twoItems = true) {
    const user = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Ann' });
    const assignment = await puzzleAssignmentsRepo.insert(db, {
      userId: user.id,
      diagnosisCode: 'TA-07',
      reason: 'Practice for knight forks.',
      items: [
        { puzzleId: 'abcd1', fen: 'fen-1', moves: ['e1e2', 'f6g4'], rating: 1500, themes: ['fork'], result: 'pending' },
        ...(twoItems
          ? [{ puzzleId: 'efgh2', fen: 'fen-2', moves: ['f3g5', 'd8g5'], rating: 1500, themes: ['fork'], result: 'pending' as const }]
          : [])
      ]
    });
    const session = await puzzleSessionsRepo.insertSession(db, { assignmentId: assignment.id, userId: user.id });
    return { assignment, session };
  }

  test('records the item result and moves the session to the next item when more remain', async () => {
    const { assignment, session } = await makeAssignmentAndSession(true);

    const result = await advancePuzzleItem(db, assignment, session, 0, 'solved');

    expect(result).toEqual({ itemIndex: 0, isLastItem: false });
    const updatedAssignment = await puzzleAssignmentsRepo.findById(db, assignment.id);
    expect(updatedAssignment?.items[0]?.result).toBe('solved');
    const updatedSession = await puzzleSessionsRepo.findSessionById(db, session.id);
    expect(updatedSession?.currentItemIndex).toBe(1);
    expect(updatedSession?.currentPly).toBe(1);
    expect(updatedSession?.status).toBe('active');
  });

  test('completes the session and the assignment on the final item', async () => {
    const { assignment, session } = await makeAssignmentAndSession(false);

    const result = await advancePuzzleItem(db, assignment, session, 0, 'failed');

    expect(result).toEqual({ itemIndex: 0, isLastItem: true });
    const updatedSession = await puzzleSessionsRepo.findSessionById(db, session.id);
    expect(updatedSession?.status).toBe('completed');
    const updatedAssignment = await puzzleAssignmentsRepo.findById(db, assignment.id);
    expect(updatedAssignment?.status).toBe('completed');
  });

  test('is a no-op when the session has already moved past this item', async () => {
    const { assignment, session } = await makeAssignmentAndSession(true);
    await advancePuzzleItem(db, assignment, session, 0, 'solved');
    const staleSession = session; // itemIndex 0, as originally fetched

    const result = await advancePuzzleItem(db, assignment, staleSession, 0, 'solved');

    expect(result).toEqual({ itemIndex: 0, isLastItem: false });
    const updatedAssignment = await puzzleAssignmentsRepo.findById(db, assignment.id);
    // Second call never re-wrote item 1's result — it read the stale session
    // and bailed out instead of racing the first call's own advancement.
    expect(updatedAssignment?.items[1]?.result).toBe('pending');
    const updatedSession = await puzzleSessionsRepo.findSessionById(db, session.id);
    expect(updatedSession?.currentItemIndex).toBe(1);
  });
});
