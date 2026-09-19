import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { HorizontalScroller } from '../../components/HorizontalScroller.js';
import { SearchIcon } from '../../components/Icon.js';
import { useImportQuota } from '../../hooks/useImportQuota.js';
import { AiSetupRequiredModal } from '../settings/AiSetupRequiredModal.js';
import { ContinueSessionCard } from './ContinueSessionCard.js';
import { GameCard } from './GameCard.js';
import { ImportShortcuts } from './ImportShortcuts.js';
import { PracticeAssignmentCard } from './PracticeAssignmentCard.js';
import { useGameActions } from './useGameActions.js';
import { useInProgressGames, useRecentImportedGames, useRefreshGamesWhenAnalysisFinishes } from './useGamesQueries.js';
import { usePracticeAssignments } from './usePracticeAssignments.js';
import './GamesPage.css';

/** design.md §4.1: Games (home) — an "Import games" section, then up to three
 * single-row sliding rails: Practice (coach-assigned sets, only when there
 * are any), Continue (in-progress coach/bot sessions, only when there are
 * any) and Recently imported (the last 15 imports, with a "Find game" link
 * to the full searchable list). Owns fetching (AGENTS.md rule 7); the cards
 * are presentational. */
export function GamesPage(): ReactNode {
  const navigate = useNavigate();

  const inProgressQuery = useInProgressGames();
  const recentQuery = useRecentImportedGames();
  const practiceQuery = usePracticeAssignments();
  const inProgressGames = inProgressQuery.data ?? [];
  const recentGames = recentQuery.data?.items ?? [];
  const practiceAssignments = practiceQuery.data ?? [];

  // Feeds ImportShortcuts' "N of 30 imported today" — the rolling-24h count
  // the backend enforces, not "games with today's date".
  const importQuotaQuery = useImportQuota();

  useRefreshGamesWhenAnalysisFinishes();
  const actions = useGameActions([...inProgressGames, ...recentGames]);

  const hasNoGames = recentQuery.isSuccess && recentGames.length === 0 && inProgressGames.length === 0;

  return (
    <div className="page games-page">
      <ImportShortcuts quota={importQuotaQuery.data?.daily} />

      {recentQuery.isLoading && <p>Loading…</p>}
      {recentQuery.isError && <p>Could not load your games.</p>}
      {actions.errorMessages.map((message) => (
        <p key={message}>{message}</p>
      ))}

      {hasNoGames && (
        <p className="games-page__empty">
          No games yet — add your first game to start a coaching session, or connect your Lichess account in
          Settings.
        </p>
      )}

      {practiceAssignments.length > 0 && (
        <section aria-label="Practice" className="games-page__section">
          <h2 className="games-page__section-heading">Practice</h2>
          <HorizontalScroller label="Practice sets">
            {practiceAssignments.map((assignment) => (
              <PracticeAssignmentCard
                key={assignment.id}
                assignment={assignment}
                onStart={(assignmentId) => navigate(`/practice/${assignmentId}`)}
              />
            ))}
          </HorizontalScroller>
        </section>
      )}

      {inProgressGames.length > 0 && (
        <section aria-label="Continue" className="games-page__section">
          <h2 className="games-page__section-heading">Continue</h2>
          <HorizontalScroller label="Games in progress">
            {inProgressGames.map((game) => (
              <ContinueSessionCard
                key={game.id}
                game={game}
                onContinue={actions.handleContinue}
                onDelete={actions.handleDelete}
              />
            ))}
          </HorizontalScroller>
        </section>
      )}

      {recentGames.length > 0 && (
        <section aria-label="Recently imported" className="games-page__section">
          <div className="games-page__section-header">
            <h2 className="games-page__section-heading">Recently imported</h2>
            <Link to="/games/find" className="btn-secondary games-page__find">
              <SearchIcon width={16} height={16} />
              Find game
            </Link>
          </div>
          <HorizontalScroller label="Recently imported games">
            {recentGames.map((game) => (
              <GameCard
                key={game.id}
                game={game}
                onSelect={actions.handleContinue}
                onReview={actions.handleReview}
                onCoach={actions.handleCoach}
                onAnalyze={actions.handleAnalyze}
                onDelete={actions.handleDelete}
              />
            ))}
          </HorizontalScroller>
        </section>
      )}

      {actions.aiSetupPrompt && (
        <AiSetupRequiredModal
          onClose={actions.aiSetupPrompt.onClose}
          onGoToSettings={actions.aiSetupPrompt.onGoToSettings}
          onAnalyzeInstead={actions.aiSetupPrompt.onAnalyzeInstead}
        />
      )}
    </div>
  );
}
