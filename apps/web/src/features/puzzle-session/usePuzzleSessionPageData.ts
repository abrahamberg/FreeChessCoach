import { applyUciSequence } from '@freechesscoach/chess-analysis';
import {
  AdvancePuzzleItemResponseSchema,
  PuzzleSessionDetailSchema,
  PuzzleSessionSchema,
  UserProfileSchema
} from '@freechesscoach/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiPost } from '../../api/client.js';
import type { CoachToolCall } from '../../hooks/useCoachChat.js';
import { useUnlockLlmSetup } from '../../hooks/useUnlockLlmSetup.js';
import { useAnnotationLayer, type AnnotationState } from '../board/AnnotationLayer.js';
import { useDivergedLine } from '../session/useDivergedLine.js';
import { toPuzzleCoachMessages } from './puzzleSessionMessages.js';
import { usePuzzleCoachChat } from './usePuzzleCoachChat.js';

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
 * Practice is discuss-only: the board is locked, the student never moves a
 * piece. The coach sees the whole line and walks the student through it in
 * chat; once a move is established it calls the server tool play_next_move,
 * which advances the stored ply (the student's move plus the opponent's
 * forced reply). This hook just refetches on that tool result. The line
 * itself never changes, so the chat episode (message itemIndex) doesn't
 * either. The only board movement on this side is a coach-driven
 * hypothetical_line (divergedLine), and a read-only look back through the
 * moves already played (viewedPly).
 */
export function usePuzzleSessionPageData(assignmentId: string, onSessionReset: () => void) {
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

  // "Reset session" (same menu item as the coach game): abandons this
  // session and opens a fresh conversation on the same item. The create
  // query is pointed at the fresh session and the page then remounts
  // (onSessionReset) so no chat/board state from the old one lingers.
  const resetMutation = useMutation({
    mutationFn: () => apiPost(`/api/puzzle-sessions/${sessionId}/reset`, {}, PuzzleSessionSchema),
    onSuccess: (fresh) => {
      queryClient.setQueryData(['puzzle-session-create', assignmentId], fresh);
      onSessionReset();
    }
  });

  // Same query key the coach game and Settings share — the coach's persona
  // and the account's voice (TTS) settings.
  const profileQuery = useQuery({
    queryKey: ['profile'],
    queryFn: ({ signal }) => apiGet('/api/users/me', UserProfileSchema, signal)
  });

  const divergedLine = useDivergedLine();
  const annotations = useAnnotationLayer();
  const data = detailQuery.data;
  const currentItem = data ? (data.assignment.items[data.currentItemIndex] ?? null) : null;

  // Read-only "glance at an earlier point in this item's played-out line"
  // (MoveExplorer's onSelect) — no moves are possible, it's purely a
  // look-back. Reset by a fresh item or the coach bringing the board back
  // (show_position).
  const [viewedPly, setViewedPly] = useState<number | null>(null);

  const committedLine =
    currentItem && data ? applyUciSequence(currentItem.fen, currentItem.moves.slice(0, data.currentPly)) : null;
  const historyPositions: PuzzleHistoryPosition[] = [
    { ply: 0, fen: currentItem?.fen ?? '' },
    ...(committedLine?.moves.map((move, index) => ({ ply: index + 1, fen: move.fen })) ?? [])
  ];
  const viewedFen = viewedPly !== null ? (historyPositions.find((position) => position.ply === viewedPly)?.fen ?? null) : null;

  const boardFen = divergedLine.fen ?? viewedFen ?? data?.currentFen ?? '';

  // The student plays the side to move once the item's opponent setup move
  // (moves[0]) is out of the way — i.e. the opposite of the raw item fen's
  // side to move. Their board is turned to that side.
  const orientation: 'white' | 'black' = currentItem?.fen.split(' ')[1] === 'w' ? 'black' : 'white';

  // True once the coach has played the item's line all the way out — drives
  // the "next practice" action (advanceItem below), a deterministic way to
  // move on that doesn't depend on the coach's own advance_puzzle tool call.
  // Derived from the stored ply, so it survives a reload.
  const lineComplete = currentItem !== null && data !== undefined && data.currentPly >= currentItem.moves.length;

  const advanceItemMutation = useMutation({
    mutationFn: () => apiPost(`/api/puzzle-sessions/${sessionId}/advance-item`, {}, AdvancePuzzleItemResponseSchema),
    onSuccess: () => {
      if (sessionId !== undefined) void queryClient.invalidateQueries({ queryKey: ['puzzle-session', sessionId] });
    },
    // A 409 here means the coach's own advance_puzzle tool call already won
    // the race (advancePuzzleItem's idempotency guard rejects a second
    // advance past the same item) — refetch to pick up wherever it actually
    // landed instead of leaving the button spinning on a request that will
    // never succeed as sent.
    onError: () => {
      if (sessionId !== undefined) void queryClient.invalidateQueries({ queryKey: ['puzzle-session', sessionId] });
    }
  });

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
      setViewedPly(null);
    }
    if (!data || !currentItem) return undefined;
    return divergedLine.handleToolCall(toolCall, { ply: data.currentItemIndex, fen: data.currentFen });
  }

  function handleServerToolResult(toolName: string): void {
    if (sessionId === undefined) return;
    if (toolName === 'play_next_move') {
      // The coach put the next move on the board — pick up the new ply.
      divergedLine.exit();
      annotations.clear();
      setViewedPly(null);
      void queryClient.invalidateQueries({ queryKey: ['puzzle-session', sessionId] });
      return;
    }
    if (toolName !== 'advance_puzzle') return;
    divergedLine.exit();
    annotations.clear();
    setViewedPly(null);
    void queryClient.invalidateQueries({ queryKey: ['puzzle-session', sessionId] });
  }

  // Same setup-required/unlock-required popups as the real coach session
  // (useSessionPageData.ts) — this hook previously had neither wired up at
  // all, so a student with no AI configured got a permanently blank coach
  // bubble and no way to know why (see usePuzzleCoachChat.ts).
  const navigate = useNavigate();
  const unlock = useUnlockLlmSetup();
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const pendingRetryRef = useRef<(() => Promise<void>) | null>(null);
  const handleUnlockRequired = useCallback((retry: () => Promise<void>) => {
    pendingRetryRef.current = retry;
    setShowUnlockModal(true);
  }, []);

  const [showSetupRequiredModal, setShowSetupRequiredModal] = useState(false);
  const handleSetupRequired = useCallback(() => {
    setShowSetupRequiredModal(true);
  }, []);

  const setupRequiredModal = {
    isOpen: showSetupRequiredModal,
    onClose: () => setShowSetupRequiredModal(false),
    onGoToSettings: () => {
      setShowSetupRequiredModal(false);
      void navigate('/settings#settings-api-keys');
    }
  };

  const initialMessages = data ? toPuzzleCoachMessages(data.messages) : undefined;
  const chat = usePuzzleCoachChat(sessionId ?? '', {
    onToolCall: handleCoachToolCall,
    onServerToolResult: handleServerToolResult,
    onUnlockRequired: handleUnlockRequired,
    onSetupRequired: handleSetupRequired,
    initialMessages
  });

  const unlockModal = {
    isOpen: showUnlockModal,
    isPending: unlock.isPending,
    isSuccess: unlock.isSuccess,
    errorMessage: unlock.errorMessage,
    onUnlock: unlock.unlock,
    onClose: () => {
      setShowUnlockModal(false);
      unlock.reset();
    },
    onUnlocked: () => {
      setShowUnlockModal(false);
      unlock.reset();
      const retry = pendingRetryRef.current;
      pendingRetryRef.current = null;
      void retry?.();
    }
  };

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
    profileQuery,
    currentItem,
    divergedLine,
    annotations,
    chat,
    boardFen,
    orientation,
    sanMoves: committedLine?.moves.map((move) => move.san) ?? [],
    historyPositions,
    currentPly: data?.currentPly ?? 0,
    viewedPly,
    selectHistoryPly,
    items: data?.assignment.items ?? [],
    currentItemIndex: data?.currentItemIndex ?? 0,
    lineComplete,
    isAdvancingItem: advanceItemMutation.isPending,
    advanceToNextItem: () => advanceItemMutation.mutate(),
    setupRequiredModal,
    unlockModal,
    resetSession: () => resetMutation.mutate(),
    isResetting: resetMutation.isPending
  };
}
