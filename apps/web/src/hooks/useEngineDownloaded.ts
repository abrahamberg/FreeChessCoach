import { useEffect, useState } from 'react';
import { isEngineCached } from '../engine/engine-cache.js';

/** Whether the on-device engine is already stored on this device — true after a
 * previous visit (or a background pre-download), not only after this tab started it.
 * `null` while the (async) cache lookup is still running, so callers don't
 * flash "not downloaded" on every page load before it answers. */
export function useEngineDownloaded(refreshKey: unknown): boolean | null {
  const [downloaded, setDownloaded] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    void isEngineCached().then((cached) => {
      if (!cancelled) setDownloaded(cached);
    });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);
  return downloaded;
}
