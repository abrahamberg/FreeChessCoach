import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../../../test/helpers/db.js';
import type { Database } from '../schema.js';
import * as puzzleAssignmentsRepo from './puzzle-assignments.js';
import type { NewPuzzleAssignment, PuzzleAssignmentItem } from './puzzle-assignments.js';
import * as usersRepo from './users.js';

describe('puzzle-assignments repository (Task 59.2)', () => {
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

  function item(overrides: Partial<PuzzleAssignmentItem> = {}): PuzzleAssignmentItem {
    return {
      puzzleId: 'abcd1',
      fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
      moves: ['e1e2', 'f6g4'],
      rating: 1500,
      themes: ['fork'],
      result: 'pending',
      ...overrides
    };
  }

  function assignment(userId: string, overrides: Partial<NewPuzzleAssignment> = {}): NewPuzzleAssignment {
    return {
      userId,
      diagnosisCode: 'TA-07',
      reason: 'You missed several knight forks in your last games.',
      items: [item(), item({ puzzleId: 'efgh2' })],
      ...overrides
    };
  }

  test('insert persists an assignment retrievable by id', async () => {
    const user = await makeUser();

    const inserted = await puzzleAssignmentsRepo.insert(db, assignment(user.id));

    expect(inserted.status).toBe('pending');
    expect(inserted.startedAt).toBeNull();
    expect(inserted.items).toHaveLength(2);

    const found = await puzzleAssignmentsRepo.findById(db, inserted.id);
    expect(found?.diagnosisCode).toBe('TA-07');
    expect(found?.items[0]?.puzzleId).toBe('abcd1');
  });

  test('findById returns undefined for an unknown id', async () => {
    expect(await puzzleAssignmentsRepo.findById(db, crypto.randomUUID())).toBeUndefined();
  });

  test('listOpenForUser returns pending and in_progress but not completed, newest first', async () => {
    const user = await makeUser();
    const pending = await puzzleAssignmentsRepo.insert(db, assignment(user.id, { diagnosisCode: 'TA-07' }));
    const inProgress = await puzzleAssignmentsRepo.insert(db, assignment(user.id, { diagnosisCode: 'TA-08' }));
    await puzzleAssignmentsRepo.markStarted(db, inProgress.id);
    const completed = await puzzleAssignmentsRepo.insert(db, assignment(user.id, { diagnosisCode: 'TA-09' }));
    await puzzleAssignmentsRepo.markCompleted(db, completed.id);

    const open = await puzzleAssignmentsRepo.listOpenForUser(db, user.id);

    expect(open.map((row) => row.id).sort()).toEqual([inProgress.id, pending.id].sort());
  });

  test('hasOpenAssignment is true for pending/in_progress and false once completed', async () => {
    const user = await makeUser();
    const created = await puzzleAssignmentsRepo.insert(db, assignment(user.id, { diagnosisCode: 'TA-10' }));

    expect(await puzzleAssignmentsRepo.hasOpenAssignment(db, user.id, 'TA-10')).toBe(true);
    expect(await puzzleAssignmentsRepo.hasOpenAssignment(db, user.id, 'TA-11')).toBe(false);

    await puzzleAssignmentsRepo.markCompleted(db, created.id);
    expect(await puzzleAssignmentsRepo.hasOpenAssignment(db, user.id, 'TA-10')).toBe(false);
  });

  test('updateItems replaces the items array', async () => {
    const user = await makeUser();
    const created = await puzzleAssignmentsRepo.insert(db, assignment(user.id));

    const solved = created.items.map((row, index) => (index === 0 ? { ...row, result: 'solved' as const } : row));
    await puzzleAssignmentsRepo.updateItems(db, created.id, solved);

    const found = await puzzleAssignmentsRepo.findById(db, created.id);
    expect(found?.items[0]?.result).toBe('solved');
    expect(found?.items[1]?.result).toBe('pending');
  });

  test('markStarted sets status and startedAt only from pending', async () => {
    const user = await makeUser();
    const created = await puzzleAssignmentsRepo.insert(db, assignment(user.id));

    await puzzleAssignmentsRepo.markStarted(db, created.id);
    const started = await puzzleAssignmentsRepo.findById(db, created.id);
    expect(started?.status).toBe('in_progress');
    expect(started?.startedAt).not.toBeNull();
  });

  test('markCompleted sets status and completedAt', async () => {
    const user = await makeUser();
    const created = await puzzleAssignmentsRepo.insert(db, assignment(user.id));

    await puzzleAssignmentsRepo.markCompleted(db, created.id);
    const completed = await puzzleAssignmentsRepo.findById(db, created.id);
    expect(completed?.status).toBe('completed');
    expect(completed?.completedAt).not.toBeNull();
  });
});
