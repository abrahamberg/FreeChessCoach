import { useEffect, useState } from 'react';
import { isEngineCached } from '../engine/engine-cache.js';

/** Whether the on-device engine is already stored on this device — true after a
 * previous visit (or a background pre-download), not only after this tab started it. */
export function useEngineDownloaded(refreshKey: unknown): boolean {
  const [downloaded, setDownloaded] = useState(false);
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
