import { useState, type ReactNode } from 'react';
import { useTickingNow } from '../session/useTickingNow.js';
import './KickoffProgress.css';

export interface KickoffProgressProps {
  facts: string[];
  /** Accessible name for the whole loader, e.g. "Studying your game…". */
  label: string;
}

const FACT_INTERVAL_MS = 1800;
/** Past this, say why it's slow: a local model can take a couple of minutes. */
const SLOW_HINT_AFTER_MS = 45_000;

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** The kickoff turn's loader: reveals facts about this game one by one as
 * checked steps, then keeps a final "coach is planning" step running with an
 * elapsed timer until the first token arrives (useCoachChat's
 * `thinkingLabel` doc comment explains why that wait is long). */
export function KickoffProgress({ facts, label }: KickoffProgressProps): ReactNode {
  const [startedAt] = useState(() => Date.now());
  const now = useTickingNow(true, 500);
  const elapsed = Math.max(0, now - startedAt);
  const revealed = Math.min(facts.length, Math.floor(elapsed / FACT_INTERVAL_MS) + 1);
  const isPlanning = elapsed >= facts.length * FACT_INTERVAL_MS;

  return (
    <div className="kickoff-progress" role="status" aria-label={label}>
      <ul className="kickoff-progress__steps">
        {facts.slice(0, revealed).map((fact) => (
          <li key={fact} className="kickoff-progress__step kickoff-progress__step--done">
            <span className="kickoff-progress__mark" aria-hidden="true">
              ✓
            </span>
            {fact}
          </li>
        ))}
        {isPlanning && (
          <li className="kickoff-progress__step kickoff-progress__step--running">
            <span className="kickoff-progress__spinner" aria-hidden="true" />
            <span>Your coach is planning the lesson</span>
            <span className="kickoff-progress__elapsed">{formatElapsed(elapsed)}</span>
          </li>
        )}
      </ul>
      {elapsed >= SLOW_HINT_AFTER_MS && (
        <p className="kickoff-progress__hint">
          The first reply takes the longest. A local AI can take a couple of minutes.
        </p>
      )}
    </div>
  );
}
