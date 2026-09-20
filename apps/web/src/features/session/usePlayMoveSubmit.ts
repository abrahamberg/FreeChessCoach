import type { MoveQuality } from '@freechesscoach/shared';
import { useRef, useState } from 'react';
import { apiPost, ApiError } from '../../api/client.js';
import { CommitPlayMoveResponseSchema } from './sessionPageSchemas.js';

export interface CommittedPlayMove {
  fen: string;
  san: string;
  ply: number;
  quality: MoveQuality;
}

/** What a move-committed handler actually needs, in either play mode: where the
 * move landed. Both handlers (useSessionPageData, useBotSessionPageData) read
 * nothing else — in particular not `quality`, which a bot turn may report as
 * null when it could not be rated in time. */
export type CommittedMoveRef = Pick<CommittedPlayMove, 'fen' | 'san' | 'ply'>;

export interface UsePlayMoveSubmitResult {
  /** Belt-and-suspenders 422 message (see submit's doc comment), or null
   * once a submission succeeds/hasn't been tried yet. */
  error: string | null;
  /** True from the moment `submit` is called until its request resolves —
   * SessionBoardColumn uses this to reject a second drop/click while the
   * first is still in flight. Without it, a slow request (a real engine
   * search can take several seconds) leaves the board's own optimistic
   * preview looking fully "done" with no visual sign anything is still
   * pending, inviting an impatient second move that either races the first
   * or lands as a spurious "Illegal move" once the first has already
   * advanced the position past it — the first move still went through
   * either way, which is exactly the confusing "it said illegal but it
   * worked" report this guards against. */
  isSubmitting: boolean;
  /** `usedHint`: true when the student clicked BoardActionBar's Hint before
   * playing this move — folded into the [player_move] message sent to the
   * coach (see PLAYER_MOVE_PATTERN) so the transcript/coach can see it, the
   * same way an explored diverged line already announces itself. */
  submit: (san: string, uci: string, usedHint?: boolean) => Promise<void>;
}

/** Client-side chess.js validation in CoachBoard already rejects most
 * illegal drops before onUserMove ever fires — a 422 here is belt-and-
 * suspenders for whatever that can't catch (e.g. a stale position after a
 * server-side undo), not the everyday path. */
function describePlayMoveError(error: unknown): string {
  if (error instanceof ApiError && error.body && typeof error.body === 'object' && 'title' in error.body) {
    const title = (error.body as { title?: unknown }).title;
    if (typeof title === 'string' && title.length > 0) return title;
  }
  return 'That move was rejected.';
}

/**
 * architecture §14: commits the student's play-mode move synchronously via
 * POST /api/sessions/:id/play-move (not the SSE chat endpoint) before the
 * coach's feedback-first turn starts — SessionBoardColumn's handleUserMove
 * calls submit() instead of sending an instant [board_move] chat message.
 */
export function usePlayMoveSubmit(
  sessionId: string,
  sendMessage: (content: string) => void,
  onPlayMoveCommitted?: (result: CommittedMoveRef, uci: string) => void
): UsePlayMoveSubmitResult {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // `isSubmitting` is React state — it only reflects in the `disabled` prop
  // CoachBoard reads on its NEXT render, leaving a synchronous gap where two
  // genuine move-commit events in the same tick (a drag/click double-fire)
  // both read stale `disabled=false` and both call submit(). This ref closes
  // that gap immediately, before any render.
  const submittingRef = useRef(false);

  async function submit(san: string, uci: string, usedHint = false): Promise<void> {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await apiPost(`/api/sessions/${sessionId}/play-move`, { san }, CommitPlayMoveResponseSchema);
      onPlayMoveCommitted?.(result, uci);
      sendMessage(`[player_move] I played ${san}.${usedHint ? ' (used a hint)' : ''}`);
    } catch (submitError) {
      setError(describePlayMoveError(submitError));
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  return { error, isSubmitting, submit };
}
