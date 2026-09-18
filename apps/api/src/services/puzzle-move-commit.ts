import { applyUciSequence } from '@freechesscoach/chess-analysis';
import type { AttemptPuzzleMoveResponse } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import type { PuzzleAssignmentRow } from '../db/repositories/puzzle-assignments.js';
import * as puzzleSessionsRepo from '../db/repositories/puzzle-sessions.js';
import type { PuzzleSessionRow } from '../db/repositories/puzzle-sessions.js';
import type { Database } from '../db/schema.js';
import { ConflictError } from '../lib/errors.js';
import { currentPuzzleFen } from './puzzle-session.js';

/**
 * The deterministic half of the focused-session rework — whether an
 * attempted move is "real" (matches `item.moves[currentPly]`) is decided
 * here, synchronously, before any LLM turn exists to judge it in prose
 * (mirrors `check_moves`'s old purely-narrative role, which this replaces
 * for the accept/reject decision itself — `check_moves` stays available for
 * the coach to *explain* consequences of any move during discussion).
 *
 * Matching compares resulting positions, not raw UCI strings — deliberately
 * more permissive than exact-string equality (any move that reaches the
 * same square-for-square position as the known solution ply counts,
 * transpositions included) and sidesteps UCI encoding quirks
 * (castling notation, promotion case) that raw string comparison would trip
 * over. Nothing is persisted on rejection — the client already holds the
 * last-committed fen locally to revert to; this only needs to say "no."
 */
export async function commitPuzzleMoveAttempt(
  db: Kysely<Database>,
  session: PuzzleSessionRow,
  assignment: PuzzleAssignmentRow,
  attemptedUci: string
): Promise<AttemptPuzzleMoveResponse> {
  const item = assignment.items[session.currentItemIndex];
  if (!item) throw new ConflictError('This session has no current puzzle — it may already be complete');

  const beforeFen = currentPuzzleFen(session, assignment);
  const expectedUci = item.moves[session.currentPly];
  const lineAlreadyComplete = expectedUci === undefined;

  const matched = !lineAlreadyComplete && sameResultingPosition(beforeFen, attemptedUci, expectedUci);
  if (!matched) {
    return { accepted: false, fen: beforeFen, currentPly: session.currentPly, lineComplete: lineAlreadyComplete };
  }

  // The student's move, then any forced opponent reply the line names next
  // — auto-applied the same way the item's own moves[0] setup move is (see
  // insertSession/advanceItemIndex), no student decision involved either way.
  let ply = session.currentPly + 1;
  const opponentReply = item.moves[ply];
  const toApply = opponentReply !== undefined ? [expectedUci, opponentReply] : [expectedUci];
  if (opponentReply !== undefined) ply += 1;

  const { moves, error } = applyUciSequence(beforeFen, toApply);
  const fen = error ? beforeFen : (moves.at(-1)?.fen ?? beforeFen);

  await puzzleSessionsRepo.advancePly(db, session.id, ply);
  return { accepted: true, fen, currentPly: ply, lineComplete: ply >= item.moves.length };
}

function sameResultingPosition(beforeFen: string, attemptedUci: string, expectedUci: string): boolean {
  const attempted = applyUciSequence(beforeFen, [attemptedUci]);
  const expected = applyUciSequence(beforeFen, [expectedUci]);
  if (attempted.error || expected.error) return false;
  return attempted.moves[0]?.fen === expected.moves[0]?.fen;
}
