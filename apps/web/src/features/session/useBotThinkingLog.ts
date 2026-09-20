import type { BotThinkingLog, BotThinkingMove } from '@freechesscoach/shared';
import { BotThinkingLogSchema } from '@freechesscoach/shared';
import { useQuery } from '@tanstack/react-query';
import { apiGet, shouldRetryQuery } from '../../api/client.js';

/** How often the Thinking log is re-read while the bot is (or may be) working.
 * Fast enough that a step's start/end shows up as it happens; the counters
 * between polls are drawn client-side (BotThinkingPanel's clock). */
export const BOT_THINKING_POLL_MS = 500;

export interface UseBotThinkingLogOptions {
  /** True while the position on screen is waiting on the bot — the request
   * that will start a move's trace may not have reached the server yet, so
   * polling starts before there is anything to see. */
  isBotTurn: boolean;
  pollMs?: number;
}

function hasThinkingMove(log: BotThinkingLog | undefined): boolean {
  return log?.moves.some((move) => move.status === 'thinking') ?? false;
}

/**
 * The bot's Thinking log for one session (GET /api/sessions/:id/bot-thinking):
 * polls while it is the bot's turn, and keeps going after the turn passes
 * until the latest move no longer reads "thinking" — so the last poll before
 * the reply landed can't leave a finished move frozen mid-step. A failed read
 * just yields an empty log; it is a diagnostic view, never worth an error UI.
 */
export function useBotThinkingLog(
  sessionId: string,
  { isBotTurn, pollMs = BOT_THINKING_POLL_MS }: UseBotThinkingLogOptions
): { moves: BotThinkingMove[]; isError: boolean } {
  const query = useQuery({
    queryKey: ['bot-thinking', sessionId],
    queryFn: ({ signal }) => apiGet(`/api/sessions/${sessionId}/bot-thinking`, BotThinkingLogSchema, signal),
    enabled: sessionId !== '',
    refetchInterval: (current) => (isBotTurn || hasThinkingMove(current.state.data) ? pollMs : false),
    retry: shouldRetryQuery
  });

  return { moves: query.data?.moves ?? [], isError: query.isError };
}
