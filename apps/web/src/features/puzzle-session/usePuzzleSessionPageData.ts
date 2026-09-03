import { PuzzleSessionDetailSchema, PuzzleSessionSchema } from '@freechesscoach/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { apiGet, apiPost } from '../../api/client.js';
import type { CoachToolCall } from '../../hooks/useCoachChat.js';
import { useAnnotationLayer, type AnnotationState } from '../board/AnnotationLayer.js';
import { useDivergedLine } from '../session/useDivergedLine.js';
import { toPuzzleCoachMessages } from './puzzleSessionMessages.js';
import { usePuzzleCoachChat } from './usePuzzleCoachChat.js';

/**
 * All fetching + derived state for PuzzleSessionPage (AGENTS.md rule 7).
 * Create-or-resume happens once on mount (mirrors resumeOrCreatePuzzleSession
 * server-side): the route only names the assignment, not a session id, so
 * unlike SessionPage there is no existing session id to key a query on until
 * this mutation resolves.
 */
export function usePuzzleSessionPageData(assignmentId: string) {
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: () => apiPost('/api/puzzle-sessions', { assignmentId }, PuzzleSessionSchema)
  });

  const startedRef = useRef(false);
  useEffect(() => {
    if (!startedRef.current && assignmentId !== '') {
      startedRef.current = true;
      createMutation.mutate();
    }
    // Runs once per assignmentId (the page is keyed by it — see App.tsx's
    // PracticeRoute) — deliberately not depending on createMutation itself,
    // which would refire this on every mutate() call.
  }, [assignmentId]);

  const sessionId = createMutation.data?.id;
  const detailQuery = useQuery({
    queryKey: ['puzzle-session', sessionId],
    queryFn: ({ signal }) => apiGet(`/api/puzzle-sessions/${sessionId}`, PuzzleSessionDetailSchema, signal),
    enabled: sessionId !== undefined
  });

  const divergedLine = useDivergedLine();
  const annotations = useAnnotationLayer();
  const data = detailQuery.data;
  const currentItem = data ? (data.assignment.items[data.currentItemIndex] ?? null) : null;

  /** Disjoint tool ownership, same discipline useSessionPageData's
   * handleCoachToolCall uses: annotate_board is handled here directly
   * (no show_position to route through — that tool doesn't exist for this
   * session kind), everything else goes to divergedLine. */
  function handleCoachToolCall(toolCall: CoachToolCall): unknown {
    if (toolCall.toolName === 'annotate_board') {
      annotations.setAnnotations(toolCall.input as AnnotationState);
      return { acknowledged: true };
    }
    if (!data || !currentItem) return undefined;
    return divergedLine.handleToolCall(toolCall, { ply: data.currentItemIndex, fen: currentItem.fen });
  }

  function handleServerToolResult(toolName: string): void {
    if (toolName !== 'advance_puzzle' || sessionId === undefined) return;
    divergedLine.exit();
    annotations.clear();
    void queryClient.invalidateQueries({ queryKey: ['puzzle-session', sessionId] });
  }

  const initialMessages = data ? toPuzzleCoachMessages(data.messages) : undefined;
  const chat = usePuzzleCoachChat(sessionId ?? '', {
    onToolCall: handleCoachToolCall,
    onServerToolResult: handleServerToolResult,
    initialMessages
  });

  // The coach opens every puzzle it hasn't spoken about yet (a fresh
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
    createMutation,
    detailQuery,
    currentItem,
    divergedLine,
    annotations,
    chat
  };
}
