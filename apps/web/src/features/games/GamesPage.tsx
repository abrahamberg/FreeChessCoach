import {
  GameListResponseSchema,
  ImportQuotaResponseSchema,
  PromoteGameResponseSchema,
  isTopReviewTier,
  type GameListItem
} from '@freechesscoach/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { apiDelete, apiGet, apiPost } from '../../api/client.js';
import { useActiveAnalyses } from '../../hooks/useActiveAnalyses.js';
import { usePracticeAssignments } from '../dashboard/usePracticeAssignments.js';
import { ContinueSessionCard } from './ContinueSessionCard.js';
import { GameRow, sourceGroupFor, type SourceGroup } from './GameRow.js';
import { ImportShortcuts } from './ImportShortcuts.js';
import { PracticeContinueCard } from './PracticeContinueCard.js';
import './GamesPage.css';

const SessionSummarySchema = z.object({ id: z.string() });
const AnalyzeResponseSchema = z.object({ analysisId: z.string() });

type SourceTab = 'all' | SourceGroup;

// Source is metadata, not navigation (Daniel's IA feedback) — this replaces
// the old four review-tier tabs (Coach/Review/Bot games/Imported games,
// which conflated "what you can do with a game" with "where it came from")
// with a plain filter over GameRow's own source grouping. Every game always
// offers both Review and Coach once it's ready (see GameRow), regardless of
// which of these tabs it's under.
const SOURCE_TABS: { key: SourceTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'imported', label: 'Imported' },
  { key: 'bot', label: 'Bot' },
  { key: 'coached', label: 'Coached' }
];

/** design.md §4.1: Games (home) — an "Import games" section (every import
 * path, one click away, replacing the old single "Add games" button as the
 * page's primary CTA), an in-progress "Continue" section, the game list,
 * and a no-dummy-data empty state. Owns fetching (AGENTS.md rule 7);
 * GameRow/ContinueSessionCard/ImportShortcuts are presentational. One
 * filter row, not two: a second row filtering by status (Ready/Analyzing/…)
 * used to sit under the source tabs, but with a status badge already on
 * every card and most students' lists small enough to just scan, stacking
 * a second segmented control under the first read as chrome for its own
 * sake — the exact "tabs as primary IA" clutter this redesign was meant to
 * remove. */
export function GamesPage(): ReactNode {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<SourceTab>('all');

  const gamesQuery = useQuery({
    queryKey: ['games'],
    queryFn: ({ signal }) => apiGet('/api/games', GameListResponseSchema, signal)
  });
  const games = gamesQuery.data ?? [];

  // Coach-assigned focused-practice sets (Task 59.3's background job) are
  // exactly the kind of unfinished thing the "Continue" section below
  // already exists for — previously only ever surfaced on the dashboard's
  // own PracticeCard, leaving a student who came back to Games with no way
  // to see a practice set still open ("Practice ready" showing nowhere near
  // where they actually landed).
  const practiceAssignmentsQuery = usePracticeAssignments();
  const practiceAssignments = practiceAssignmentsQuery.data ?? [];

  // Feeds ImportShortcuts' "N of 10 imported today" — a separate query
  // (not derived from `games` above) since the rolling-24h count the
  // backend enforces isn't just "games with today's date" and shouldn't be
  // reimplemented client-side (see game-import.ts's getDailyImportUsage).
  const importQuotaQuery = useQuery({
    queryKey: ['import-quota'],
    queryFn: ({ signal }) => apiGet('/api/games/import-quota', ImportQuotaResponseSchema, signal)
  });

  // A row stuck on "Analyzing…" used to only ever clear on a manual reload
  // or a window-focus refetch — nothing on this page ever learned that a
  // background analysis had finished. GET /api/analyses/active (SSE) already
  // pushes every one of this user's in-progress analyses, live, to the same
  // AppShell topbar indicator (useEngineActivityIndicator) — reused here
  // rather than building a second live-status channel. It only reports
  // *in-progress* analyses, so the terminal status (ready/failed) itself
  // isn't in the frame; the moment a gameId drops out of that list is the
  // signal to refetch ['games'] once and pick up wherever it actually landed.
  const { analyses: activeAnalyses } = useActiveAnalyses();
  const previouslyActiveGameIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const currentlyActiveGameIds = new Set(activeAnalyses.map((analysis) => analysis.gameId));
    const justFinished = [...previouslyActiveGameIdsRef.current].some((gameId) => !currentlyActiveGameIds.has(gameId));
    previouslyActiveGameIdsRef.current = currentlyActiveGameIds;
    if (justFinished) void queryClient.invalidateQueries({ queryKey: ['games'] });
  }, [activeAnalyses, queryClient]);

  // Promotes to the coach tier first when the game hasn't reached it yet
  // (a game already at 'coach' — including coach_play/vs_bot, which start
  // there — skips straight to opening the session), then finds-or-creates
  // its session the same way "Continue with Coach" always has. One mutation
  // covers both the first time a game gets a coach and every time after:
  // there's no tier left to "spend" once you're there, just the same
  // session to reopen.
  const coachMutation = useMutation({
    mutationFn: async (game: GameListItem) => {
      if (!isTopReviewTier(game.reviewTier)) {
        await apiPost(`/api/games/${game.id}/promote`, { tier: 'coach' }, PromoteGameResponseSchema);
        void queryClient.invalidateQueries({ queryKey: ['games'] });
      }
      return apiPost('/api/sessions', { gameId: game.id }, SessionSummarySchema);
    },
    onSuccess: (session) => navigate(`/session/${session.id}`)
  });

  const deleteMutation = useMutation({
    mutationFn: (gameId: string) => apiDelete(`/api/games/${gameId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['games'] })
  });

  // Phase 31 stat-bank import: starts analysis for a game that was imported
  // with deferAnalysis. Invalidating ['games'] flips the row from "Not
  // analyzed" to "Analyzing…" immediately; the active-analyses effect above
  // takes it from there once the engine actually finishes.
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

  // architecture §14: a coach_play/vs_bot row already has its own live
  // session (created by POST /api/sessions/play or /api/sessions/bot) —
  // link straight back into it rather than routing through analyze mode's
  // gated POST /api/sessions, which a play-mode game never has an
  // `analyses` row for. Only ever called for a row with a `sessionId` (the
  // top "Continue" section, or an in-progress row in the list below) — a
  // ready game's Review/Coach buttons call onReview/onCoach directly
  // instead.
  function handleContinue(gameId: string): void {
    const game = games.find((candidate) => candidate.id === gameId);
    if (!game?.sessionId) return;
    if (game.source === 'coach_play') void navigate(`/session/${game.sessionId}`);
    if (game.source === 'vs_bot') void navigate(`/bot-session/${game.sessionId}`);
  }

  function handleReview(gameId: string): void {
    void navigate(`/review/${gameId}`);
  }

  function handleCoach(gameId: string): void {
    const game = games.find((candidate) => candidate.id === gameId);
    if (game) coachMutation.mutate(game);
  }

  const inProgressGames = games.filter((game) => game.sessionId !== null);
  const visibleGames = games.filter((game) => tab === 'all' || sourceGroupFor(game.source) === tab);
  const hasContinueItems = inProgressGames.length > 0 || practiceAssignments.length > 0;

  return (
    <div className="page games-page">
      <header className="games-page__header">
        <div className="games-page__heading">
          <h1>Games</h1>
          <p className="games-page__description">Review your games and continue coaching sessions.</p>
        </div>
      </header>

      <ImportShortcuts quota={importQuotaQuery.data} />

      {gamesQuery.isLoading && <p>Loading…</p>}
      {gamesQuery.isError && <p>Could not load your games.</p>}

      {gamesQuery.data && games.length === 0 && (
        <p className="games-page__empty">
          No games yet — add your first game to start a coaching session, or connect your Lichess account in
          Settings.
        </p>
      )}

      {deleteMutation.isError && <p>Could not delete that game — try again.</p>}
      {analyzeMutation.isError && <p>Could not start analysis — try again.</p>}
      {copyPgnMutation.isError && <p>Could not copy the PGN — try again.</p>}
      {coachMutation.isError && <p>Could not start a coaching session — try again.</p>}

      {hasContinueItems && (
        <section aria-label="Continue">
          <h2 className="games-page__section-heading">Continue</h2>
          <div className="games-page__list">
            {practiceAssignments.map((assignment) => (
              <PracticeContinueCard
                key={assignment.id}
                assignment={assignment}
                onContinue={(assignmentId) => navigate(`/practice/${assignmentId}`)}
              />
            ))}
            {inProgressGames.map((game) => (
              <ContinueSessionCard key={game.id} game={game} onContinue={handleContinue} />
            ))}
          </div>
        </section>
      )}

      {gamesQuery.data && games.length > 0 && (
        <>
          <h2 className="games-page__section-heading">Your games</h2>

          <div className="games-page__tabs" role="tablist" aria-label="Filter by source">
            {SOURCE_TABS.map((option) => (
              <button
                key={option.key}
                type="button"
                role="tab"
                aria-selected={tab === option.key}
                className={tab === option.key ? 'games-page__tab active' : 'games-page__tab'}
                onClick={() => setTab(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>

          {visibleGames.length === 0 ? (
            <p className="games-page__empty">Nothing in {SOURCE_TABS.find((option) => option.key === tab)?.label} yet.</p>
          ) : (
            <ul className="games-page__list">
              {visibleGames.map((game) => (
                <GameRow
                  key={game.id}
                  game={game}
                  onSelect={() => handleContinue(game.id)}
                  onReview={handleReview}
                  onCoach={handleCoach}
                  onAnalyze={(gameId) => analyzeMutation.mutate(gameId)}
                  onExportPgn={handleExportPgn}
                  onCopyPgn={(gameId) => copyPgnMutation.mutate(gameId)}
                  onDelete={(gameId) => deleteMutation.mutate(gameId)}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
