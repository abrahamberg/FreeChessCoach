import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { buildApp } from '../app.js';
import * as puzzleAssignmentsRepo from '../db/repositories/puzzle-assignments.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';

describe('puzzle-assignments routes (Task 59.4)', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  function headersFor(user: { email: string; displayName: string }) {
    return { 'x-auth-request-email': user.email, 'x-auth-request-user': user.displayName };
  }

  test('GET /api/puzzle-assignments lists only the caller\'s open assignments', async () => {
    const user = await usersRepo.insert(db, { email: 'list@example.com', displayName: 'Ann' });
    const other = await usersRepo.insert(db, { email: 'other@example.com', displayName: 'Bob' });
    const item = {
      puzzleId: 'abcd1',
      fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
      moves: ['e1e2', 'f6g4'],
      rating: 1500,
      themes: ['fork'],
      result: 'pending' as const
    };
    const mine = await puzzleAssignmentsRepo.insert(db, { userId: user.id, diagnosisCode: 'TA-07', reason: 'Forks.', items: [item] });
    await puzzleAssignmentsRepo.insert(db, { userId: other.id, diagnosisCode: 'TA-07', reason: 'Forks.', items: [item] });
    const completed = await puzzleAssignmentsRepo.insert(db, { userId: user.id, diagnosisCode: 'TA-08', reason: 'Pawn forks.', items: [item] });
    await puzzleAssignmentsRepo.markCompleted(db, completed.id);

    const app = buildApp({ authMode: 'proxy', db });
    const response = await app.inject({ method: 'GET', url: '/api/puzzle-assignments', headers: headersFor(user) });

    expect(response.statusCode).toBe(200);
    const ids = (response.json() as Array<{ id: string }>).map((row) => row.id);
    expect(ids).toEqual([mine.id]);
  });
});
