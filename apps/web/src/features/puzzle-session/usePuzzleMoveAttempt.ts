import { useRef, useState } from 'react';
import { AttemptPuzzleMoveResponseSchema, type AttemptPuzzleMoveResponse } from '@freechesscoach/shared';
import { apiPost, ApiError } from '../../api/client.js';

export interface UsePuzzleMoveAttemptResult {
  /** A genuine request failure (network, session no longer active) — NOT
   * how an off-line move is reported; that's `accepted: false` in a normal
   * 200 response, handled by `onResult`. */
  error: string | null;
  isSubmitting: boolean;
  /** `usedHint`: true when the student clicked BoardActionBar's Hint before
   * this attempt — folded into the [move_attempt] message sent to the coach,
   * the same "the coach can see what happened" treatment usePlayMoveSubmit's
   * own "(used a hint)" note gets. */
  submit: (san: string, uci: string, usedHint?: boolean) => Promise<void>;
}

function describeAttemptError(error: unknown): string {
  if (error instanceof ApiError && error.body && typeof error.body === 'object' && 'title' in error.body) {
    const title = (error.body as { title?: unknown }).title;
    if (typeof title === 'string' && title.length > 0) return title;
  }
  return 'That move could not be submitted.';
}

/**
 * Puzzle-session sibling of usePlayMoveSubmit (session/usePlayMoveSubmit.ts)
 * — commits a move attempt against the item's known solution line (POST
 * /attempt-move, puzzle-move-commit.ts) BEFORE telling the coach about it,
 * same "the frontend needs the confirmed fen immediately" split. Unlike
 * play mode, being off the line isn't an error: the endpoint always
 * resolves 200 with `accepted: false`, and it's `onResult` (wired to
 * usePuzzleBoardState) that decides whether to keep the move or revert —
 * this hook only owns the round trip and the follow-up chat turn.
 */
export function usePuzzleMoveAttempt(
  sessionId: string,
  sendMessage: (content: string) => void,
  onResult: (result: AttemptPuzzleMoveResponse, san: string) => void
): UsePuzzleMoveAttemptResult {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Closes the same same-tick double-submit gap usePlayMoveSubmit's own
  // submittingRef documents — React state only reflects on the next render.
  const submittingRef = useRef(false);

  async function submit(san: string, uci: string, usedHint = false): Promise<void> {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await apiPost(
        `/api/puzzle-sessions/${sessionId}/attempt-move`,
        { san, uci },
        AttemptPuzzleMoveResponseSchema
      );
      onResult(result, san);
      const hintNote = usedHint ? ' (used a hint)' : '';
      sendMessage(
        result.accepted
          ? `[move_attempt] I played ${san} — on the line.${hintNote}`
          : `[move_attempt] I tried ${san} — not on the line, reverted.${hintNote}`
      );
    } catch (submitError) {
      setError(describeAttemptError(submitError));
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  return { error, isSubmitting, submit };
}
