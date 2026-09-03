import { GameListResponseSchema, type GameListItem } from '@freechesscoach/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { apiDelete, apiGet, apiPost } from '../../api/client.js';
import { PlayCircleIcon, PlusIcon } from '../../components/Icon.js';
import { GameRow, statusAndActionFor } from './GameRow.js';
import './GamesPage.css';

const SessionSummarySchema = z.object({ id: z.string() });
const AnalyzeResponseSchema = z.object({ analysisId: z.string() });

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'Not analyzed', label: 'Not analyzed' },
  { key: 'Ready', label: 'Ready' },
  { key: 'In progress', label: 'In progress' },
  { key: 'Completed', label: 'Completed' }
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

/** design.md §4.1: Games (home) — "Analyze a game" CTA, the game list, and
 * a no-dummy-data empty state. Owns fetching (AGENTS.md rule 7); GameRow is
 * presentational. A ready analyze-mode row hits POST /api/sessions (mirrors
 * ImportPage's post-analysis handoff) — the endpoint itself is find-or-create
 * (coachAgent.resumeOrCreateSession), so an existing active/paused session
 * for the game is linked back into rather than shadowed by a new one. A
 * coach_play row (architecture §14) instead navigates straight to its
 * already-existing sessionId — see handleSelect. */
export function GamesPage(): ReactNode {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FilterKey>('all');

  const gamesQuery = useQuery({
    queryKey: ['games'],
    queryFn: ({ signal }) => apiGet('/api/games', GameListResponseSchema, signal)
  });

  const sessionMutation = useMutation({
    mutationFn: (gameId: string) => apiPost('/api/sessions', { gameId }, SessionSummarySchema),
    onSuccess: (session) => navigate(`/session/${session.id}`)
  });

  const deleteMutation = useMutation({
    mutationFn: (gameId: string) => apiDelete(`/api/games/${gameId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['games'] })
  });

  // Phase 31 stat-bank import: starts analysis for a game that was imported
  // with deferAnalysis. Invalidating ['games'] flips the row from "Not
  // analyzed" to "Analyzing…" via the existing polling/status mechanism —
  // no separate progress UI needed here.
  const analyzeMutation = useMutation({
    mutationFn: (gameId: string) => apiPost(`/api/games/${gameId}/analyze`, {}, AnalyzeResponseSchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['games'] })
  });

  // Same-origin GET with Content-Disposition: attachment — a plain
  // navigation carries the oauth2-proxy session cookie and the browser
  // handles the save-file flow natively, no fetch+blob dance needed.
  function handleExportPgn(gameId: string): void {
    window.location.href = `/api/games/${gameId}/pgn`;
  }

  // Unlike the download above, clipboard needs the PGN as a string — a
  // plain `fetch` (not a navigation) reads GET /api/games/:id/pgn's raw
  // text body untouched by its own Content-Disposition header, which only
  // browser-native navigation acts on.
  const copyPgnMutation = useMutation({
    mutationFn: async (gameId: string) => {
      const response = await fetch(`/api/games/${gameId}/pgn`, { credentials: 'include' });
      if (!response.ok) throw new Error(`GET pgn failed with ${response.status}`);
      await navigator.clipboard.writeText(await response.text());
    }
  });

  // architecture §14: a coach_play game already has its session (created by
  // POST /api/sessions/play) — link straight back into it rather than
  // routing through analyze mode's POST /api/sessions, which gates on an
  // `analyses` row a play-mode game never has. A vs_bot game (the "Play vs
  // Bot" plan) is the same story, but links into the dedicated /bot-session
  // route rather than /session — see App.tsx's BotSessionRoute doc comment.
  function handleSelect(game: GameListItem): void {
    if (game.source === 'coach_play') {
      if (game.sessionId) void navigate(`/session/${game.sessionId}`);
      return;
    }
    if (game.source === 'vs_bot') {
      if (game.sessionId) void navigate(`/bot-session/${game.sessionId}`);
      return;
    }
    if (game.analysisStatus !== 'ready') return;
    sessionMutation.mutate(game.id);
  }

  return (
    <div className="page games-page">
      <header className="games-page__header">
        <div className="games-page__heading">
          <h1>Games</h1>
          <p className="games-page__description">Review your games and continue coaching sessions.</p>
        </div>
        <div className="games-page__header-actions">
          <Link to="/play/new" className="btn-secondary">
            <PlayCircleIcon width={16} height={16} />
            Play coach
          </Link>
          <Link to="/play-bot/new" className="btn-secondary">
            <PlayCircleIcon width={16} height={16} />
            Play a bot
          </Link>
          <Link to="/import" className="btn-primary">
            <PlusIcon width={16} height={16} />
            Analyze game
          </Link>
        </div>
      </header>

      {gamesQuery.isLoading && <p>Loading…</p>}
      {gamesQuery.isError && <p>Could not load your games.</p>}

      {gamesQuery.data && gamesQuery.data.length === 0 && (
        <p className="games-page__empty">
          No games yet — analyze your first game to start a coaching session, or connect your Lichess account in
          Settings.
        </p>
      )}

      {deleteMutation.isError && <p>Could not delete that game — try again.</p>}
      {analyzeMutation.isError && <p>Could not start analysis — try again.</p>}
      {copyPgnMutation.isError && <p>Could not copy the PGN — try again.</p>}

      {gamesQuery.data && gamesQuery.data.length > 0 && (
        <>
          <div className="games-page__filters" role="group" aria-label="Filter by status">
            {FILTERS.map((option) => (
              <button
                key={option.key}
                type="button"
                className={filter === option.key ? 'games-page__filter active' : 'games-page__filter'}
                onClick={() => setFilter(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <ul className="games-page__list">
            {gamesQuery.data
              .filter((game) => filter === 'all' || statusAndActionFor(game).statusLabel === filter)
              .map((game) => (
                <GameRow
                  key={game.id}
                  game={game}
                  onSelect={() => handleSelect(game)}
                  onAnalyze={(gameId) => analyzeMutation.mutate(gameId)}
                  onExportPgn={handleExportPgn}
                  onCopyPgn={(gameId) => copyPgnMutation.mutate(gameId)}
                  onDelete={(gameId) => deleteMutation.mutate(gameId)}
                />
              ))}
          </ul>
        </>
      )}
    </div>
  );
}
