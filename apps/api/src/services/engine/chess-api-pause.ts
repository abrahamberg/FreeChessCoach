import { CHESS_API_RATE_LIMIT_COOLDOWN_MS } from '@freechesscoach/shared';

/** When the external engine is paused until for a user chess-api.com last
 * rate-limited at `rateLimitedAt`, or null if it is not paused (never limited,
 * or the cooldown has passed). */
export function chessApiPausedUntil(rateLimitedAt: Date | null, now: Date = new Date()): Date | null {
  if (!rateLimitedAt) return null;
  const until = new Date(rateLimitedAt.getTime() + CHESS_API_RATE_LIMIT_COOLDOWN_MS);
  return until > now ? until : null;
}
