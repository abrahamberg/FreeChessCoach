import { useEffect, useState } from 'react';
import { getSharedLiteEngineWorker } from '../engine/shared-engine-worker-instance.js';
import type { EngineActivity } from '../engine/shared-engine-worker.js';

/** Same shape as useSharedEngineActivity.ts, but for the lightweight
 * worker — tracks live search activity for JIT bot-play hints, never mixed
 * with the full worker's own activity (Explore panel / tunnel 'main'
 * fulfillment). */
export function useSharedLiteEngineActivity(): EngineActivity {
  const [activity, setActivity] = useState<EngineActivity>(() => getSharedLiteEngineWorker().activity);

  useEffect(() => getSharedLiteEngineWorker().subscribeActivity(setActivity), []);

  return activity;
}
