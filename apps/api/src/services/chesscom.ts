import { parsePgn } from '@freechesscoach/chess-analysis';
import type { ChesscomRecentGame } from '@freechesscoach/shared';

const RECENT_GAMES_LIMIT = 20;
/** How many monthly archives one page may walk back through. */
const MAX_ARCHIVE_MONTHS = 6;

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
  /** One page (newest first); `before` continues from where the previous
   * page's oldest game ended. */
  fetchRecentGames(username: string, before?: Date): Promise<Omit<ChesscomRecentGame, 'imported'>[]>;
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
    async fetchRecentGames(username: string, before?: Date): Promise<Omit<ChesscomRecentGame, 'imported'>[]> {
      const cutoff = (before ?? new Date()).getTime() / 1000;
      const start = before ?? new Date();
      const games: ChesscomApiGame[] = [];
      for (let back = 0; back < MAX_ARCHIVE_MONTHS && games.length < RECENT_GAMES_LIMIT; back++) {
        const month = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - back, 1));
        const archive = await fetchArchive(fetchImpl, username, month, back === 0);
        games.push(...archive.filter((game) => before === undefined || (game.end_time ?? 0) < cutoff));
      }

      return games
        .sort((a, b) => (b.end_time ?? 0) - (a.end_time ?? 0))
        .slice(0, RECENT_GAMES_LIMIT)
        .map(toRecentGame);
    }
  };
}

/** A month the player never played in is a 404 — an empty month, not an
 * error, except for the first month asked (which is how a mistyped username
 * still surfaces). */
async function fetchArchive(
  fetchImpl: typeof fetch,
  username: string,
  month: Date,
  strict: boolean
): Promise<ChesscomApiGame[]> {
  const year = month.getUTCFullYear();
  const monthNumber = String(month.getUTCMonth() + 1).padStart(2, '0');
  const url = `https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/${year}/${monthNumber}`;
  const response = await fetchImpl(url);
  if (!response.ok) {
    if (!strict && response.status === 404) return [];
    throw new ChesscomApiError(response.status);
  }

  const body = (await response.json()) as ChesscomArchiveResponse;
  return body.games ?? [];
}

function toRecentGame(raw: ChesscomApiGame): Omit<ChesscomRecentGame, 'imported'> {
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
