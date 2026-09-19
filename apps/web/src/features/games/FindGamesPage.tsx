import {
  DeleteEarliestImportedResponseSchema,
  MAX_DELETE_EARLIEST_IMPORTED,
  type StatsRange
} from '@freechesscoach/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { apiPost } from '../../api/client.js';
import { ConfirmDialog } from '../../components/ConfirmDialog.js';
import { ArrowLeftIcon, TrashIcon } from '../../components/Icon.js';
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll.js';
import { AiSetupRequiredModal } from '../settings/AiSetupRequiredModal.js';
import { GameRow } from './GameRow.js';
import { RATING_BANDS } from './ratingBands.js';
import { useGameActions } from './useGameActions.js';
import { useRefreshGamesWhenAnalysisFinishes } from './useGamesQueries.js';
import { useImportedGamesList } from './useImportedGamesList.js';
import './FindGamesPage.css';
import './GamesPage.css';

const RANGE_OPTIONS: { value: StatsRange; label: string }[] = [
  { value: 'last7', label: 'Last 7 days' },
  { value: 'last30', label: 'Last 30 days' },
  { value: 'last365', label: 'Last year' },
  { value: 'all', label: 'All time' }
];

/** Find game: the full list of imported games, 20 at a time — the next 20
 * load (behind a spinner) as the student scrolls to the bottom. Filterable
 * by when the game was imported/played and by its estimated rating, with a
 * bulk "delete earliest 50" for clearing out old imports. Owns fetching
 * (AGENTS.md rule 7); GameRow is presentational. */
export function FindGamesPage(): ReactNode {
  const queryClient = useQueryClient();
  const [range, setRange] = useState<StatsRange>('all');
  const [ratingBandKey, setRatingBandKey] = useState('any');
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);

  const listQuery = useImportedGamesList({ range, ratingBandKey });
  const games = listQuery.data?.pages.flatMap((page) => page.items) ?? [];

  useRefreshGamesWhenAnalysisFinishes();
  const actions = useGameActions(games);

  const sentinelRef = useInfiniteScroll(
    listQuery.hasNextPage && !listQuery.isFetchingNextPage,
    games.length,
    () => void listQuery.fetchNextPage()
  );

  const bulkDeleteMutation = useMutation({
    mutationFn: () =>
      apiPost(
        '/api/games/imported/delete-earliest',
        { count: MAX_DELETE_EARLIEST_IMPORTED },
        DeleteEarliestImportedResponseSchema
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['games'] })
  });

  return (
    <div className="page games-page find-games-page">
      <Link to="/games" className="find-games-page__back">
        <ArrowLeftIcon width={16} height={16} />
        Games
      </Link>

      <header className="find-games-page__header">
        <h1>Find game</h1>
        <button type="button" className="btn-destructive" onClick={() => setConfirmingBulkDelete(true)}>
          <TrashIcon width={16} height={16} />
          Delete earliest {MAX_DELETE_EARLIEST_IMPORTED}
        </button>
      </header>

      <div className="find-games-page__filters">
        <div className="find-games-page__toggle" role="group" aria-label="Time range">
          {RANGE_OPTIONS.map((option) => (
            <button key={option.value} type="button" aria-pressed={range === option.value} onClick={() => setRange(option.value)}>
              {option.label}
            </button>
          ))}
        </div>
        <label className="find-games-page__rating">
          <span>Estimated rating</span>
          <select value={ratingBandKey} onChange={(event) => setRatingBandKey(event.target.value)}>
            {RATING_BANDS.map((band) => (
              <option key={band.key} value={band.key}>
                {band.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {bulkDeleteMutation.isError && <p>Could not delete those games — try again.</p>}
      {bulkDeleteMutation.isSuccess && (
        <p role="status">
          Deleted {bulkDeleteMutation.data.deleted} {bulkDeleteMutation.data.deleted === 1 ? 'game' : 'games'}.
        </p>
      )}
      {actions.errorMessages.map((message) => (
        <p key={message}>{message}</p>
      ))}

      {listQuery.isLoading && <p>Loading…</p>}
      {listQuery.isError && <p>Could not load your games.</p>}
      {listQuery.isSuccess && games.length === 0 && (
        <p className="games-page__empty">No imported games match these filters.</p>
      )}

      {games.length > 0 && (
        <ul className="games-page__list">
          {games.map((game) => (
            <GameRow
              key={game.id}
              game={game}
              onSelect={actions.handleContinue}
              onReview={actions.handleReview}
              onCoach={actions.handleCoach}
              onAnalyze={actions.handleAnalyze}
              onExportPgn={actions.handleExportPgn}
              onCopyPgn={actions.handleCopyPgn}
              onDelete={actions.handleDelete}
            />
          ))}
        </ul>
      )}

      <div ref={sentinelRef} className="find-games-page__sentinel">
        {listQuery.isFetchingNextPage && (
          <p role="status" className="find-games-page__loader">
            <span className="find-games-page__spinner" aria-hidden="true" />
            Loading more games…
          </p>
        )}
      </div>

      {confirmingBulkDelete && (
        <ConfirmDialog
          title={`Delete your ${MAX_DELETE_EARLIEST_IMPORTED} earliest games?`}
          description={
            <p>
              This deletes the {MAX_DELETE_EARLIEST_IMPORTED} games you imported first (or all of them, if you have
              fewer), together with their analyses and any coaching sessions. This cannot be undone.
            </p>
          }
          confirmLabel={`Delete ${MAX_DELETE_EARLIEST_IMPORTED} games`}
          onCancel={() => setConfirmingBulkDelete(false)}
          onConfirm={() => {
            setConfirmingBulkDelete(false);
            bulkDeleteMutation.mutate();
          }}
        />
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
