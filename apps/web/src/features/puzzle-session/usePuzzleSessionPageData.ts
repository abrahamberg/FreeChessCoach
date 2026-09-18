import { applySanSequence, applyUciSequence } from '@freechesscoach/chess-analysis';
import { PuzzleSessionDetailSchema, PuzzleSessionSchema, type PuzzleSessionDetail } from '@freechesscoach/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { apiGet, apiPost } from '../../api/client.js';
import type { CoachToolCall } from '../../hooks/useCoachChat.js';
import { useAnnotationLayer, type AnnotationState } from '../board/AnnotationLayer.js';
import type { LocalMoveInfo } from '../board/CoachBoard.js';
import { useHintMoves } from '../board/useHintMoves.js';
import { encodeDivergedLine } from '../chat/divergedLine.js';
import { useDivergedLine } from '../session/useDivergedLine.js';
import { toPuzzleCoachMessages } from './puzzleSessionMessages.js';
import { usePuzzleCoachChat } from './usePuzzleCoachChat.js';
import { usePuzzleMoveAttempt } from './usePuzzleMoveAttempt.js';

export type PuzzleBoardMode = 'answer' | 'peek';

export interface PuzzleHistoryPosition {
  ply: number;
  fen: string;
}

/**
 * All fetching + derived state for PuzzleSessionPage (AGENTS.md rule 7).
 * Create-or-resume (mirrors resumeOrCreatePuzzleSession server-side) is a
 * `useQuery`, not a `useMutation` fired from an effect: the route only names
 * the assignment, not a session id, so unlike SessionPage there is no
 * existing session id to key a query on until this call resolves — but the
 * server call itself is idempotent (an open session is returned as-is, never
 * duplicated), so it's safe to model as a query. A `useMutation` invoked
 * imperatively from a mount effect turned out NOT to be StrictMode-safe here
 * despite the usual ref-guard: React's dev-only double-invoke of that effect
 * raced the in-flight POST against the component's simulated
 * unmount/remount, and the mutation's own result could land after its
 * observer had already been torn down — the resolved session was thrown
 * away, `sessionId` never became defined, and the practice page was stuck on
 * "Loading…" forever (never actually reaching the detail GET below). A
 * query sidesteps that: React Query's own StrictMode handling for queries
 * (not just mutations) is the well-exercised path.
 *
 * Focused-session rework — a board move is now one of three things, decided
 * in this order (mirrors SessionBoardColumn's handleUserMove, but a puzzle
 * session has no play/play_bot split to sit alongside):
 *   1. The coach armed expect_move — send it immediately, same as before.
 *   2. A hypothetical is already open (student peeked and moved, or the
 *      coach called hypothetical_line) — extend it, never commit.
 *   3. Neither — this is a real attempt against the item's known line
 *      (usePuzzleMoveAttempt, POST /attempt-move). An accepted move adopts
 *      the server's new position; a rejected one reverts immediately (the
 *      optimistic preview this hook sets is simply cleared, letting the
 *      board fall back to the last-committed fen) and the coach discusses
 *      why — instead of the old behavior where every move silently became
 *      an ephemeral diverged line and nothing was ever actually committed.
 */
export function usePuzzleSessionPageData(assignmentId: string) {
  const queryClient = useQueryClient();

  const createQuery = useQuery({
    queryKey: ['puzzle-session-create', assignmentId],
    queryFn: () => apiPost('/api/puzzle-sessions', { assignmentId }, PuzzleSessionSchema),
    enabled: assignmentId !== '',
    // This POST creates a session as a side effect — it must run at most
    // once per assignmentId, never replayed by a window-refocus/reconnect
    // refetch the way an ordinary GET query would be.
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false
  });

  const sessionId = createQuery.data?.id;
  const detailQuery = useQuery({
    queryKey: ['puzzle-session', sessionId],
    queryFn: ({ signal }) => apiGet(`/api/puzzle-sessions/${sessionId}`, PuzzleSessionDetailSchema, signal),
    enabled: sessionId !== undefined
  });

  const divergedLine = useDivergedLine();
  const annotations = useAnnotationLayer();
  const data = detailQuery.data;
  const currentItem = data ? (data.assignment.items[data.currentItemIndex] ?? null) : null;

  // The board's own interaction gate — 'peek' suspends real-attempt
  // submission and routes moves into divergedLine instead (free
  // exploration, never committed), the same "peek" concept SessionPage's
  // board column has, exposed here as an explicit toggle since a puzzle
  // session has no game history to passively peek back into. Exiting peek
  // deliberately does NOT clear an in-progress divergedLine — the student
  // may want to type a message about what they just explored (handled by
  // PuzzleSessionPage's send path via encodeDivergedLine), and the coach
  // can still discuss it or explicitly dismiss it (show_position).
  const [boardMode, setBoardMode] = useState<PuzzleBoardMode>('answer');
  // A just-dropped move's fen, shown immediately while an attempt is in
  // flight — cleared once the round trip resolves either way
  // (handleMoveAttemptResult). Only ever set for a move handleUserMove will
  // also treat as a real attempt (handleLocalMove uses the same guard
  // conditions), so it never lingers behind an unrelated hypothetical.
  const [previewFen, setPreviewFen] = useState<string | null>(null);
  // Read-only "glance at an earlier point in this item's played-out line"
  // (MoveExplorer's onSelect) — distinct from peek mode: no moves are
  // possible while viewing history, it's purely a look-back. Reset by any
  // real move, a fresh item, or the coach bringing the board back
  // (show_position).
  const [viewedPly, setViewedPly] = useState<number | null>(null);

  const committedLine =
    currentItem && data ? applyUciSequence(currentItem.fen, currentItem.moves.slice(0, data.currentPly)) : null;
  const historyPositions: PuzzleHistoryPosition[] = [
    { ply: 0, fen: currentItem?.fen ?? '' },
    ...(committedLine?.moves.map((move, index) => ({ ply: index + 1, fen: move.fen })) ?? [])
  ];
  const viewedFen = viewedPly !== null ? (historyPositions.find((position) => position.ply === viewedPly)?.fen ?? null) : null;

  const boardFen = divergedLine.fen ?? viewedFen ?? previewFen ?? data?.currentFen ?? '';
  const effectiveBoardMode: PuzzleBoardMode = viewedPly !== null ? 'peek' : boardMode;
  // BoardActionBar's Hint button (same engine round trip play/play_bot use) —
  // owned here, not the page component, so handleUserMove below can read
  // whether it was active at the moment a real attempt is submitted.
  const hint = useHintMoves(boardFen);

  function handleMoveAttemptResult(result: { accepted: boolean; fen: string; currentPly: number }): void {
    setPreviewFen(null);
    if (!result.accepted || sessionId === undefined) return;
    queryClient.setQueryData<PuzzleSessionDetail>(['puzzle-session', sessionId], (old) =>
      old ? { ...old, currentFen: result.fen, currentPly: result.currentPly } : old
    );
  }

  const moveAttempt = usePuzzleMoveAttempt(sessionId ?? '', (content) => void chat.sendMessage(content), handleMoveAttemptResult);

  /** Disjoint tool ownership, same discipline useSessionPageData's
   * handleCoachToolCall uses: annotate_board and show_position are handled
   * directly here (or partly here — show_position also resets the board's
   * own local mode before falling through), everything else goes to
   * divergedLine. */
  function handleCoachToolCall(toolCall: CoachToolCall): unknown {
    if (toolCall.toolName === 'annotate_board') {
      annotations.setAnnotations(toolCall.input as AnnotationState);
      return { acknowledged: true };
    }
    if (toolCall.toolName === 'show_position') {
      setBoardMode('answer');
      setViewedPly(null);
    }
    if (!data || !currentItem) return undefined;
    return divergedLine.handleToolCall(toolCall, { ply: data.currentItemIndex, fen: data.currentFen });
  }

  function handleServerToolResult(toolName: string): void {
    if (toolName !== 'advance_puzzle' || sessionId === undefined) return;
    divergedLine.exit();
    annotations.clear();
    setBoardMode('answer');
    setViewedPly(null);
    void queryClient.invalidateQueries({ queryKey: ['puzzle-session', sessionId] });
  }

  const initialMessages = data ? toPuzzleCoachMessages(data.messages) : undefined;
  const chat = usePuzzleCoachChat(sessionId ?? '', {
    onToolCall: handleCoachToolCall,
    onServerToolResult: handleServerToolResult,
    initialMessages
  });

  function handleUserMove(san: string, fen: string, uci: string): void {
    if (!data) return;
    const real = { ply: data.currentItemIndex, fen: data.currentFen };
    if (divergedLine.expectingMove) {
      divergedLine.consumeExpectingMove();
      const message = divergedLine.line
        ? encodeDivergedLine(divergedLine.appendMove({ san, fen, uci }, real), '')
        : `[board_move] I played ${san} (position now: ${fen})`;
      void chat.sendMessage(message);
      return;
    }
    if (divergedLine.line) {
      divergedLine.appendMove({ san, fen, uci }, real);
      return;
    }
    void moveAttempt.submit(san, uci, hint.stage > 0);
  }

  /** Fires for every legal drop regardless of mode (CoachBoard's own
   * contract) — in peek mode it's free exploration folded into
   * divergedLine, same discipline SessionBoardColumn's own handleLocalMove
   * uses; otherwise it's the optimistic preview for a move handleUserMove
   * is about to treat as a real attempt (same guard conditions, so this
   * never sets a preview behind a hypothetical or an expect_move send). */
  function handleLocalMove(fen: string, move: LocalMoveInfo): void {
    if (viewedPly !== null) return;
    if (boardMode === 'peek') {
      if (!data) return;
      const applied = applySanSequence(move.fenBefore, [move.san]).moves[0];
      if (!applied) return;
      divergedLine.appendMove({ san: move.san, fen, uci: applied.uci }, { ply: data.currentItemIndex, fen: data.currentFen });
      return;
    }
    if (divergedLine.line || divergedLine.expectingMove) return;
    setPreviewFen(fen);
  }

  function selectHistoryPly(ply: number): void {
    setViewedPly(ply === (data?.currentPly ?? 0) ? null : ply);
  }

  // The coach opens every item it hasn't spoken about yet (a fresh
  // session's first item, or a new item just reached via advance_puzzle) —
  // detected from persisted itemIndex tags rather than "messages is empty",
  // since a resumed session's later items must NOT re-trigger this once the
  // coach already opened them. Guarded by ref so an in-flight kickoff (whose
  // own messages haven't landed in `data` yet) isn't fired twice.
  const kickedForItemIndexRef = useRef<number | null>(null);
  useEffect(() => {
    if (!data || data.status !== 'active') return;
    const hasMessageForCurrentItem = data.messages.some((message) => message.itemIndex === data.currentItemIndex);
    if (hasMessageForCurrentItem) return;
    if (kickedForItemIndexRef.current === data.currentItemIndex) return;
    kickedForItemIndexRef.current = data.currentItemIndex;
    void chat.kickoff();
    // chat is a fresh object every render (usePuzzleCoachChat isn't
    // memoized as a whole) — deliberately not a dependency here, since
    // depending on it would refire this effect every render;
    // data.currentItemIndex/data.messages/data.status are the real triggers.
  }, [data?.currentItemIndex, data?.messages, data?.status]);

  return {
    createQuery,
    detailQuery,
    currentItem,
    divergedLine,
    annotations,
    chat,
    boardFen,
    boardMode: effectiveBoardMode,
    enterPeek: () => setBoardMode('peek'),
    exitPeek: () => setBoardMode('answer'),
    hint,
    isMoveSubmitting: moveAttempt.isSubmitting,
    moveAttemptError: moveAttempt.error,
    handleUserMove,
    handleLocalMove,
    sanMoves: committedLine?.moves.map((move) => move.san) ?? [],
    historyPositions,
    currentPly: data?.currentPly ?? 0,
    viewedPly,
    selectHistoryPly
  };
}
