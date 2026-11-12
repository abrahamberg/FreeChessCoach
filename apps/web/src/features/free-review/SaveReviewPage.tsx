import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AnalysisProgress } from '../import/AnalysisProgress.js';
import { ImportErrorNotice } from '../import/ImportErrorNotice.js';
import { fensOf, START_FEN } from '../import/pgn-positions.js';
import { useSingleImport } from '../import/useSingleImport.js';
import { clearPendingSave, readPendingSave } from './pending-save.js';

/**
 * `/save-review`: where Google sign-in from the end of a free review comes
 * back to. It imports the game the visitor just reviewed through the normal
 * import (the account's quota applies), waits for its analysis and opens the
 * saved review at `/review/:gameId`. The game was kept in this tab's storage
 * across the sign-in (pending-save.ts) and is dropped once it is sent.
 */
export function SaveReviewPage(): ReactNode {
  const [request] = useState(() => readPendingSave());
  const single = useSingleImport();
  const started = useRef(false);

  useEffect(() => {
    if (!request || started.current) return;
    started.current = true;
    clearPendingSave();
    single.start(request, 'review', { countsAsReview: false });
  }, [request, single]);

  const retry = (): void => {
    if (!request) return;
    single.retry();
    single.start(request, 'review', { countsAsReview: false });
  };

  if (!request) {
    return (
      <div className="page">
        <h1>Save a review</h1>
        <p>There is no reviewed game waiting to be saved in this tab.</p>
        <p>
          <Link to="/import">Import a game</Link> or <Link to="/games">open your games</Link>.
        </p>
      </div>
    );
  }

  const positions = fensOf(request.pgn);
  return (
    <div className="page">
      <h1>Saving your game</h1>
      {single.importError ? (
        <>
          <ImportErrorNotice error={single.importError} />
          <p>
            <Link to="/games">Open your games</Link>
          </p>
        </>
      ) : (
        <AnalysisProgress
          status={single.progress?.status ?? null}
          finalFen={positions.at(-1) ?? START_FEN}
          onRetry={retry}
          error={single.progress?.error}
          analyzedPositions={single.progress?.analyzedPositions}
          totalPositions={positions.length}
          positions={positions}
        />
      )}
    </div>
  );
}
