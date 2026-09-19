import { useEffect, useRef, type RefObject } from 'react';

/** Calls `onReachEnd` whenever the returned sentinel element scrolls into
 * view (with a small lead so the next page starts loading just before the
 * user hits the bottom). The observer is recreated when `itemCount`
 * changes: an IntersectionObserver only fires on *changes*, so without that
 * a sentinel that's still on screen after a page loads (a tall window, few
 * rows) would never trigger the next page. No-op where IntersectionObserver
 * doesn't exist (jsdom). */
export function useInfiniteScroll(enabled: boolean, itemCount: number, onReachEnd: () => void): RefObject<HTMLDivElement | null> {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const onReachEndRef = useRef(onReachEnd);
  onReachEndRef.current = onReachEnd;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!enabled || !sentinel || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onReachEndRef.current();
      },
      { rootMargin: '200px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [enabled, itemCount]);

  return sentinelRef;
}
