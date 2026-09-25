import { useEffect, useState, type ReactNode } from 'react';
import { clearRateLimitNotice, useRateLimitedUntil } from '../api/rate-limit-notice.js';
import './RateLimitNotice.css';

/** A non-blocking "slow down" toast shown when the api answers 429, from any
 * request (engine, hints, imports, coach, voice). Counts down to the moment
 * the limit resets and then hides itself; nothing else in the app has to
 * handle a 429 to make it visible. */
export function RateLimitNotice(): ReactNode {
  const until = useRateLimitedUntil();
  const secondsLeft = useSecondsUntil(until);

  if (until === null || secondsLeft <= 0) return null;
  return (
    <div className="rate-limit-notice" role="status" aria-live="polite">
      <div className="rate-limit-notice__text">
        <strong>Slow down a little</strong>
        <span>
          You're sending requests faster than we allow. Some things may not load for {secondsLeft}{' '}
          {secondsLeft === 1 ? 'second' : 'seconds'}.
        </span>
      </div>
      <button type="button" className="rate-limit-notice__close" aria-label="Dismiss" onClick={clearRateLimitNotice}>
        ×
      </button>
    </div>
  );
}

function useSecondsUntil(until: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until === null) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [until]);
  return until === null ? 0 : Math.ceil((until - now) / 1000);
}
