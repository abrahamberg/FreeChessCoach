import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';
import type { Database } from '../db/schema.js';
import * as puzzleAssignmentsRepo from '../db/repositories/puzzle-assignments.js';
import * as usersRepo from '../db/repositories/users.js';
import { buildPuzzleSessionTools, type PuzzleSessionToolsContext } from './puzzle-session-tools.js';

const TOOL_OPTIONS = { toolCallId: '1', messages: [], context: undefined } as never;

describe('puzzle-session-tools (Task 59.4)', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  async function makeAssignment() {
    const user = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Ann' });
    const assignment = await puzzleAssignmentsRepo.insert(db, {
      userId: user.id,
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
        },
        {
          puzzleId: 'efgh2',
          fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 4 4',
          moves: ['f3g5', 'd8g5'],
          rating: 1500,
          themes: ['fork'],
          result: 'pending'
        }
      ]
    });
    return { userId: user.id, assignment };
  }

  test('the tool set has no show_position, check_position, recall_move, or record_move_note', () => {
    const tools = buildPuzzleSessionTools({ userId: 'u1', assignmentId: 'a1', currentItemIndex: 0 }, { db });
    expect(Object.keys(tools).sort()).toEqual(['advance_puzzle', 'annotate_board', 'expect_move', 'hypothetical_line']);
  });

  test('annotate_board, expect_move, hypothetical_line are client tools with no execute', () => {
    const tools = buildPuzzleSessionTools({ userId: 'u1', assignmentId: 'a1', currentItemIndex: 0 }, { db });
    expect(tools.annotate_board?.execute).toBeUndefined();
    expect(tools.expect_move?.execute).toBeUndefined();
    expect(tools.hypothetical_line?.execute).toBeUndefined();
  });

  test('advance_puzzle records the result on the current item and reports isLastItem: false when more remain', async () => {
    const { userId, assignment } = await makeAssignment();
    const ctx: PuzzleSessionToolsContext = { userId, assignmentId: assignment.id, currentItemIndex: 0 };
    const tools = buildPuzzleSessionTools(ctx, { db });

    const result = await tools.advance_puzzle?.execute?.({ result: 'solved' }, TOOL_OPTIONS);

    expect(result).toEqual({ itemIndex: 0, isLastItem: false });
    const found = await puzzleAssignmentsRepo.findById(db, assignment.id);
    expect(found?.items[0]?.result).toBe('solved');
    expect(found?.items[1]?.result).toBe('pending');
  });

  test('advance_puzzle reports isLastItem: true on the final item', async () => {
    const { userId, assignment } = await makeAssignment();
    const ctx: PuzzleSessionToolsContext = { userId, assignmentId: assignment.id, currentItemIndex: 1 };
    const tools = buildPuzzleSessionTools(ctx, { db });

    const result = await tools.advance_puzzle?.execute?.({ result: 'failed' }, TOOL_OPTIONS);

    expect(result).toEqual({ itemIndex: 1, isLastItem: true });
  });

  test('advance_puzzle throws for an unknown assignment id', async () => {
    const ctx: PuzzleSessionToolsContext = { userId: 'u1', assignmentId: crypto.randomUUID(), currentItemIndex: 0 };
    const tools = buildPuzzleSessionTools(ctx, { db });

    await expect(tools.advance_puzzle?.execute?.({ result: 'skipped' }, TOOL_OPTIONS)).rejects.toThrow();
  });
});
