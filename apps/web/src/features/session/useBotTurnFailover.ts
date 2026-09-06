import { resolveSanMove } from '@freechesscoach/chess-analysis';
import { useEffect, useRef } from 'react';
import { apiPost, ApiError } from '../../api/client.js';
import type { BotGameOverInfo } from './botGameOver.js';
import { CommitBotMoveResponseSchema } from './sessionPageSchemas.js';

const FAILOVER_POLL_MS = 4000;

export interface UseBotTurnFailoverOptions {
  sessionId: string;
  isActive: boolean;
  /** Whose turn it *really* is right now — the current game position, not
   * wherever the board happens to be peeking into history (same distinction
   * BotSessionPage's own `activeColor` draws for the clock). */
  isBotTurn: boolean;
  /** The position the bot is about to move from — used to derive the
   * committed move's from/to squares for the board arrow, same as
   * usePlayBotMoveSubmit does with the player's post-move fen. */
  currentFen: string;
  onBotMoveCommitted: (result: { fen: string; san: string; ply: number }, uci: string) => void;
  onClockUpdate: (whiteRemainingMs: number | null, blackRemainingMs: number | null) => void;
  onGameOver: (gameOver: BotGameOverInfo) => void;
}

/**
 * Recovers a bot reply that never showed up — either commitBotTurn itself
 * reported `botPending` (every engine retry in selectBotMove failed) or the
 * client never even saw a response that succeeded server-side (a dropped
 * connection). While it's the bot's move at the same position, polls
 * POST /request-bot-move at a low frequency; stops the instant the position
 * advances or it becomes the student's turn. See bot-move-commit.ts's
 * `requestBotMove` for the server side — it's a safe no-op if the reply
 * already landed some other way by the time this fires.
 */
export function useBotTurnFailover(options: UseBotTurnFailoverOptions): void {
  const { sessionId, isActive, isBotTurn, currentFen, onBotMoveCommitted, onClockUpdate, onGameOver } = options;
  const inFlightRef = useRef(false);
  // Re-read inside the interval callback rather than closing over stale
  // values from the render that started it.
  const latestRef = useRef({ currentFen, onBotMoveCommitted, onClockUpdate, onGameOver });
  latestRef.current = { currentFen, onBotMoveCommitted, onClockUpdate, onGameOver };

  useEffect(() => {
    if (!isActive || !isBotTurn) return;

    const timer = setInterval(() => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      apiPost(`/api/sessions/${sessionId}/request-bot-move`, {}, CommitBotMoveResponseSchema)
        .then((result) => {
          const { onBotMoveCommitted: applyMove, onClockUpdate: applyClock, onGameOver: applyGameOver } = latestRef.current;
          if (result.bot) {
            const resolved = resolveSanMove(latestRef.current.currentFen, result.bot.san);
            applyMove(result.bot, resolved ? `${resolved.from}${resolved.to}` : '');
          }
          applyClock(result.whiteRemainingMs, result.blackRemainingMs);
          if (result.gameOver) applyGameOver(result.gameOver);
        })
        // A 422 here just means the reply already landed some other way (or
        // the game ended) between this tick firing and the request arriving
        // — expected under retry, not worth surfacing. Anything else is a
        // transient failure the next tick will simply retry.
        .catch((error: unknown) => {
          if (!(error instanceof ApiError) || error.status !== 422) {
            console.warn('useBotTurnFailover: request-bot-move failed, will retry', error);
          }
        })
        .finally(() => {
          inFlightRef.current = false;
        });
    }, FAILOVER_POLL_MS);

    return () => clearInterval(timer);
    // isActive/isBotTurn are the only signals that should start or stop this
    // interval — currentFen and the callbacks are read fresh off latestRef
    // inside it instead, so this effect doesn't tear down and restart the
    // timer (losing the elapsed wait) every time the position updates.
  }, [sessionId, isActive, isBotTurn]);
}
