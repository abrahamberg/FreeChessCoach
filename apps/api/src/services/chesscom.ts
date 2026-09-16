import { parsePgn } from '@freechesscoach/chess-analysis';
import type { ChesscomRecentGame } from '@freechesscoach/shared';

const RECENT_GAMES_LIMIT = 20;

interface ChesscomApiGame {
  uuid?: string;
  pgn?: string;
  end_time?: number;
  rated?: boolean;
  time_class?: string;
  time_control?: string;
  white?: { username?: string; rating?: number };
  black?: { username?: string; rating?: number };
}

interface ChesscomArchiveResponse {
  games?: ChesscomApiGame[];
}

export interface ChesscomClient {
  fetchRecentGames(username: string): Promise<ChesscomRecentGame[]>;
}

export class ChesscomApiError extends Error {
  constructor(status: number) {
    super(`Chess.com API request failed with status ${status}`);
  }
}

/** Task 51.6: `GET /api/chesscom/recent-games` — wraps Chess.com's
 * per-month game archive (there's no single "recent games" endpoint like
 * Lichess's). Reads the current month, falling back to the previous month
 * when that alone doesn't reach RECENT_GAMES_LIMIT. `fetchImpl` is
 * injectable so the HTTP calls are unit-testable without hitting the real
 * API. */
export function createChesscomClient(fetchImpl: typeof fetch = fetch): ChesscomClient {
  return {
    async fetchRecentGames(username: string): Promise<ChesscomRecentGame[]> {
      const now = new Date();
      const games = await fetchArchive(fetchImpl, username, now);
      if (games.length < RECENT_GAMES_LIMIT) {
        const previousMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
        games.push(...(await fetchArchive(fetchImpl, username, previousMonth)));
      }

      return games
        .sort((a, b) => (b.end_time ?? 0) - (a.end_time ?? 0))
        .slice(0, RECENT_GAMES_LIMIT)
        .map(toRecentGame);
    }
  };
}

async function fetchArchive(fetchImpl: typeof fetch, username: string, month: Date): Promise<ChesscomApiGame[]> {
  const year = month.getUTCFullYear();
  const monthNumber = String(month.getUTCMonth() + 1).padStart(2, '0');
  const url = `https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/${year}/${monthNumber}`;
  const response = await fetchImpl(url);
  if (!response.ok) throw new ChesscomApiError(response.status);

  const body = (await response.json()) as ChesscomArchiveResponse;
  return body.games ?? [];
}

function toRecentGame(raw: ChesscomApiGame): ChesscomRecentGame {
  const headers = raw.pgn ? parsePgn(raw.pgn).headers : {};
  return {
    id: raw.uuid ?? '',
    pgn: raw.pgn ?? '',
    whiteName: headers['White'] ?? raw.white?.username ?? null,
    blackName: headers['Black'] ?? raw.black?.username ?? null,
    result: headers['Result'] ?? null,
    timeControl: raw.time_control ?? headers['TimeControl'] ?? null,
    playedAt: raw.end_time ? new Date(raw.end_time * 1000).toISOString() : null,
    rated: raw.rated ?? false,
    timeClass: raw.time_class ?? 'unknown',
    whiteRating: raw.white?.rating ?? null,
    blackRating: raw.black?.rating ?? null
  };
}
