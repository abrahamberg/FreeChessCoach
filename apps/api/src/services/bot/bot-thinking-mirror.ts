import { createClient } from 'redis';
import { withDeadline } from '../../lib/with-deadline.js';
import { BotThinkingMoveSchema, type BotThinkingMove } from '@freechesscoach/shared';

/**
 * A copy of live Thinking-log moves that every API pod can read. The API runs
 * as several pods and the poll for a move's log can land on a different pod
 * than the one working on the move, so each pod publishes its moves here
 * (bot-thinking-registry.ts) and the GET route merges what it reads with its
 * own. Still a diagnostic view, not game data: entries expire, and every call
 * is best-effort — a failure only means a poll shows less.
 */
export interface BotThinkingMirror {
  write(sessionId: string, moveId: string, move: BotThinkingMove): Promise<void>;
  remove(sessionId: string, moveId: string): Promise<void>;
  read(sessionId: string): Promise<{ id: string; move: BotThinkingMove }[]>;
}

export const BOT_THINKING_MIRROR_TTL_SECONDS = 3600;
export const BOT_THINKING_MIRROR_TIMEOUT_MS = 500;

/** One Redis hash per session (field = move id), so pods working on different
 * moves of the same game never overwrite each other. */
export function createRedisBotThinkingMirror(redisUrl: string, timeoutMs = BOT_THINKING_MIRROR_TIMEOUT_MS): BotThinkingMirror {
  const client = createClient({ url: redisUrl });
  client.on('error', (error) => console.error('Bot thinking Redis error', error));
  const connected = client.connect();
  const keyFor = (sessionId: string) => `bot-thinking:${sessionId}`;

  return {
    async write(sessionId, moveId, move) {
      await withDeadline('bot thinking mirror', async () => {
        await connected;
        await client.hSet(keyFor(sessionId), moveId, JSON.stringify(move));
        await client.expire(keyFor(sessionId), BOT_THINKING_MIRROR_TTL_SECONDS);
      }, timeoutMs);
    },
    async remove(sessionId, moveId) {
      await withDeadline('bot thinking mirror', async () => {
        await connected;
        await client.hDel(keyFor(sessionId), moveId);
      }, timeoutMs);
    },
    async read(sessionId) {
      const fields = await withDeadline('bot thinking mirror', async () => {
        await connected;
        return client.hGetAll(keyFor(sessionId));
      }, timeoutMs);
      const moves: { id: string; move: BotThinkingMove }[] = [];
      for (const [id, raw] of Object.entries(fields ?? {})) {
        const move = parseMove(raw);
        if (move) moves.push({ id, move });
      }
      return moves;
    }
  };
}

/** A corrupt or foreign entry is skipped, never a failed poll. */
function parseMove(raw: string): BotThinkingMove | undefined {
  try {
    const parsed = BotThinkingMoveSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
