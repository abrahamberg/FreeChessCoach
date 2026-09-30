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
import { currentPuzzleFen } from './puzzle-session.js';

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
      inputSchema: puzzleCheckMovesParameters,
      execute: withTurnGuards(guardState, 'check_moves', async (args: PuzzleCheckMovesArgs) =>
        renderMoveInspection(inspectMoves(args.fen ?? (await currentFenOf(deps, ctx)), args.moves))
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
      inputSchema: playNextMoveParameters,
      execute: withTurnGuards(guardState, 'play_next_move', (args: PlayNextMoveArgs) => playNextMoveTool(deps, ctx, args), {
        play_next_move: 1
      })
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
  'Check whether specific moves are actually legal in a position, and what they actually do — pure board reading, no engine, free and unbudgeted. Pass up to 6 moves in SAN; leave fen out to check them in the current puzzle position (almost always what you want — never type a fen out yourself), or pass a resultFen hypothetical_line gave you. For each you get back: legal or NOT legal (and, when not, what that piece can really do here); what it captures, whether it gives check or mate; the fen it reaches; what else it does on the board (attacks, pins, forks); and which of the mover\'s own pieces it leaves loose, meaning the other side can win them. Use it before you judge any move the student proposes that is not in the known solution line — telling a student their move is illegal when it is not, or that it hangs a piece it does not, is worse than saying nothing.';

/** fen optional here: a hand-copied fen is where the coach goes wrong (a
 * rank one square short, and the check fails), and the real position is
 * the one it almost always means. */
const puzzleCheckMovesParameters = checkMovesParameters.extend({
  fen: z
    .string()
    .min(1)
    .optional()
    .describe('Leave out to check moves in the current puzzle position. Pass only a resultFen hypothetical_line gave you.')
});
type PuzzleCheckMovesArgs = z.infer<typeof puzzleCheckMovesParameters>;

async function currentFenOf(deps: PuzzleSessionToolsDependencies, ctx: PuzzleSessionToolsContext): Promise<string> {
  const assignment = await puzzleAssignmentsRepo.findById(deps.db, ctx.assignmentId);
  const session = await puzzleSessionsRepo.findSessionById(deps.db, ctx.sessionId);
  if (!assignment || !session) throw new NotFoundError('Puzzle session not found');
  return currentPuzzleFen(session, assignment);
}

const PUZZLE_SHOW_POSITION_DESCRIPTION =
  "Bring the board back to the real, current position — call this once you're done showing a hypothetical you opened with hypothetical_line. Takes no arguments: there is only ever one real position in a focused session, so there's nothing to address. Harmless to call even when nothing is diverged.";

const PUZZLE_HYPOTHETICAL_LINE_DESCRIPTION =
  'Set up or continue a diverged line off the CURRENT puzzle position (the board already shows it — no need to call anything first) — e.g. exploring what happens if the student tries a different idea than the one you\'re walking through. Pass the SAN move(s) for the hypothetical; the client validates and applies them against real chess rules and reports back the resulting position, including its "resultFen" — never invent a resulting FEN yourself. While a line is open, further moves alone EXTEND it from its last move (the result says continuedLine: true); to show a different, separate line instead, pass newLine: true — that replaces the open line from the puzzle position, no need to call show_position first. This never touches the puzzle\'s own solution line.';

const PLAY_NEXT_MOVE_DESCRIPTION =
  "Put the next move of the known line on the board — the student's move, plus the opponent's forced reply if the line has one. Practice is discuss-only: the student cannot move pieces, so this is how the position advances. Call it once the student has named the move (or you have walked them to it). studentMoves (default 1): when their answer already gave several of their moves in a row correctly, pass that count so they aren't made to repeat them — it plays those moves with the replies between them and stops where their answer stopped being right. At most once per turn. Returns the SAN played (playedSans lists every move put on the board), the new fen, whether the line is now fully played out, and what to do next.";

const ADVANCE_PUZZLE_DESCRIPTION =
  'Moves the student to the next practice. Call it only once the current position is finished AND the student has said they are ready to move on (or asked to) — never in the same reply as your closing words on the position, never mid-explanation. "solved" means the student found (or was walked through and now understands) the winning idea; "failed" means you had to reveal it; "skipped" is for the rare case you both agree to move on without resolving it. Ends your turn — the next message will be about the next practice, or, if this was the last one, the session ending.';

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
const playNextMoveParameters = z.object({
  studentMoves: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      "How many of the student's moves in a row to play, each with the opponent's forced reply (default 1). When their answer already gave several moves of the line correctly, pass that count — it stops where their answer stopped being right."
    )
});
type PlayNextMoveArgs = z.infer<typeof playNextMoveParameters>;

async function playNextMoveTool(
  deps: PuzzleSessionToolsDependencies,
  ctx: PuzzleSessionToolsContext,
  args: PlayNextMoveArgs
): Promise<PlayedPuzzleMove> {
  const assignment = await puzzleAssignmentsRepo.findById(deps.db, ctx.assignmentId);
  if (!assignment) throw new NotFoundError('Assignment not found');
  const session = await puzzleSessionsRepo.findSessionById(deps.db, ctx.sessionId);
  if (!session) throw new NotFoundError('Puzzle session not found');
  if (session.currentItemIndex !== ctx.currentItemIndex) throw new ConflictError('This puzzle has already been advanced');
  return playNextPuzzleMove(deps.db, session, assignment, { studentMoves: args.studentMoves });
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
