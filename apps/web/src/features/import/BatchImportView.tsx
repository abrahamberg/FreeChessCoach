import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRightIcon, CheckIcon, PlusIcon } from '../../components/Icon.js';
import { AiSetupRequiredModal } from '../settings/AiSetupRequiredModal.js';
import { useGameActions } from '../games/useGameActions.js';
import { BatchAnalysisProgress } from './BatchAnalysisProgress.js';
import { BulkResultNotice } from './BulkResultNotice.js';
import { RecommendedGameCard } from './RecommendedGameCard.js';
import type { BulkResult } from './RemoteImportPanel.js';
import { useBatchGames } from './useBatchGames.js';
import { useCoachingCandidate } from './useCoachingCandidate.js';

export interface BatchImportViewProps {
  result: BulkResult;
  onImportMore: () => void;
}

/** What follows a batch import: per-game analysis progress, then — once every
 * game has finished — the most tactical one offered for coaching. Composes
 * the polling/candidate hooks with presentational children (AGENTS rule 7). */
export function BatchImportView({ result, onImportMore }: BatchImportViewProps): ReactNode {
  const gameIds = result.games.map((game) => game.gameId);
  const batch = useBatchGames(gameIds);
  const candidateQuery = useCoachingCandidate(gameIds, batch.allFinished);
  const actions = useGameActions(batch.games);
  const navigate = useNavigate();

  const candidate = candidateQuery.data?.candidate ?? null;
  // A game with nothing to coach on is not worth recommending.
  const recommended =
    candidate && candidate.points > 0 ? batch.games.find((game) => game.id === candidate.gameId) : undefined;

  return (
    <div className="page import-page">
      <h1>Import a game</h1>
      {!batch.allFinished && (
        <p className="import-page__keep-open" role="note">
          Don&apos;t close this tab while your games are being analyzed. You can switch to another tab.
        </p>
      )}
      {result.succeeded < result.total && <BulkResultNotice result={result} />}
      {batch.allFinished ? (
        <p className="batch-import__done" role="status">
          <CheckIcon width={18} height={18} />
          {result.games.length === 1 ? 'Your game is analyzed.' : `All ${result.games.length} games are analyzed.`}
        </p>
      ) : (
        <BatchAnalysisProgress
          rows={result.games.map(({ gameId }) => ({ gameId, game: batch.games.find((game) => game.id === gameId) }))}
        />
      )}
      {batch.allFinished && recommended && candidate && (
        <RecommendedGameCard
          game={recommended}
          candidate={candidate}
          onStartCoaching={() => actions.handleCoach(recommended.id)}
          onReview={() => actions.handleReview(recommended.id)}
        />
      )}
      {batch.allFinished && !recommended && !candidateQuery.isPending && (
        <p>No standout tactics to coach on in these games.</p>
      )}
      {actions.errorMessages.map((message) => (
        <p key={message}>{message}</p>
      ))}
      <div className="batch-import__actions">
        <button type="button" className="btn-secondary" onClick={onImportMore}>
          <PlusIcon width={18} height={18} />
          Import more games
        </button>
        <button type="button" className="btn-primary" onClick={() => navigate('/games')}>
          Go to my games
          <ArrowRightIcon width={18} height={18} />
        </button>
      </div>
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
