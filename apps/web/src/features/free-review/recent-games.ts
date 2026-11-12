import { createChesscomClient, createLichessClient } from '@freechesscoach/game-sources';

export type GameSite = 'chesscom' | 'lichess';

/** One game of a player's recent list, as the picker shows it. */
export interface RecentGame {
  id: string;
  pgn: string;
  whiteName: string | null;
  blackName: string | null;
  result: string | null;
  playedAt: string | null;
  timeClass: string;
}

/** A site's public game list, read straight from this browser (both sites
 * allow it): the visitor's username never reaches this app's server. */
export async function fetchRecentGames(site: GameSite, username: string): Promise<RecentGame[]> {
  const browserFetch: typeof fetch = (input, init) => fetch(input, { ...init, credentials: 'omit' });
  const client = site === 'chesscom' ? createChesscomClient(browserFetch) : createLichessClient(browserFetch);
  const games = await client.fetchRecentGames(username.trim());
  return games.filter((game) => game.pgn !== '');
}

/** The side `username` played, or null when neither name is theirs. */
export function playerSide(game: Pick<RecentGame, 'whiteName' | 'blackName'>, username: string): 'white' | 'black' | null {
  const name = username.trim().toLowerCase();
  if (game.whiteName?.toLowerCase() === name) return 'white';
  if (game.blackName?.toLowerCase() === name) return 'black';
  return null;
}
