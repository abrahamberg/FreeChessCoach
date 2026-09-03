import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../../../test/helpers/db.js';
import type { Database } from '../schema.js';
import * as puzzleAssignmentsRepo from './puzzle-assignments.js';
import * as puzzleSessionsRepo from './puzzle-sessions.js';
import * as usersRepo from './users.js';

describe('puzzle-sessions repository (Task 59.4)', () => {
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

  test('insertSession persists a session retrievable by id and for its user', async () => {
    const user = await makeUser();
    const assignment = await makeAssignment(user.id);

    const session = await puzzleSessionsRepo.insertSession(db, { assignmentId: assignment.id, userId: user.id });

    expect(session.status).toBe('active');
    expect(session.currentItemIndex).toBe(0);
    expect(await puzzleSessionsRepo.findSessionById(db, session.id)).toMatchObject({ id: session.id });
    expect(await puzzleSessionsRepo.findSessionByIdForUser(db, session.id, user.id)).toMatchObject({ id: session.id });
    expect(await puzzleSessionsRepo.findSessionByIdForUser(db, session.id, crypto.randomUUID())).toBeUndefined();
  });

  test('findActiveByAssignmentId returns the latest active/paused session, not a completed one', async () => {
    const user = await makeUser();
    const assignment = await makeAssignment(user.id);
    const completed = await puzzleSessionsRepo.insertSession(db, { assignmentId: assignment.id, userId: user.id });
    await puzzleSessionsRepo.markCompleted(db, completed.id);
    const active = await puzzleSessionsRepo.insertSession(db, { assignmentId: assignment.id, userId: user.id });

    const found = await puzzleSessionsRepo.findActiveByAssignmentId(db, assignment.id);
    expect(found?.id).toBe(active.id);
  });

  test('advanceItemIndex, markCompleted, markAbandoned, markPausedNoCredits update status/index', async () => {
    const user = await makeUser();
    const assignment = await makeAssignment(user.id);
    const session = await puzzleSessionsRepo.insertSession(db, { assignmentId: assignment.id, userId: user.id });

    await puzzleSessionsRepo.advanceItemIndex(db, session.id, 1);
    expect((await puzzleSessionsRepo.findSessionById(db, session.id))?.currentItemIndex).toBe(1);

    await puzzleSessionsRepo.markPausedNoCredits(db, session.id);
    expect((await puzzleSessionsRepo.findSessionById(db, session.id))?.status).toBe('paused_no_credits');

    await puzzleSessionsRepo.markCompleted(db, session.id);
    const completed = await puzzleSessionsRepo.findSessionById(db, session.id);
    expect(completed?.status).toBe('completed');
    expect(completed?.endedAt).not.toBeNull();

    const other = await puzzleSessionsRepo.insertSession(db, { assignmentId: assignment.id, userId: user.id });
    await puzzleSessionsRepo.markAbandoned(db, other.id);
    expect((await puzzleSessionsRepo.findSessionById(db, other.id))?.status).toBe('abandoned');
  });

  test('insertMessage/listMessagesBySession persist and replay in append order', async () => {
    const user = await makeUser();
    const assignment = await makeAssignment(user.id);
    const session = await puzzleSessionsRepo.insertSession(db, { assignmentId: assignment.id, userId: user.id });

    await puzzleSessionsRepo.insertMessage(db, session.id, 'user', [{ type: 'text', text: 'hi' }], 0);
    await puzzleSessionsRepo.insertMessage(db, session.id, 'assistant', [{ type: 'text', text: 'hello' }], 0);

    const messages = await puzzleSessionsRepo.listMessagesBySession(db, session.id);
    expect(messages).toHaveLength(2);
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(messages[0]?.itemIndex).toBe(0);
  });
});
