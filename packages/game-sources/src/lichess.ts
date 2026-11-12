import { parsePgn } from '@freechesscoach/chess-analysis';
import type { LichessRecentGame } from '@freechesscoach/shared';

const RECENT_GAMES_LIMIT = 20;

interface LichessNdjsonGame {
  id: string;
  createdAt?: number;
  speed?: string;
  pgn?: string;
  players?: {
    white?: { user?: { name?: string } };
    black?: { user?: { name?: string } };
  };
}

export interface LichessClient {
  /** One page (newest first); `before` continues from where the previous
   * page's oldest game ended. */
  fetchRecentGames(username: string, before?: Date): Promise<Omit<LichessRecentGame, 'imported'>[]>;
}

export class LichessApiError extends Error {
  constructor(status: number) {
    super(`Lichess API request failed with status ${status}`);
  }
}

/** Task 7.1: `GET /api/lichess/recent-games` — wraps Lichess's ndjson games
 * export. `fetchImpl` is injectable so the HTTP call is unit-testable
 * without hitting the real API. */
export function createLichessClient(fetchImpl: typeof fetch = fetch): LichessClient {
  return {
    async fetchRecentGames(username: string, before?: Date): Promise<Omit<LichessRecentGame, 'imported'>[]> {
      const until = before ? `&until=${before.getTime() - 1}` : '';
      const url = `https://lichess.org/api/games/user/${encodeURIComponent(username)}?max=${RECENT_GAMES_LIMIT}&pgnInJson=true${until}`;
      const response = await fetchImpl(url, {
        headers: { Accept: 'application/x-ndjson' }
      });
      if (!response.ok) throw new LichessApiError(response.status);

      const text = await response.text();
      return text
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => toRecentGame(JSON.parse(line) as LichessNdjsonGame));
    }
  };
}

/** Lichess's `speed` in Chess.com's vocabulary: ultraBullet is just bullet,
 * correspondence is Chess.com's "daily". */
function timeClassOf(speed: string | undefined): string {
  if (speed === 'ultraBullet') return 'bullet';
  if (speed === 'correspondence') return 'daily';
  return speed ?? 'unknown';
}

function toRecentGame(raw: LichessNdjsonGame): Omit<LichessRecentGame, 'imported'> {
  const headers = raw.pgn ? parsePgn(raw.pgn).headers : {};
  return {
    id: raw.id,
    pgn: raw.pgn ?? '',
    whiteName: headers['White'] ?? raw.players?.white?.user?.name ?? null,
    blackName: headers['Black'] ?? raw.players?.black?.user?.name ?? null,
    result: headers['Result'] ?? null,
    timeControl: headers['TimeControl'] ?? null,
    playedAt: raw.createdAt ? new Date(raw.createdAt).toISOString() : null,
    timeClass: timeClassOf(raw.speed)
  };
}
