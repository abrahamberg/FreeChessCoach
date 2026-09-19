import type { Kysely } from 'kysely';
import type { PuzzleAssignmentItemResult, PuzzleAssignmentRow } from '../db/repositories/puzzle-assignments.js';
import * as puzzleAssignmentsRepo from '../db/repositories/puzzle-assignments.js';
import type { PuzzleSessionRow } from '../db/repositories/puzzle-sessions.js';
import * as puzzleSessionsRepo from '../db/repositories/puzzle-sessions.js';
import type { Database } from '../db/schema.js';

export interface PuzzleItemAdvanceResult {
  itemIndex: number;
  isLastItem: boolean;
}

/**
 * Records one item's outcome and moves the session/assignment on — shared by
 * the coach's `advance_puzzle` tool (puzzle-session-tools.ts) and the
 * deterministic "next puzzle" action the client can fire on its own once
 * `attempt-move` reports `lineComplete` (routes/puzzle-sessions.ts), so a
 * student is never stuck waiting on the LLM to call a tool it might not call.
 *
 * Runs synchronously inside whichever caller decided to advance (previously
 * this write happened in puzzle-session-turn.ts's `onFinish`, well after the
 * tool's result had already streamed to the client — a client that refetched
 * the instant it saw that result could read the session before this write
 * landed). Idempotent against `session.currentItemIndex` having already
 * moved past `itemIndex` — whichever of the two callers gets here first wins;
 * the other becomes a no-op read of the already-current state instead of
 * advancing a second item.
 */
export async function advancePuzzleItem(
  db: Kysely<Database>,
  assignment: PuzzleAssignmentRow,
  session: PuzzleSessionRow,
  itemIndex: number,
  result: PuzzleAssignmentItemResult
): Promise<PuzzleItemAdvanceResult> {
  const isLastItem = itemIndex >= assignment.items.length - 1;
  if (session.currentItemIndex !== itemIndex) return { itemIndex, isLastItem };

  const items = assignment.items.map((item, index) => (index === itemIndex ? { ...item, result } : item));
  await puzzleAssignmentsRepo.updateItems(db, assignment.id, items);

  if (isLastItem) {
    await puzzleSessionsRepo.markCompleted(db, session.id);
    await puzzleAssignmentsRepo.markCompleted(db, assignment.id);
  } else {
    await puzzleSessionsRepo.advanceItemIndex(db, session.id, itemIndex + 1);
  }
  return { itemIndex, isLastItem };
}
