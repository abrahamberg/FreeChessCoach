import { applyUciSequence } from '@freechesscoach/chess-analysis';
import type { Kysely } from 'kysely';
import type { PuzzleAssignmentRow } from '../db/repositories/puzzle-assignments.js';
import * as puzzleSessionsRepo from '../db/repositories/puzzle-sessions.js';
import type { PuzzleSessionRow } from '../db/repositories/puzzle-sessions.js';
import type { Database } from '../db/schema.js';
import { ConflictError } from '../lib/errors.js';
import { currentPuzzleFen } from './puzzle-session.js';

export interface PlayedPuzzleMove {
  /** The student's move from the known line, in SAN. */
  san: string;
  /** The opponent's forced reply the line names next (SAN), if any. */
  replySan: string | null;
  fen: string;
  currentPly: number;
  lineComplete: boolean;
  /** Tells the coach what to do next — the model reads the tool result, so the
   * "line is done, advance" step is stated there rather than left to inference. */
  next: string;
}

/**
 * Practice sessions are discuss-only: the student never moves a piece. Once
 * the coach and student have talked a move through, the coach's
 * `play_next_move` tool calls this to put that move — and the opponent's
 * forced reply, if the line has one — on the board. The line itself never
 * changes, so this only advances `currentPly` (same "auto-apply the
 * opponent's reply" rule as the item's own setup move). Nothing about the
 * chat episode changes: messages stay tagged with the same item index.
 */
export async function playNextPuzzleMove(
  db: Kysely<Database>,
  session: PuzzleSessionRow,
  assignment: PuzzleAssignmentRow
): Promise<PlayedPuzzleMove> {
  const item = assignment.items[session.currentItemIndex];
  if (!item) throw new ConflictError('This session has no current puzzle — it may already be complete');

  const beforeFen = currentPuzzleFen(session, assignment);
  const expectedUci = item.moves[session.currentPly];
  if (expectedUci === undefined) throw new ConflictError('This puzzle line is already fully played out');

  const replyUci = item.moves[session.currentPly + 1];
  const toApply = replyUci !== undefined ? [expectedUci, replyUci] : [expectedUci];
  const { moves, error } = applyUciSequence(beforeFen, toApply);
  if (error || moves.length !== toApply.length) throw new ConflictError('The stored puzzle line could not be played');

  const ply = session.currentPly + toApply.length;
  await puzzleSessionsRepo.advancePly(db, session.id, ply);
  return {
    san: moves[0]!.san,
    replySan: moves[1]?.san ?? null,
    fen: moves.at(-1)!.fen,
    currentPly: ply,
    lineComplete: ply >= item.moves.length,
    next:
      ply >= item.moves.length
        ? 'The line is fully played out. Say the one-sentence lesson now, then call advance_puzzle (solved, or failed if you had to reveal it) in this same reply to move the student to the next practice.'
        : 'Ask the student for the next move of the line.'
  };
}
