import { z } from 'zod';
import {
  annotateBoardParameters,
  checkMovesParameters,
  coachToolDescription,
  hypotheticalLineParameters,
  getEngineAnalysisParameters,
  renderEngineAnalysisSummary,
  renderMoveInspection
} from '@freechesscoach/prompts';
import type { PositionAnalysis } from '@freechesscoach/shared';
import { inspectMoves } from '@freechesscoach/chess-analysis';
import type { Kysely } from 'kysely';
import { tool, type ToolSet } from '../llm/tools.js';
import * as puzzleAssignmentsRepo from '../db/repositories/puzzle-assignments.js';
import * as puzzleSessionsRepo from '../db/repositories/puzzle-sessions.js';
import type { Database } from '../db/schema.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import { createTurnGuardState, withTurnGuards, type TurnGuardState } from './coach-tool-guards.js';
import { advancePuzzleItem, type PuzzleItemAdvanceResult } from './puzzle-item-advance.js';
import { playNextPuzzleMove, type PlayedPuzzleMove } from './puzzle-move-commit.js';

export interface PuzzleSessionToolsContext {
  userId: string;
  assignmentId: string;
  sessionId: string;
  /** The item this turn started on — fixed for the whole turn, same
   * "buildCoachTools called once per turn" contract coach-tools.ts uses for
   * gameId/sessionId. advance_puzzle records its result against exactly
   * this index, never whatever the assignment happens to say by the time
   * the tool actually runs. */
  currentItemIndex: number;
}

export interface PuzzleSessionToolsDependencies {
  db: Kysely<Database>;
  /** Absent when no engine is configured — get_engine_analysis is then left out. */
  analyzePosition?: (fen: string) => Promise<PositionAnalysis>;
}

/**
 * Task 59.4's reduced tool set for a focused-practice session:
 * `check_position`/`recall_move`/`record_move_note` are dropped — all
 * addressed by a real game's `{ moveNumber, color }` move-pair numbering,
 * which a single position has no equivalent of. `expect_move` is dropped
 * too: practice is discuss-only, the student never moves a piece, so the
 * coach advances the line itself with `play_next_move`. `annotate_board`
 * is reused byte-for-byte (genuinely address-free).
 * `hypothetical_line` is reused with its OWN description below rather than
 * `coachToolDescription('hypothetical_line')`, whose text instructs "call
 * show_position first if you haven't already" — not the right framing here.
 * `show_position` IS reused here, but address-free and client-side-only
 * (no `execute` — same as `annotate_board`): a focused
 * session only ever has one real position to return to, so there's nothing
 * to address — it's purely "exit whatever hypothetical is open," the exact
 * same `useDivergedLine.handleToolCall` branch the game-coach session's
 * `show_position` already falls into client-side, letting the coach revert
 * a hypothetical the same way the student's own "peek" toggle does.
 */
export function buildPuzzleSessionTools(
  ctx: PuzzleSessionToolsContext,
  deps: PuzzleSessionToolsDependencies,
  guardState: TurnGuardState = createTurnGuardState()
): ToolSet {

  return {
    annotate_board: tool({
      description: coachToolDescription('annotate_board'),
      inputSchema: annotateBoardParameters
    }),
    show_position: tool({
      description: PUZZLE_SHOW_POSITION_DESCRIPTION,
      inputSchema: z.object({})
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
    ...(deps.analyzePosition
      ? {
          get_engine_analysis: tool({
            description: coachToolDescription('get_engine_analysis'),
            inputSchema: getEngineAnalysisParameters,
            execute: withTurnGuards(
              guardState,
              'get_engine_analysis',
              async (args: { fen: string }) => renderEngineAnalysisSummary(await deps.analyzePosition!(args.fen))
            )
          })
        }
      : {}),
    play_next_move: tool({
      description: PLAY_NEXT_MOVE_DESCRIPTION,
      inputSchema: z.object({}),
      execute: withTurnGuards(guardState, 'play_next_move', () => playNextMoveTool(deps, ctx), { play_next_move: 1 })
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

const PUZZLE_SHOW_POSITION_DESCRIPTION =
  "Bring the board back to the real, current position — call this once you're done showing a hypothetical you opened with hypothetical_line. Takes no arguments: there is only ever one real position in a focused session, so there's nothing to address. Harmless to call even when nothing is diverged.";

const PUZZLE_HYPOTHETICAL_LINE_DESCRIPTION =
  'Set up or continue a diverged line off the CURRENT puzzle position (the board already shows it — no need to call anything first) — e.g. exploring what happens if the student tries a different idea than the one you\'re walking through. Pass the SAN move(s) for the hypothetical; the client validates and applies them against real chess rules and reports back the resulting position, including its "resultFen" — never invent a resulting FEN yourself. Pass further moves to keep extending a hypothetical already in progress. This never touches the puzzle\'s own solution line.';

const PLAY_NEXT_MOVE_DESCRIPTION =
  "Put the next move of the known line on the board — the student's move, plus the opponent's forced reply if the line has one. Practice is discuss-only: the student cannot move pieces, so this is how the position advances. Call it only once the student has stated the move and you have talked through why it works (or you have walked them to it). Takes no arguments; at most once per turn. Returns the SAN played, the opponent's reply (or null), the new fen, whether the line is now fully played out, and what to do next (when it is played out: call advance_puzzle). Never call it to skip ahead of the student's understanding.";

const ADVANCE_PUZZLE_DESCRIPTION =
  'Call this once the student has solved the current puzzle, given up on it, or you\'ve decided to move past it — never mid-explanation, only when you\'re actually ready to leave this puzzle. "solved" means the student found (or was walked through and now understands) the winning idea; "failed" means they did not, even after your help; "skipped" is for the rare case you or the student choose to move on without resolving it. Ends your turn — the next message will be about the next puzzle in the set, or, if this was the last one, the session ending.';

export type AdvancePuzzleResult = 'solved' | 'failed' | 'skipped';

export const advancePuzzleParameters = z.object({
  result: z.enum(['solved', 'failed', 'skipped'])
});

interface AdvancePuzzleArgs {
  result: AdvancePuzzleResult;
}

export type AdvancePuzzleToolResult = PuzzleItemAdvanceResult;

/** Reads the session fresh (not from the turn's start snapshot) so the ply
 * it advances is whatever the database says is current — same reasoning as
 * advancePuzzleTool below. */
async function playNextMoveTool(deps: PuzzleSessionToolsDependencies, ctx: PuzzleSessionToolsContext): Promise<PlayedPuzzleMove> {
  const assignment = await puzzleAssignmentsRepo.findById(deps.db, ctx.assignmentId);
  if (!assignment) throw new NotFoundError('Assignment not found');
  const session = await puzzleSessionsRepo.findSessionById(deps.db, ctx.sessionId);
  if (!session) throw new NotFoundError('Puzzle session not found');
  if (session.currentItemIndex !== ctx.currentItemIndex) throw new ConflictError('This puzzle has already been advanced');
  return playNextPuzzleMove(deps.db, session, assignment);
}

/** Advances synchronously inside tool execution — not deferred to the
 * turn's `onFinish` (as it used to be) — so the assignment/session write is
 * already committed by the time this tool's result streams to the client;
 * a client that refetches the instant it sees that result (usePuzzleSession
 * PageData's handleServerToolResult) is guaranteed to read the new state,
 * not race an async write that hasn't landed yet. */
async function advancePuzzleTool(
  deps: PuzzleSessionToolsDependencies,
  ctx: PuzzleSessionToolsContext,
  args: AdvancePuzzleArgs
): Promise<AdvancePuzzleToolResult> {
  const assignment = await puzzleAssignmentsRepo.findById(deps.db, ctx.assignmentId);
  if (!assignment) throw new NotFoundError('Assignment not found');
  const session = await puzzleSessionsRepo.findSessionById(deps.db, ctx.sessionId);
  if (!session) throw new NotFoundError('Puzzle session not found');

  return advancePuzzleItem(deps.db, assignment, session, ctx.currentItemIndex, args.result);
}
