import type { MoveQuality } from '@freechesscoach/shared';
import { resolveSanMove } from '@freechesscoach/chess-analysis';
import { useState } from 'react';
import { apiPost, ApiError } from '../../api/client.js';
import { CommitBotMoveResponseSchema } from './sessionPageSchemas.js';

export interface CommittedBotTurnMove {
  fen: string;
  san: string;
  ply: number;
  quality: MoveQuality;
  elapsedMs: number;
}

export interface UsePlayBotMoveSubmitResult {
  error: string | null;
  /** True from the moment `submit` is called until its response resolves —
   * see usePlayMoveSubmit's identical field for why this matters: the
   * board's own optimistic preview makes a move look fully applied well
   * before the server round trip (a real engine search here can take
   * several seconds) returns, so without this a second drop mid-flight can
   * race the first or land as a spurious "Illegal move" after the first has
   * already advanced the position past it. */
  isSubmitting: boolean;
  submit: (san: string, uci: string) => Promise<void>;
}

/** Same belt-and-suspenders reasoning as usePlayMoveSubmit's own version —
 * client-side chess.js validation already rejects most illegal drops before
 * this ever runs. */
function describePlayMoveError(error: unknown): string {
  if (error instanceof ApiError && error.body && typeof error.body === 'object' && 'title' in error.body) {
    const title = (error.body as { title?: unknown }).title;
    if (typeof title === 'string' && title.length > 0) return title;
  }
  return 'That move was rejected.';
}

/**
 * The play_bot equivalent of usePlayMoveSubmit — commits the student's move
 * AND (unless it already ended the game) receives the bot's synchronous
 * reply in the same response ("Play vs Bot" plan). No sendMessage call:
 * there is no chat in play_bot mode. `onPlayMoveCommitted` fires once for
 * the student's move and, when present, again for the bot's — reusing
 * SessionBoardColumn's existing callback contract unchanged. `onGameOver`
 * fires once when the response's `gameOver` is non-null, so the caller can
 * refetch session status (the session is already marked 'completed'
 * server-side by the time this response arrives).
 */
export function usePlayBotMoveSubmit(
  sessionId: string,
  onPlayMoveCommitted?: (result: CommittedBotTurnMove, uci: string) => void,
  onGameOver?: () => void,
  /** The clock phase's own hook — fires once per submit with the
   * post-exchange remaining time for each side (null/null for an untimed
   * game), so the caller can re-anchor its ticking ClockDisplay. */
  onClockUpdate?: (whiteRemainingMs: number | null, blackRemainingMs: number | null) => void
): UsePlayBotMoveSubmitResult {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(san: string, uci: string): Promise<void> {
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await apiPost(`/api/sessions/${sessionId}/play-move`, { san }, CommitBotMoveResponseSchema);
      // `player` is only ever null on the sibling request-bot-move response
      // (useBotTurnFailover) — this endpoint always commits a student move,
      // so the guard below is for the type checker, not a real runtime case.
      if (result.player) {
        onPlayMoveCommitted?.(result.player, uci);
        if (result.bot) {
          // The bot's move has no moveUci of its own (same situation the
          // coach's tool-played moves already have — see
          // useSessionPageData.ts's applyPlayCoachMove) — derive it from the
          // position right before the bot's move.
          const resolved = resolveSanMove(result.player.fen, result.bot.san);
          const botUci = resolved ? `${resolved.from}${resolved.to}` : '';
          onPlayMoveCommitted?.(result.bot, botUci);
        }
      }
      onClockUpdate?.(result.whiteRemainingMs, result.blackRemainingMs);
      if (result.gameOver) onGameOver?.();
    } catch (submitError) {
      setError(describePlayMoveError(submitError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return { error, isSubmitting, submit };
}
