import { useEffect, useRef, useState, type ReactNode } from 'react';
import './ClockDisplay.css';

export interface ClockDisplayProps {
  whiteRemainingMs: number;
  blackRemainingMs: number;
  /** Whose clock is actually ticking right now — the side whose turn it is. */
  activeColor: 'white' | 'black';
  /** Date.now() when whiteRemainingMs/blackRemainingMs were last known
   * server-authoritative — the displayed time counts down from these values
   * by wall-clock time elapsed since then, entirely client-side. */
  anchoredAt: number;
  /** Fires once when the active side's displayed time reaches 0 — the
   * caller (useBotSessionPageData) calls the claim-timeout endpoint, which
   * re-verifies against real server timestamps before ending the game. */
  onExpire: () => void;
}

const LOW_TIME_THRESHOLD_MS = 20_000;

function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function sideClassName(isActive: boolean, isLow: boolean): string {
  return ['clock-display__side', isActive ? 'is-active' : null, isLow ? 'is-low' : null].filter(Boolean).join(' ');
}

/** A lichess/chess.com-style two-clock display for a timed play_bot game.
 * Ticks purely client-side between moves — see bot-claim-timeout.ts for why
 * the server, not this component, is what actually enforces a flag fall. */
export function ClockDisplay({ whiteRemainingMs, blackRemainingMs, activeColor, anchoredAt, onExpire }: ClockDisplayProps): ReactNode {
  const [, setTick] = useState(0);
  const hasExpiredRef = useRef(false);

  useEffect(() => {
    hasExpiredRef.current = false;
    const interval = setInterval(() => setTick((value) => value + 1), 250);
    return () => clearInterval(interval);
  }, [anchoredAt, activeColor]);

  const elapsedSinceAnchor = Date.now() - anchoredAt;
  const displayedWhiteMs = activeColor === 'white' ? Math.max(0, whiteRemainingMs - elapsedSinceAnchor) : whiteRemainingMs;
  const displayedBlackMs = activeColor === 'black' ? Math.max(0, blackRemainingMs - elapsedSinceAnchor) : blackRemainingMs;

  useEffect(() => {
    const activeRemainingMs = activeColor === 'white' ? displayedWhiteMs : displayedBlackMs;
    if (activeRemainingMs <= 0 && !hasExpiredRef.current) {
      hasExpiredRef.current = true;
      onExpire();
    }
  });

  return (
    <div className="clock-display">
      <div className={sideClassName(activeColor === 'black', displayedBlackMs <= LOW_TIME_THRESHOLD_MS)}>
        <span className="clock-display__label">Black</span>
        <span className="clock-display__time">{formatClock(displayedBlackMs)}</span>
      </div>
      <div className={sideClassName(activeColor === 'white', displayedWhiteMs <= LOW_TIME_THRESHOLD_MS)}>
        <span className="clock-display__label">White</span>
        <span className="clock-display__time">{formatClock(displayedWhiteMs)}</span>
      </div>
    </div>
  );
}
