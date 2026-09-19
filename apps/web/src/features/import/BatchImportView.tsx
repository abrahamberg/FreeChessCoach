import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
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

  const candidate = candidateQuery.data?.candidate ?? null;
  // A game with nothing to coach on is not worth recommending.
  const recommended = candidate && candidate.points > 0 ? batch.games.find((game) => game.id === candidate.gameId) : undefined;

  return (
    <div className="page import-page">
      <h1>Import a game</h1>
      {result.succeeded < result.total && <BulkResultNotice result={result} />}
      <BatchAnalysisProgress rows={result.games.map(({ gameId }) => ({ gameId, game: batch.games.find((game) => game.id === gameId) }))} />
      {batch.allFinished && recommended && candidate && (
        <RecommendedGameCard
          game={recommended}
          candidate={candidate}
          onStartCoaching={() => actions.handleCoach(recommended.id)}
          onReview={() => actions.handleReview(recommended.id)}
        />
      )}
      {batch.allFinished && !recommended && !candidateQuery.isPending && <p>No standout tactics to coach on in these games.</p>}
      {actions.errorMessages.map((message) => (
        <p key={message}>{message}</p>
      ))}
      <p className="batch-import__links">
        <Link to="/games">Go to my games</Link>
        <button type="button" className="btn-secondary" onClick={onImportMore}>
          Import more games
        </button>
      </p>
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
