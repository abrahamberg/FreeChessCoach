import { z } from 'zod';
import {
  annotateBoardParameters,
  checkMovesParameters,
  coachToolDescription,
  expectMoveParameters,
  hypotheticalLineParameters,
  renderMoveInspection
} from '@freechesscoach/prompts';
import { inspectMoves } from '@freechesscoach/chess-analysis';
import type { Kysely } from 'kysely';
import { tool, type ToolSet } from '../llm/tools.js';
import * as puzzleAssignmentsRepo from '../db/repositories/puzzle-assignments.js';
import type { Database } from '../db/schema.js';
import { NotFoundError } from '../lib/errors.js';
import { createTurnGuardState, withTurnGuards } from './coach-tool-guards.js';

export interface PuzzleSessionToolsContext {
  userId: string;
  assignmentId: string;
  /** The item this turn started on — fixed for the whole turn, same
   * "buildCoachTools called once per turn" contract coach-tools.ts uses for
   * gameId/sessionId. advance_puzzle records its result against exactly
   * this index, never whatever the assignment happens to say by the time
   * the tool actually runs. */
  currentItemIndex: number;
}

export interface PuzzleSessionToolsDependencies {
  db: Kysely<Database>;
}

/**
 * Task 59.4's reduced tool set for a puzzle-review session: `show_position`
 * is dropped, not reused — its `{ moveNumber, color }` address (see
 * packages/prompts/src/tools.ts) is a real game's move-pair numbering,
 * which a puzzle set has no equivalent of (a puzzle session's board always
 * shows the current item's own FEN, rendered by the client the instant a
 * session opens or advances, no tool round-trip needed for that). Also
 * dropped: `check_position`/`recall_move`/`record_move_note`, all
 * addressed the same game-ply way. `annotate_board`/`expect_move` are
 * reused byte-for-byte (genuinely address-free). `hypothetical_line` is
 * reused with its OWN description below rather than
 * `coachToolDescription('hypothetical_line')`, whose text instructs
 * "call show_position first if you haven't already" — not true here, so
 * repeating it verbatim would point the model at a tool this session
 * doesn't have.
 */
export function buildPuzzleSessionTools(ctx: PuzzleSessionToolsContext, deps: PuzzleSessionToolsDependencies): ToolSet {
  const guardState = createTurnGuardState();

  return {
    annotate_board: tool({
      description: coachToolDescription('annotate_board'),
      inputSchema: annotateBoardParameters
    }),
    expect_move: tool({
      description: coachToolDescription('expect_move'),
      inputSchema: expectMoveParameters
    }),
    hypothetical_line: tool({
      description: PUZZLE_HYPOTHETICAL_LINE_DESCRIPTION,
      inputSchema: hypotheticalLineParameters
    }),
    check_moves: tool({
      description: PUZZLE_CHECK_MOVES_DESCRIPTION,
      inputSchema: checkMovesParameters,
      execute: withTurnGuards(guardState, 'check_moves', (args: { fen: string; moves: string[] }) =>
        Promise.resolve(renderMoveInspection(inspectMoves(args.fen, args.moves)))
      )
    }),
    advance_puzzle: tool({
      description: ADVANCE_PUZZLE_DESCRIPTION,
      inputSchema: advancePuzzleParameters,
      execute: withTurnGuards(guardState, 'advance_puzzle', (args: AdvancePuzzleArgs) => advancePuzzleTool(deps, ctx, args))
    })
  };
}

/** Same tool as the game coach's `check_moves`, with its own description:
 * a puzzle session has no show_position/check_position, so the fen the
 * coach passes comes from "This puzzle" in its own prompt or from
 * hypothetical_line's resultFen, not from a board-moving tool. The reason
 * it exists is identical — judging a student's proposed move from the
 * model's own board reading is where the coach invents pieces and
 * illegal moves. */
const PUZZLE_CHECK_MOVES_DESCRIPTION =
  'Check whether specific moves are actually legal in a position, and what they actually do — pure board reading, no engine, free and unbudgeted. Pass a fen (the puzzle\'s starting position from "This puzzle", or a resultFen hypothetical_line gave you) plus up to 6 moves in SAN. For each you get back: legal or NOT legal (and, when not, what that piece can really do here); what it captures, whether it gives check or mate; the fen it reaches; which of the mover\'s own pieces it leaves hanging; and any fork it creates. Use it before you judge any move the student proposes that is not in the known solution line — telling a student their move is illegal when it is not, or that it hangs a piece it does not, is worse than saying nothing.';

const PUZZLE_HYPOTHETICAL_LINE_DESCRIPTION =
  'Set up or continue a diverged line off the CURRENT puzzle position (the board already shows it — no need to call anything first) — e.g. exploring what happens if the student tries a different idea than the one you\'re walking through. Pass the SAN move(s) for the hypothetical; the client validates and applies them against real chess rules and reports back the resulting position, including its "resultFen" — never invent a resulting FEN yourself. Pass further moves to keep extending a hypothetical already in progress. This never touches the puzzle\'s own solution line.';

const ADVANCE_PUZZLE_DESCRIPTION =
  'Call this once the student has solved the current puzzle, given up on it, or you\'ve decided to move past it — never mid-explanation, only when you\'re actually ready to leave this puzzle. "solved" means the student found (or was walked through and now understands) the winning idea; "failed" means they did not, even after your help; "skipped" is for the rare case you or the student choose to move on without resolving it. Ends your turn — the next message will be about the next puzzle in the set, or, if this was the last one, the session ending.';

export type AdvancePuzzleResult = 'solved' | 'failed' | 'skipped';

export const advancePuzzleParameters = z.object({
  result: z.enum(['solved', 'failed', 'skipped'])
});

interface AdvancePuzzleArgs {
  result: AdvancePuzzleResult;
}

export interface AdvancePuzzleToolResult {
  itemIndex: number;
  isLastItem: boolean;
}

async function advancePuzzleTool(
  deps: PuzzleSessionToolsDependencies,
  ctx: PuzzleSessionToolsContext,
  args: AdvancePuzzleArgs
): Promise<AdvancePuzzleToolResult> {
  const assignment = await puzzleAssignmentsRepo.findById(deps.db, ctx.assignmentId);
  if (!assignment) throw new NotFoundError('Assignment not found');

  const items = assignment.items.map((item, index) => (index === ctx.currentItemIndex ? { ...item, result: args.result } : item));
  await puzzleAssignmentsRepo.updateItems(deps.db, ctx.assignmentId, items);

  return { itemIndex: ctx.currentItemIndex, isLastItem: ctx.currentItemIndex >= items.length - 1 };
}
