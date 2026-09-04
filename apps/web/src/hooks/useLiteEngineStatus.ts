import { useEffect, useState } from 'react';
import { getSharedLiteEngineWorker } from '../engine/shared-engine-worker-instance.js';
import type { EngineDownloadProgress, EngineInstallStatus } from '../engine/shared-engine-worker.js';

export interface UseLiteEngineStatusOptions {
  /** Start the download immediately rather than waiting for the first hint
   * to need it — used by the JIT bot-play hint panel so "engine not loaded
   * yet" has something to resolve toward as soon as it's shown. */
  preload?: boolean;
}

export interface UseLiteEngineStatusResult {
  status: EngineInstallStatus;
  progress: EngineDownloadProgress | null;
}

/** Same shape as useEngineStatus.ts, but for the second, lightweight
 * (`-lite-single`) worker — see shared-engine-worker-instance.ts's
 * getSharedLiteEngineWorker. Kept as its own hook (not a `variant` param on
 * useEngineStatus) since the two workers' install/activity state are
 * genuinely independent processes, not one worker in two modes. */
export function useLiteEngineStatus(options: UseLiteEngineStatusOptions = {}): UseLiteEngineStatusResult {
  const [status, setStatus] = useState<EngineInstallStatus>(() => getSharedLiteEngineWorker().status);
  const [progress, setProgress] = useState<EngineDownloadProgress | null>(() => getSharedLiteEngineWorker().progress);
  const preload = options.preload ?? false;

  useEffect(() => {
    const engine = getSharedLiteEngineWorker();
    const unsubscribeStatus = engine.subscribe(setStatus);
    const unsubscribeProgress = engine.subscribeProgress(setProgress);
    if (preload) engine.preload();
    return () => {
      unsubscribeStatus();
      unsubscribeProgress();
    };
  }, [preload]);

  return { status, progress };
}
