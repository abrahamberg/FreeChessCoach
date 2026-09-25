import type { ReactNode } from 'react';
import { getSharedEngineWorker } from '../engine/shared-engine-worker-instance.js';
import { useEngineDownloaded } from '../hooks/useEngineDownloaded.js';
import type { UseEngineStatusResult } from '../hooks/useEngineStatus.js';
import './BrowserEngineStatus.css';

// The full-net WASM build (see engine/shared-engine-worker.ts); shown until the
// download reports its real total.
const ENGINE_DOWNLOAD_MB = 108;

function formatMb(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

/** Says whether the on-device engine is downloaded, downloading or still to be
 * downloaded — and, in the last case, offers the download. Nothing here starts
 * a download on its own. */
export function BrowserEngineStatus({ engine }: { engine: UseEngineStatusResult }): ReactNode {
  const { status, progress } = engine;
  const stored = useEngineDownloaded(status);
  const size = progress && progress.total > 0 ? formatMb(progress.total) : `about ${ENGINE_DOWNLOAD_MB} MB`;

  if (status === 'ready' || (stored && status !== 'installing')) {
    return <p className="engine-dl engine-dl--ready" role="status">✓ Downloaded on this device ({size}) — ready to use</p>;
  }
  if (status === 'installing') {
    const percent = progress ? Math.round(progress.percent * 100) : 0;
    return (
      <div className="engine-dl" role="status">
        <p>
          Downloading the engine… {percent}%{progress && progress.total > 0 && ` (${formatMb(progress.loaded)} of ${size})`}
          {progress?.speedText && ` · ${progress.speedText}`}
          {progress?.etaText && ` · ${progress.etaText} left`}
        </p>
        <progress value={percent} max={100} aria-label="Engine download progress" />
      </div>
    );
  }
  return (
    <div className="engine-dl engine-dl--missing" role="status">
      <p>Not downloaded yet. To run on your device, the engine ({size}) must be downloaded once — it then stays on this device.</p>
      <button type="button" className="btn-secondary" onClick={() => getSharedEngineWorker().preload()}>
        Download engine ({size})
      </button>
    </div>
  );
}
