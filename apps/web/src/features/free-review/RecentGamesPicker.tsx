import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { fetchRecentGames, playerSide, type GameSite, type RecentGame } from './recent-games.js';
import type { ReviewOrigin } from './review-origin.js';

const SITE_NAMES: Record<GameSite, string> = { chesscom: 'Chess.com', lichess: 'Lichess' };

export interface RecentGamesPickerProps {
  site: GameSite;
  onReview: (pgn: string, userColor: 'white' | 'black', origin: ReviewOrigin) => void;
}

/** A username, then that player's recent games: picking one reviews it from the player's side. */
export function RecentGamesPicker({ site, onReview }: RecentGamesPickerProps): ReactNode {
  const [draft, setDraft] = useState('');
  const [username, setUsername] = useState('');
  const games = useQuery({
    queryKey: ['free-review-games', site, username.toLowerCase()],
    queryFn: () => fetchRecentGames(site, username),
    enabled: username !== '',
    retry: false,
    staleTime: 60_000
  });

  return (
    <div className="free-review__picker">
      <form
        className="free-review__username"
        onSubmit={(event) => {
          event.preventDefault();
          setUsername(draft.trim());
        }}
      >
        <label htmlFor="free-review-username" className="free-review__label">
          Your {SITE_NAMES[site]} username
        </label>
        <div className="free-review__username-row">
          <input id="free-review-username" value={draft} onChange={(event) => setDraft(event.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} />
          <button type="submit" className="btn-primary" disabled={draft.trim() === ''}>
            Find my games
          </button>
        </div>
      </form>
      {games.isFetching && <p className="meta">Looking for your games…</p>}
      {games.isError && (
        <p role="alert" className="free-review__error">
          I could not find games for “{username}” on {SITE_NAMES[site]}. Check the username.
        </p>
      )}
      {games.data && games.data.length === 0 && <p className="meta">No recent games found for “{username}”.</p>}
      {games.data && games.data.length > 0 && (
        <ul className="free-review__games">
          {games.data.map((game) => (
            <li key={game.id}>
              <GameRow game={game} site={site} username={username} onReview={onReview} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GameRow({ game, site, username, onReview }: { game: RecentGame; site: GameSite; username: string; onReview: RecentGamesPickerProps['onReview'] }): ReactNode {
  const side = playerSide(game, username) ?? 'white';
  const played = game.playedAt ? new Date(game.playedAt).toLocaleDateString() : null;
  return (
    <button type="button" className="free-review__game" onClick={() => onReview(game.pgn, side, { source: site, playedAt: game.playedAt })}>
      <span className="free-review__game-players">
        {game.whiteName ?? '?'} vs {game.blackName ?? '?'}
      </span>
      <span className="meta">{[game.result, game.timeClass, played].filter(Boolean).join(' · ')}</span>
    </button>
  );
}
