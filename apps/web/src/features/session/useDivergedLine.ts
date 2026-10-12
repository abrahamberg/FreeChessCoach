import { addMove, applySanSequence, childrenOf, moveRefToPly, type EditableTree } from "@freechesscoach/chess-analysis";
import { useCallback, useRef, useState } from "react";
import type { CoachToolCall } from "../../hooks/useCoachChat.js";
import {
  anchorPly,
  back,
  initialMoveTree,
  isMainNode,
  mainNodeAtPly,
  remove,
  select,
  type MoveTreeState,
} from "../board/move-tree-state.js";
import { divergedLineOf, type DivergedLineState } from "./diverged-line-tree.js";

export type { DivergedLineState, DivergedMove } from "./diverged-line-tree.js";

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
  /** True when these moves extended an already-open line rather than
   * starting one — tells the coach where they were played from. */
  continuedLine: boolean;
  basePly: number;
  /** The position the first of `moves` was played from — what the server
   * replays them on to say what each move does. */
  startFen: string;
  moves: { san: string }[];
  resultFen?: string;
  /** Who moves next at the line's end — the side any extension starts with. */
  nextToMove?: "white" | "black";
  error?: string;
}

export interface UseDivergedLineResult {
  /** The game's move tree with every variation the student and the coach
   * made; the explorer draws it. */
  tree: EditableTree;
  /** The variation move on the board, or null while the board shows the game. */
  currentId: string | null;
  /** The variation the board is in, as the coach is told about it; null on
   * the game's own line. */
  line: DivergedLineState | null;
  /** The variation move's position, or null — callers compose as
   * `divergedLine.fen ?? boardState.fen`. */
  fen: string | null;
  /** Armed by the expect_move client tool; one-shot — cleared via
   * consumeExpectingMove once the next move has been handled either way
   * (sent as [board_move] or folded into an active line). */
  expectingMove: boolean;
  /** Plays a move from the variation on the board, or from `real` when the
   * board shows the game: a new move is a variation, a move already there is
   * followed. Returns the resulting line synchronously (not just via the
   * next render) so a caller that needs to encode/send it immediately
   * doesn't have to wait a tick. */
  appendMove: (move: { san: string }, real: RealPosition) => DivergedLineState | null;
  /** Shows a variation move (or, for a game node, leaves the variation). */
  select: (nodeId: string | null) => void;
  /** Removes the last move of the variation on the board (the undo pill),
   * and the whole variation if that was its only move. */
  undoLastMove: () => void;
  /** Removes a variation the student or the coach made. */
  removeBranch: (nodeId: string) => void;
  /** Leaves the variation for the game's move it branches from; the
   * variation stays in the explorer. */
  exit: () => void;
  consumeExpectingMove: () => void;
  /** Owns expect_move + hypothetical_line; a real show_position leaves any
   * open hypothetical (never trusted to keep showing a stale line once the
   * coach has moved the board back to the real game). Every other tool name
   * is left alone — annotate_board etc. must not silently close the line.
   * `positions` (the real game's own ply->fen, same shape show_position
   * resolves against) is only consulted for hypothetical_line's optional
   * `base` address — every other tool call ignores it, so callers that never
   * expect a `base` may omit it. */
  handleToolCall: (
    toolCall: CoachToolCall,
    real: RealPosition,
    positions?: RealPosition[],
  ) => unknown;
}

/** hypothetical_line's optional `base` — the same { moveNumber, color }
 * address show_position/check_position use. */
interface HypotheticalBaseAddress {
  moveNumber: number;
  color: "white" | "black" | null;
}

/** Resolves `base` against the real game's own positions (moveRefToPly is
 * the same {moveNumber,color}->ply conversion show_position's own handling
 * uses — see useSessionBoardState.ts). Starting a fresh hypothetical off the
 * CURRENT position (`base` omitted, or naming a ply the game doesn't have)
 * falls back to `fallback` rather than guessing. */
function resolveHypotheticalBase(
  base: HypotheticalBaseAddress | undefined,
  positions: RealPosition[],
  fallback: RealPosition,
): RealPosition {
  if (!base) return fallback;
  const ply = moveRefToPly(base.moveNumber, base.color);
  return positions.find((position) => position.ply === ply) ?? fallback;
}

const EMPTY_TREE: EditableTree = { startFen: "", nodes: [], errors: [] };

/** The end of the first-move chain after a node: where a continued line goes on. */
function chainEnd(tree: EditableTree, nodeId: string): string {
  let id = nodeId;
  for (let next = childrenOf(tree, id)[0]; next; next = childrenOf(tree, id)[0]) id = next.id;
  return id;
}

/**
 * The lines explored off a game — by the student's moves on the board or the
 * coach's hypothetical_line — kept as variations in the game's move tree
 * (`base`, whose nodes are the game's plies `n1`, `n2` …). A different `base`
 * (the game grew, another puzzle) starts over.
 */
export function useDivergedLine(base: EditableTree | null): UseDivergedLineResult {
  const initial = (): { base: EditableTree | null; state: MoveTreeState } => ({ base, state: initialMoveTree(base ?? EMPTY_TREE) });
  const [held, setHeld] = useState(initial);
  // Read synchronously by appendMove/handleToolCall, which return what they
  // just did before the next render.
  const heldRef = useRef(held);
  if (heldRef.current.base !== base) {
    const fresh = initial();
    heldRef.current = fresh;
    setHeld(fresh);
  }
  const [expectingMove, setExpectingMove] = useState(false);

  const commit = useCallback((state: MoveTreeState): void => {
    heldRef.current = { base: heldRef.current.base, state };
    setHeld(heldRef.current);
  }, []);

  const { tree, currentId } = heldRef.current.state;
  const inVariation = currentId !== null && !isMainNode(tree, currentId);
  const current = inVariation ? tree.nodes.find((node) => node.id === currentId) : undefined;
  const divergence = divergedLineOf(tree, currentId);

  /** Plays the moves one after another; the node each one landed on. */
  const playFrom = useCallback((fromId: string | null, sans: string[]): string | null => {
    let state = heldRef.current.state;
    let parentId = fromId;
    for (const san of sans) {
      const result = addMove(state.tree, parentId, san);
      if (!result.ok) break;
      state = { tree: result.tree, currentId: result.nodeId };
      parentId = result.nodeId;
    }
    commit(state);
    return state.currentId;
  }, [commit]);

  const appendMove = useCallback(
    (move: { san: string }, real: RealPosition): DivergedLineState | null => {
      const state = heldRef.current.state;
      const active = state.currentId !== null && !isMainNode(state.tree, state.currentId);
      const from = active ? state.currentId : mainNodeAtPly(state.tree, real.ply);
      playFrom(from, [move.san]);
      const after = heldRef.current.state;
      return divergedLineOf(after.tree, after.currentId)?.line ?? null;
    },
    [playFrom],
  );

  const selectNode = useCallback((nodeId: string | null) => {
    const state = heldRef.current.state;
    commit(select(state, nodeId));
  }, [commit]);

  const exit = useCallback(() => {
    commit(back(heldRef.current.state));
    setExpectingMove(false);
  }, [commit]);

  const removeBranch = useCallback((nodeId: string) => {
    commit(remove(heldRef.current.state, nodeId));
  }, [commit]);

  const undoLastMove = useCallback(() => {
    const state = heldRef.current.state;
    if (state.currentId === null || isMainNode(state.tree, state.currentId)) return;
    commit(remove(state, chainEnd(state.tree, state.currentId)));
  }, [commit]);

  const consumeExpectingMove = useCallback(() => {
    setExpectingMove(false);
  }, []);

  const handleToolCall = useCallback(
    (
      toolCall: CoachToolCall,
      real: RealPosition,
      positions: RealPosition[] = [],
    ): unknown => {
      if (toolCall.toolName === "expect_move") {
        setExpectingMove(true);
        return { acknowledged: true };
      }
      if (toolCall.toolName === "hypothetical_line") {
        const {
          moves: sanMoves,
          base: baseAddress,
          newLine,
        } = toolCall.input as {
          moves: string[];
          base?: HypotheticalBaseAddress;
          newLine?: boolean;
        };
        const state = heldRef.current.state;
        const open = state.currentId !== null && !isMainNode(state.tree, state.currentId);
        // An open line is extended unless the coach asks for a separate one —
        // explicitly, or implicitly by naming a base (meaningless for an
        // extension, which continues from the line's own last move).
        const continuing = open && !newLine && !baseAddress;
        const effectiveReal = continuing ? real : resolveHypotheticalBase(baseAddress, positions, real);
        const fromId = continuing && state.currentId ? chainEnd(state.tree, state.currentId) : mainNodeAtPly(state.tree, effectiveReal.ply);
        const startNode = fromId === null ? undefined : state.tree.nodes.find((node) => node.id === fromId);
        const startFen = startNode?.fenAfter ?? state.tree.startFen;
        const applied = applySanSequence(startFen, sanMoves);
        const basePly = continuing && state.currentId ? anchorPly(state.tree, state.currentId) : effectiveReal.ply;
        if (applied.moves.length > 0) playFrom(fromId, applied.moves.map((move) => move.san));
        const moves = applied.moves.map((m) => ({ san: m.san }));
        const resultFen = applied.moves.at(-1)?.fen;
        // A failed extension is the case a model gets stuck on: it meant a
        // fresh line, so name the way out instead of just the illegal move.
        const error =
          applied.error && continuing && applied.moves.length === 0
            ? `${applied.error} — this continued your open hypothetical from its last move; pass newLine: true to start a separate line instead`
            : applied.error;
        const result: ProposeDivergedLineToolResult = error
          ? { ok: false, continuedLine: continuing, basePly, startFen, moves, error }
          : {
              ok: true,
              continuedLine: continuing,
              basePly,
              startFen,
              moves,
              resultFen,
              nextToMove: resultFen?.split(" ")[1] === "b" ? "black" : "white",
            };
        return result;
      }
      if (toolCall.toolName === "show_position") {
        exit();
        return undefined;
      }
      return undefined;
    },
    [playFrom, exit],
  );

  return {
    tree,
    currentId: inVariation ? currentId : null,
    line: divergence?.line ?? null,
    fen: current?.fenAfter ?? null,
    expectingMove,
    appendMove,
    select: selectNode,
    undoLastMove,
    removeBranch,
    exit,
    consumeExpectingMove,
    handleToolCall,
  };
}
