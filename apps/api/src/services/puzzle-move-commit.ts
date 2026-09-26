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
  /** Every move this call put on the board, in order (SAN) — more than two
   * only when `studentMoves` is more than 1. */
  playedSans: string[];
  fen: string;
  currentPly: number;
  lineComplete: boolean;
  /** Tells the coach what to do next — the model reads the tool result, so the
   * "line is done, advance" step is stated there rather than left to inference. */
  next: string;
}

export interface PlayNextPuzzleMoveOptions {
  /** How many of the student's moves to play, each with the opponent's forced
   * reply (default 1) — more when the student already stated several moves of
   * the line correctly, so they aren't made to repeat them. Stops at the end
   * of the line. */
  studentMoves?: number;
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
  assignment: PuzzleAssignmentRow,
  options: PlayNextPuzzleMoveOptions = {}
): Promise<PlayedPuzzleMove> {
  const item = assignment.items[session.currentItemIndex];
  if (!item) throw new ConflictError('This session has no current puzzle — it may already be complete');

  const beforeFen = currentPuzzleFen(session, assignment);
  if (session.currentPly >= item.moves.length) throw new ConflictError('This puzzle line is already fully played out');

  const studentMoves = Math.max(1, options.studentMoves ?? 1);
  const toApply = item.moves.slice(session.currentPly, session.currentPly + studentMoves * 2);
  const { moves, error } = applyUciSequence(beforeFen, toApply);
  if (error || moves.length !== toApply.length) throw new ConflictError('The stored puzzle line could not be played');

  const ply = session.currentPly + toApply.length;
  await puzzleSessionsRepo.advancePly(db, session.id, ply);
  return {
    san: moves[0]!.san,
    replySan: moves[1]?.san ?? null,
    playedSans: moves.map((move) => move.san),
    fen: moves.at(-1)!.fen,
    currentPly: ply,
    lineComplete: ply >= item.moves.length,
    next:
      ply >= item.moves.length
        ? 'The line is fully played out. Stay on this position: say what you want to say about it, then ask whether they are ready to move on. Do not call advance_puzzle until they say yes.'
        : 'Ask the student for the next move of the line — the point where their answer stopped, if they gave several.'
  };
}
