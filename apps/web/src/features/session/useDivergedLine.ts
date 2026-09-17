import { applySanSequence, moveRefToPly } from '@freechesscoach/chess-analysis';
import { useCallback, useState } from 'react';
import type { CoachToolCall } from '../../hooks/useCoachChat.js';

export interface DivergedMove {
  san: string;
  fen: string;
  uci: string;
}

export interface DivergedLineState {
  basePly: number;
  baseFen: string;
  moves: DivergedMove[];
}

/** The board's actual real-game position at the moment a diverged-line
 * action happens — the hook has no notion of the real game itself (that's
 * useSessionBoardState's job), so every entry point that can start or
 * extend a line off the real game takes this explicitly. */
export interface RealPosition {
  ply: number;
  fen: string;
}

export interface ProposeDivergedLineToolResult {
  ok: boolean;
  basePly: number;
  moves: { san: string }[];
  resultFen?: string;
  error?: string;
}

export interface UseDivergedLineResult {
  line: DivergedLineState | null;
  /** moves[stepIndex-1].fen, or baseFen at stepIndex 0, or null if inactive —
   * callers compose as `divergedLine.fen ?? boardState.fen`. */
  fen: string | null;
  stepIndex: number;
  /** Armed by the expect_move client tool; one-shot — cleared via
   * consumeExpectingMove once the next move has been handled either way
   * (sent as [board_move] or folded into an active line). */
  expectingMove: boolean;
  /** Starts a line at `real` if none is active yet; truncates any moves
   * past the current step before appending if the student stepped back via
   * the sidebar and then played a different continuation. Returns the
   * resulting line synchronously (not just via the next render) so a caller
   * that needs to encode/send it immediately doesn't have to wait a tick. */
  appendMove: (move: DivergedMove, real: RealPosition) => DivergedLineState;
  previewStep: (index: number) => void;
  /** Pops the last move off the line (the undo pill's "↩︎ undo" for a
   * hypothetical move) — exits entirely if that was the only move. */
  undoLastMove: () => void;
  exit: () => void;
  consumeExpectingMove: () => void;
  /** Owns expect_move + hypothetical_line; a real show_position exits any
   * open hypothetical (never trusted to keep showing a stale line once the
   * coach has moved the board back to the real game). Every other tool name
   * is left alone — annotate_board etc. must not silently close the line.
   * `positions` (the real game's own ply->fen, same shape show_position
   * resolves against) is only consulted for hypothetical_line's optional
   * `base` address — every other tool call ignores it, so callers that never
   * expect a `base` may omit it. */
  handleToolCall: (toolCall: CoachToolCall, real: RealPosition, positions?: RealPosition[]) => unknown;
}

/** hypothetical_line's optional `base` — the same { moveNumber, color }
 * address show_position/check_position use. */
interface HypotheticalBaseAddress {
  moveNumber: number;
  color: 'white' | 'black' | null;
}

/** Resolves `base` against the real game's own positions (moveRefToPly is
 * the same {moveNumber,color}->ply conversion show_position's own handling
 * uses — see useSessionBoardState.ts). Starting a fresh hypothetical off the
 * CURRENT position (`base` omitted, or naming a ply the game doesn't have)
 * falls back to `fallback` rather than guessing. */
function resolveHypotheticalBase(
  base: HypotheticalBaseAddress | undefined,
  positions: RealPosition[],
  fallback: RealPosition
): RealPosition {
  if (!base) return fallback;
  const ply = moveRefToPly(base.moveNumber, base.color);
  return positions.find((position) => position.ply === ply) ?? fallback;
}

export function useDivergedLine(): UseDivergedLineResult {
  const [line, setLine] = useState<DivergedLineState | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [expectingMove, setExpectingMove] = useState(false);

  const appendMove = useCallback(
    (move: DivergedMove, real: RealPosition): DivergedLineState => {
      const base = line ?? { basePly: real.ply, baseFen: real.fen, moves: [] };
      const truncatedMoves = base.moves.slice(0, stepIndex);
      const nextMoves = [...truncatedMoves, move];
      const nextLine: DivergedLineState = { ...base, moves: nextMoves };
      setLine(nextLine);
      setStepIndex(nextMoves.length);
      return nextLine;
    },
    [line, stepIndex]
  );

  const previewStep = useCallback((index: number) => {
    setStepIndex(index);
  }, []);

  const undoLastMove = useCallback(() => {
    setLine((current) => {
      if (!current || current.moves.length === 0) return current;
      const nextMoves = current.moves.slice(0, -1);
      return nextMoves.length === 0 ? null : { ...current, moves: nextMoves };
    });
    setStepIndex((current) => Math.max(0, current - 1));
  }, []);

  const exit = useCallback(() => {
    setLine(null);
    setStepIndex(0);
    setExpectingMove(false);
  }, []);

  const consumeExpectingMove = useCallback(() => {
    setExpectingMove(false);
  }, []);

  const handleToolCall = useCallback(
    (toolCall: CoachToolCall, real: RealPosition, positions: RealPosition[] = []): unknown => {
      if (toolCall.toolName === 'expect_move') {
        setExpectingMove(true);
        return { acknowledged: true };
      }
      if (toolCall.toolName === 'hypothetical_line') {
        const { moves: sanMoves, base } = toolCall.input as { moves: string[]; base?: HypotheticalBaseAddress };
        // `base` only matters for a FRESH line — a line already in progress
        // keeps its own basePly/baseFen regardless of what this call passes.
        const effectiveReal = line ? real : resolveHypotheticalBase(base, positions, real);
        const startFen = line?.moves.at(-1)?.fen ?? effectiveReal.fen;
        const applied = applySanSequence(startFen, sanMoves);
        const basePly = line?.basePly ?? effectiveReal.ply;
        if (applied.moves.length > 0) {
          const lineBase = line ?? { basePly: effectiveReal.ply, baseFen: effectiveReal.fen, moves: [] };
          const nextMoves = [...lineBase.moves, ...applied.moves];
          setLine({ ...lineBase, moves: nextMoves });
          setStepIndex(nextMoves.length);
        }
        const result: ProposeDivergedLineToolResult = applied.error
          ? { ok: false, basePly, moves: applied.moves.map((m) => ({ san: m.san })), error: applied.error }
          : { ok: true, basePly, moves: applied.moves.map((m) => ({ san: m.san })), resultFen: applied.moves.at(-1)?.fen };
        return result;
      }
      if (toolCall.toolName === 'show_position') {
        exit();
        return undefined;
      }
      return undefined;
    },
    [line, exit]
  );

  const fen = line ? (stepIndex === 0 ? line.baseFen : (line.moves[stepIndex - 1]?.fen ?? null)) : null;

  return {
    line,
    fen,
    stepIndex,
    expectingMove,
    appendMove,
    previewStep,
    undoLastMove,
    exit,
    consumeExpectingMove,
    handleToolCall
  };
}
