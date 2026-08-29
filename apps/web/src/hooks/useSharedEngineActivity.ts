import { useEffect, useState } from 'react';
import { getSharedEngineWorker } from '../engine/shared-engine-worker-instance.js';
import type { EngineActivity } from '../engine/shared-engine-worker.js';

/** Tracks the shared WASM engine's live search activity (Explore panel, or —
 * in browser engine mode — tunnel fulfillment) for the global engine-activity
 * indicator. Distinct from useEngineStatus, which only reports the one-time
 * install/download state: that reads 'ready' whether the engine is idle or
 * mid-search, so it can't answer "is it doing anything right now" on its
 * own. */
export function useSharedEngineActivity(): EngineActivity {
  const [activity, setActivity] = useState<EngineActivity>(() => getSharedEngineWorker().activity);

  useEffect(() => getSharedEngineWorker().subscribeActivity(setActivity), []);

  return activity;
}
