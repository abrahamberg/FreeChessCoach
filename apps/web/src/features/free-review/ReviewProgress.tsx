import { useEffect, useState, type ReactNode } from 'react';
import type { EngineDownloadProgress } from '../../engine/shared-engine-worker.js';
import { getSharedEngineWorker } from '../../engine/shared-engine-worker-instance.js';

export interface ReviewProgressProps {
  /** Positions of the game the engine has looked at, and their total. */
  done: number;
  total: number;
  onCancel: () => void;
}

/** What the visitor waits for: the engine's first download, then the moves. */
export function ReviewProgress({ done, total, onCancel }: ReviewProgressProps): ReactNode {
  const download = useEngineDownload();
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="free-review__progress" aria-live="polite">
      {download ? (
        <>
          <p>Downloading the chess engine to your browser, once: {Math.round(download.percent)}%</p>
          <progress max={100} value={download.percent} />
        </>
      ) : (
        <>
          <p>{total > 0 ? `Reviewing your game: ${done} of ${total} positions` : 'Starting the engine…'}</p>
          <progress max={100} value={percent} />
        </>
      )}
      <button type="button" className="btn-secondary" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

function useEngineDownload(): EngineDownloadProgress | null {
  const [progress, setProgress] = useState<EngineDownloadProgress | null>(null);
  useEffect(() => getSharedEngineWorker().subscribeProgress(setProgress), []);
  return progress;
}
