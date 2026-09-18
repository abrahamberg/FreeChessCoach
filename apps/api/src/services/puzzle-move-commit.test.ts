import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';
import * as puzzleAssignmentsRepo from '../db/repositories/puzzle-assignments.js';
import type { PuzzleAssignmentRow } from '../db/repositories/puzzle-assignments.js';
import * as puzzleSessionsRepo from '../db/repositories/puzzle-sessions.js';
import type { PuzzleSessionRow } from '../db/repositories/puzzle-sessions.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';
import { commitPuzzleMoveAttempt } from './puzzle-move-commit.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
// 1.e4 e5 2.Nf3 Nc6 — moves[0] is the "opponent's setup move" convention
// (see puzzle-coach-system.ts); currentPly starts at 1, so e7e5 is the
// student's first expected move.
const LINE = ['e2e4', 'e7e5', 'g1f3', 'b8c6'];

describe('commitPuzzleMoveAttempt (focused-session rework)', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  async function makeSessionAndAssignment(): Promise<{ session: PuzzleSessionRow; assignment: PuzzleAssignmentRow }> {
    const user = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Ann' });
    const assignment = await puzzleAssignmentsRepo.insert(db, {
      userId: user.id,
      diagnosisCode: 'TA-07',
      reason: 'Practice for knight forks.',
      items: [{ puzzleId: 'abcd1', fen: START_FEN, moves: LINE, rating: 1500, themes: ['fork'], result: 'pending' }]
    });
    const session = await puzzleSessionsRepo.insertSession(db, { assignmentId: assignment.id, userId: user.id });
    return { session, assignment };
  }

  test('a move matching the line commits, auto-plays the forced opponent reply, and advances two plies', async () => {
    const { session, assignment } = await makeSessionAndAssignment();

    const result = await commitPuzzleMoveAttempt(db, session, assignment, 'e7e5');

    expect(result.accepted).toBe(true);
    expect(result.currentPly).toBe(3); // student's e5 (ply 2) + auto-played Nf3 (ply 3)
    expect(result.lineComplete).toBe(false);
    expect(result.fen).toContain(' b '); // Black to move after White's auto-played 2.Nf3
  });

  test('a legal move off the line is rejected without touching the position', async () => {
    const { session, assignment } = await makeSessionAndAssignment();
    const before = await commitPuzzleMoveAttempt(db, session, assignment, 'g8f6'); // legal, but not e7e5

    expect(before.accepted).toBe(false);
    expect(before.currentPly).toBe(1);
    expect(before.lineComplete).toBe(false);

    const reloaded = await puzzleSessionsRepo.findSessionById(db, session.id);
    expect(reloaded?.currentPly).toBe(1); // nothing persisted
  });

  test('a chess-illegal move is rejected the same way as an off-line legal one', async () => {
    const { session, assignment } = await makeSessionAndAssignment();

    const result = await commitPuzzleMoveAttempt(db, session, assignment, 'e2e5'); // not a legal pawn move

    expect(result.accepted).toBe(false);
    expect(result.currentPly).toBe(1);
  });

  test('a move on the line with no forced reply left advances one ply and reports the line complete', async () => {
    const { session, assignment } = await makeSessionAndAssignment();
    await commitPuzzleMoveAttempt(db, session, assignment, 'e7e5'); // -> ply 3
    const afterFirst = await puzzleSessionsRepo.findSessionById(db, session.id);

    const result = await commitPuzzleMoveAttempt(db, afterFirst!, assignment, 'b8c6'); // the line's last move

    expect(result.accepted).toBe(true);
    expect(result.currentPly).toBe(4);
    expect(result.lineComplete).toBe(true);
  });

  test('the accepted fen exactly matches the known position after 1.e4 e5 2.Nf3', async () => {
    const { session, assignment } = await makeSessionAndAssignment();

    const result = await commitPuzzleMoveAttempt(db, session, assignment, 'e7e5');

    expect(result.fen).toBe('rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2');
  });
});
