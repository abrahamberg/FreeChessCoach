import { useEffect, useState } from 'react';

/** Date.now() that re-renders the caller every `intervalMs` while `active` —
 * how a running step's elapsed time keeps counting up between polls. Inactive,
 * it sets no timer at all. */
export function useTickingNow(active: boolean, intervalMs = 200): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [active, intervalMs]);

  return now;
}
